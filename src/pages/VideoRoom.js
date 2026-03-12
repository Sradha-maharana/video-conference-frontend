import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import {
  Box,
  Button,
  IconButton,
  Paper,
  TextField,
  Typography,
  AppBar,
  Toolbar,
  Drawer,
  List,
  ListItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Badge
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ChatIcon from '@mui/icons-material/Chat';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import LinkIcon from '@mui/icons-material/Link';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';

import { SOCKET_URL } from '../config';

function VideoRoom({ user }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [peers, setPeers] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [roomStatus, setRoomStatus] = useState('connecting'); // connecting | waiting | approved | denied
  const [isHost, setIsHost] = useState(false);
  const [admissionRequests, setAdmissionRequests] = useState([]); // [{ socketId, userName }]

  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);
  const screenStreamRef = useRef();
  const userStreamRef = useRef();

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        userStreamRef.current = stream;
        // ✅ Don't attach to DOM here — userVideo may not be mounted yet (waiting screen)
        // Attachment is handled by a separate useEffect below

        socketRef.current.emit('join-room', {
          roomId,
          userId: user.id,
          userName: user.name
        });

        // Approved to join (host gets this immediately, others after host admits)
        socketRef.current.on('join-approved', () => {
          setRoomStatus('approved');
        });

        // Waiting for host to admit
        socketRef.current.on('waiting-for-approval', () => {
          setRoomStatus('waiting');
        });

        // Host denied entry
        socketRef.current.on('join-denied', () => {
          setRoomStatus('denied');
        });

        // Become host (e.g. original host left)
        socketRef.current.on('you-are-host', () => {
          setIsHost(true);
        });

        // Someone is knocking — show admit/deny popup to host
        socketRef.current.on('admission-request', ({ socketId, userName }) => {
          setAdmissionRequests(prev => [...prev, { socketId, userName }]);
        });

        // New joiner receives list of existing users and initiates peer connections to each
        socketRef.current.on('existing-users', users => {
          const newPeers = [];
          users.forEach(existingUser => {
            if (existingUser.socketId === socketRef.current.id) return;

            const peer = createPeer(existingUser.socketId, socketRef.current.id, stream);
            peersRef.current.push({
              peerID: existingUser.socketId,
              peer,
              userName: existingUser.userName
            });
            newPeers.push({
              peerID: existingUser.socketId,
              peer,
              userName: existingUser.userName
            });
          });
          setPeers(newPeers);
        });

        // Existing peer receives signal from new joiner and responds
        // ✅ Fixed: userName is now the caller's name (who is joining)
        // ✅ Fixed: duplicate peer guard added
        socketRef.current.on('user-connected', ({ signal, socketId, userName }) => {
          const alreadyExists = peersRef.current.find(p => p.peerID === socketId);
          if (alreadyExists) return;

          const peer = addPeer(signal, socketId, stream);
          peersRef.current.push({ peerID: socketId, peer, userName });
          setPeers(users => [...users, { peerID: socketId, peer, userName }]);
        });

        // New joiner receives responses from existing peers to complete handshake
        socketRef.current.on('receiving-returned-signal', payload => {
          const item = peersRef.current.find(p => p.peerID === payload.id);
          if (item && item.peer && !item.peer.destroyed) {
            item.peer.signal(payload.signal);
          }
        });

        socketRef.current.on('user-disconnected', ({ socketId }) => {
          const peerObj = peersRef.current.find(p => p.peerID === socketId);
          // ✅ Only destroy if not already destroyed to avoid abort errors
          if (peerObj && !peerObj.peer.destroyed) {
            peerObj.peer.destroy();
          }
          peersRef.current = peersRef.current.filter(p => p.peerID !== socketId);
          setPeers(prev => prev.filter(p => p.peerID !== socketId));
        });

        socketRef.current.on('chat-history', history => {
          setMessages(history);
        });

        // ✅ Fixed: only fires for OTHER participants (server uses socket.to)
        socketRef.current.on('new-message', message => {
          setMessages(prev => [...prev, message]);
          setUnreadCount(prev => prev + 1);
        });
      })
      .catch(err => {
        console.error('Error accessing media devices:', err);
        alert('Please allow camera and microphone access');
      });

    return () => {
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, user]);

  // Clear unread count when chat is opened
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  // ✅ Attach local stream to video element once approved and DOM is ready
  useEffect(() => {
    if (roomStatus === 'approved' && userVideo.current && userStreamRef.current) {
      userVideo.current.srcObject = userStreamRef.current;
    }
  }, [roomStatus]);

  function createPeer(userToSignal, callerID, stream) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', signal => {
      socketRef.current.emit('sending-signal', { userToSignal, callerID, signal });
    });

    // ✅ Suppress "User-Initiated Abort / Close called" errors on disconnect
    peer.on('error', err => {
      console.warn('Peer connection error (createPeer):', err.message);
    });

    return peer;
  }

  function addPeer(incomingSignal, callerID, stream) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', signal => {
      socketRef.current.emit('returning-signal', { signal, callerID });
    });

    // ✅ Suppress "User-Initiated Abort / Close called" errors on disconnect
    peer.on('error', err => {
      console.warn('Peer connection error (addPeer):', err.message);
    });

    peer.signal(incomingSignal);
    return peer;
  }

  const toggleAudio = () => {
    if (userStreamRef.current) {
      const audioTrack = userStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setAudioEnabled(audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (userStreamRef.current) {
      const videoTrack = userStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
      // ✅ Re-attach stream so video element reflects mute state correctly
      if (userVideo.current) {
        userVideo.current.srcObject = userStreamRef.current;
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        peersRef.current.forEach(({ peer }) => {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        screenTrack.onended = () => stopScreenShare();
        setScreenSharing(true);
      } catch (err) {
        console.error('Error sharing screen:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());

      const originalTrack = userStreamRef.current.getVideoTracks()[0];
      originalTrack.enabled = videoEnabled;

      peersRef.current.forEach(({ peer }) => {
        const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(originalTrack);
      });

      // ✅ Reattach original stream to local video element
      if (userVideo.current) {
        userVideo.current.srcObject = userStreamRef.current;
      }
    }
    setScreenSharing(false);
  };

  const leaveRoom = () => {
    if (userStreamRef.current) {
      userStreamRef.current.getTracks().forEach(track => track.stop());
    }
    navigate('/dashboard');
  };

  const sendMessage = () => {
    if (newMessage.trim()) {
      const msg = {
        userName: user.name,
        message: newMessage,
        timestamp: new Date().toISOString()
      };

      // ✅ Fixed: add locally for sender; server broadcasts to others only
      setMessages(prev => [...prev, msg]);

      socketRef.current.emit('send-message', {
        roomId,
        message: newMessage,
        userName: user.name
      });
      setNewMessage('');
    }
  };

  const admitUser = (socketId) => {
    socketRef.current.emit('admit-user', { roomId, socketId });
    setAdmissionRequests(prev => prev.filter(r => r.socketId !== socketId));
  };

  const denyUser = (socketId) => {
    socketRef.current.emit('deny-user', { roomId, socketId });
    setAdmissionRequests(prev => prev.filter(r => r.socketId !== socketId));
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getMeetingLink = () => {
    return `${window.location.origin}/room/${roomId}`;
  };

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(getMeetingLink());
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareMeetingLink = async () => {
    const link = getMeetingLink();
    // Use native share sheet on mobile if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Collab Space meeting',
          text: `Join my video meeting on Collab Space. Room code: ${roomId}`,
          url: link,
        });
      } catch (err) {
        // User cancelled share or not supported — fall back to copy
        copyMeetingLink();
      }
    } else {
      copyMeetingLink();
    }
  };

  // Waiting screen
  if (roomStatus === 'waiting') {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#121212', gap: 3 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PersonIcon sx={{ fontSize: 36, color: 'white' }} />
        </Box>
        <Typography variant="h5" color="white">Waiting to be admitted</Typography>
        <Typography variant="body2" color="grey.500">The host will let you in soon</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', animation: 'pulse 1.5s infinite' }} />
          <Typography variant="caption" color="grey.500">Room: {roomId}</Typography>
        </Box>
        <Button variant="outlined" color="error" onClick={() => navigate('/dashboard')} sx={{ mt: 2 }}>
          Cancel
        </Button>
      </Box>
    );
  }

  // Denied screen
  if (roomStatus === 'denied') {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#121212', gap: 3 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'error.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon sx={{ fontSize: 36, color: 'white' }} />
        </Box>
        <Typography variant="h5" color="white">Entry Denied</Typography>
        <Typography variant="body2" color="grey.500">The host did not admit you to this meeting</Typography>
        <Button variant="contained" onClick={() => navigate('/dashboard')} sx={{ mt: 2 }}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#000', overflow: 'hidden' }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'white', fontSize: { xs: 14, sm: 20 } }}>
            Room: {roomId}
          </Typography>

          {/* Copy room code */}
          <Button
            variant="outlined"
            size="small"
            onClick={copyRoomId}
            startIcon={<ContentCopyIcon />}
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', fontSize: 12 }}
          >
            {copied ? 'Copied!' : 'Code'}
          </Button>

          {/* Share meeting link */}
          <Button
            variant="contained"
            size="small"
            onClick={shareMeetingLink}
            startIcon={<ShareIcon />}
            color="primary"
            sx={{ fontSize: 12 }}
          >
            {linkCopied ? 'Link Copied!' : 'Share Link'}
          </Button>

          <Chip label={`${peers.length + 1} participant${peers.length !== 0 ? 's' : ''}`} color="primary" size="small" />
        </Toolbar>

        {/* Meeting link banner — shown on create so host can easily copy/share */}
        {peers.length === 0 && (
          <Box sx={{
            px: 2, py: 1,
            bgcolor: 'rgba(33,150,243,0.15)',
            borderTop: '1px solid rgba(33,150,243,0.3)',
            display: 'flex', alignItems: 'center', gap: 1
          }}>
            <LinkIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="caption" sx={{ color: 'grey.300', flexGrow: 1, wordBreak: 'break-all' }}>
              {typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : ''}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={copyMeetingLink}
              sx={{ color: 'primary.main', fontSize: 11, minWidth: 'auto', whiteSpace: 'nowrap' }}
            >
              {linkCopied ? '✓ Copied' : 'Copy Link'}
            </Button>
          </Box>
        )}
      </AppBar>

      {/* Dynamic video grid — adapts to number of participants */}
      <Box sx={{ flex: 1, overflow: 'hidden', p: 1 }}>
        <VideoGrid
          userVideo={userVideo}
          userName={user.name}
          peers={peers}
        />
      </Box>

      <Paper sx={{ p: 2, display: 'flex', justifyContent: 'center', gap: 2, bgcolor: '#1e1e1e' }}>
        <IconButton
          onClick={toggleAudio}
          sx={{ bgcolor: audioEnabled ? 'primary.main' : 'error.main', color: 'white',
            '&:hover': { bgcolor: audioEnabled ? 'primary.dark' : 'error.dark' } }}
        >
          {audioEnabled ? <MicIcon /> : <MicOffIcon />}
        </IconButton>

        <IconButton
          onClick={toggleVideo}
          sx={{ bgcolor: videoEnabled ? 'primary.main' : 'error.main', color: 'white',
            '&:hover': { bgcolor: videoEnabled ? 'primary.dark' : 'error.dark' } }}
        >
          {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
        </IconButton>

        <IconButton
          onClick={toggleScreenShare}
          sx={{ bgcolor: screenSharing ? 'success.main' : 'primary.main', color: 'white',
            '&:hover': { bgcolor: screenSharing ? 'success.dark' : 'primary.dark' } }}
        >
          {screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
        </IconButton>

        {/* ✅ Unread message badge on chat button */}
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setChatOpen(!chatOpen)}
            sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
          >
            <ChatIcon />
          </IconButton>
          {unreadCount > 0 && (
            <Box sx={{
              position: 'absolute', top: -4, right: -4,
              bgcolor: 'error.main', color: 'white', borderRadius: '50%',
              width: 20, height: 20, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 'bold'
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Box>
          )}
        </Box>

        <IconButton
          onClick={leaveRoom}
          sx={{ bgcolor: 'error.main', color: 'white', '&:hover': { bgcolor: 'error.dark' } }}
        >
          <CallEndIcon />
        </IconButton>
      </Paper>

      <Drawer
        anchor="right"
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        PaperProps={{ sx: { width: 320, bgcolor: '#1e1e1e' } }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Chat</Typography>
          <IconButton onClick={() => setChatOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>

        <List sx={{ flex: 1, overflow: 'auto', px: 2 }}>
          {messages.map((msg, idx) => (
            <ListItem key={idx} sx={{ flexDirection: 'column', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" color="primary">{msg.userName}</Typography>
              <Paper sx={{ p: 1, mt: 0.5, bgcolor: '#2e2e2e', width: '100%' }}>
                <Typography variant="body2">{msg.message}</Typography>
              </Paper>
            </ListItem>
          ))}
        </List>

        <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button variant="contained" onClick={sendMessage}>Send</Button>
        </Box>
      </Drawer>
      {/* Admission request popups — shown to host */}
      {admissionRequests.map((req) => (
        <Dialog key={req.socketId} open={true} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ pb: 1 }}>Someone wants to join</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                {req.userName.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="body1" fontWeight="bold">{req.userName}</Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              variant="outlined"
              color="error"
              onClick={() => denyUser(req.socketId)}
            >
              Deny
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => admitUser(req.socketId)}
            >
              Admit
            </Button>
          </DialogActions>
        </Dialog>
      ))}
    </Box>
  );
}

// Single video tile — used for remote peers
function Video({ peer, userName }) {
  const ref = useRef();
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    const attachStream = (stream) => {
      if (ref.current) {
        ref.current.srcObject = stream;
        setHasStream(true);
      }
    };

    // ✅ Check if stream already exists (timing: stream may fire before mount)
    if (peer.streams && peer.streams[0]) {
      attachStream(peer.streams[0]);
    }

    peer.on('stream', attachStream);

    return () => {
      peer.off('stream', attachStream);
    };
  }, [peer]);

  return (
    <>
      <video
        ref={ref}
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: hasStream ? 'block' : 'none' }}
      />
      {/* Placeholder when stream hasn't arrived yet */}
      {!hasStream && (
        <Box sx={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: '#2e2e2e'
        }}>
          <Typography sx={{ color: 'grey.500', fontSize: 14 }}>
            Connecting...
          </Typography>
        </Box>
      )}
      <Typography sx={{
        position: 'absolute', bottom: 12, left: 12,
        color: 'white', bgcolor: 'rgba(0,0,0,0.6)',
        px: 1.5, py: 0.5, borderRadius: 1, fontSize: 14
      }}>
        {userName}
      </Typography>
    </>
  );
}

// Computes grid layout based on total participant count
function VideoGrid({ userVideo, userName, peers }) {
  const total = peers.length + 1; // include self

  // Determine columns: 1→1col, 2→2col, 3-4→2col, 5-6→3col
  const cols = total === 1 ? 1 : total <= 4 ? 2 : 3;
  // Rows needed
  const rows = Math.ceil(total / cols);

  const tileStyle = {
    position: 'relative',
    bgcolor: '#1e1e1e',
    borderRadius: 1,
    overflow: 'hidden',
    // Each tile takes equal share of grid
    gridColumn: 'span 1',
  };

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: 1,
      width: '100%',
      height: '100%',
    }}>
      {/* Own video tile */}
      <Box sx={tileStyle}>
        <video
          ref={userVideo}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <Typography sx={{
          position: 'absolute', bottom: 12, left: 12,
          color: 'white', bgcolor: 'rgba(0,0,0,0.6)',
          px: 1.5, py: 0.5, borderRadius: 1, fontSize: 14
        }}>
          {userName} (You)
        </Typography>
      </Box>

      {/* Remote peer tiles */}
      {peers.map((peer) => (
        <Box key={peer.peerID} sx={tileStyle}>
          <Video peer={peer.peer} userName={peer.userName} />
        </Box>
      ))}
    </Box>
  );
}

export default VideoRoom;