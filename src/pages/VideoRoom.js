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
  Grid
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
import CloseIcon from '@mui/icons-material/Close';

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

  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);
  const screenStreamRef = useRef();

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        userVideo.current.srcObject = stream;

        socketRef.current.emit('join-room', {
          roomId,
          userId: user.id,
          userName: user.name
        });

        socketRef.current.on('existing-users', users => {
          const peers = [];
          users.forEach(existingUser => {
            const peer = createPeer(existingUser.socketId, socketRef.current.id, stream);
            peersRef.current.push({
              peerID: existingUser.socketId,
              peer,
              userName: existingUser.userName
            });
            peers.push({
              peerID: existingUser.socketId,
              peer,
              userName: existingUser.userName
            });
          });
          setPeers(peers);
        });

        socketRef.current.on('user-connected', payload => {
          const peer = addPeer(payload.signal, payload.socketId, stream);
          peersRef.current.push({
            peerID: payload.socketId,
            peer,
            userName: payload.userName
          });
          setPeers(users => [...users, {
            peerID: payload.socketId,
            peer,
            userName: payload.userName
          }]);
        });

        socketRef.current.on('signal', payload => {
          const item = peersRef.current.find(p => p.peerID === payload.from);
          item?.peer.signal(payload.signal);
        });

        socketRef.current.on('user-disconnected', payload => {
          const peerObj = peersRef.current.find(p => p.peerID === payload.socketId);
          if (peerObj) {
            peerObj.peer.destroy();
          }
          const peers = peersRef.current.filter(p => p.peerID !== payload.socketId);
          peersRef.current = peers;
          setPeers(peers);
        });

        socketRef.current.on('chat-history', history => {
          setMessages(history);
        });

        socketRef.current.on('new-message', message => {
          // Only add message if it's not from you
          if (message.userName !== user.name) {
            setMessages(prev => [...prev, message]);
          }
        });
      })
      .catch(err => {
        console.error('Error accessing media devices:', err);
        alert('Please allow camera and microphone access');
      });

    return () => {
      if (userVideo.current && userVideo.current.srcObject) {
        userVideo.current.srcObject.getTracks().forEach(track => track.stop());
      }
      socketRef.current.disconnect();
    };
  }, [roomId, user]);

  function createPeer(userToSignal, callerID, stream) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on('signal', signal => {
      socketRef.current.emit('signal', {
        to: userToSignal,
        signal,
        from: callerID
      });
    });

    return peer;
  }

  function addPeer(incomingSignal, callerID, stream) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', signal => {
      socketRef.current.emit('signal', {
        to: callerID,
        signal,
        from: socketRef.current.id
      });
    });

    peer.signal(incomingSignal);
    return peer;
  }

  const toggleAudio = () => {
    const audioTrack = userVideo.current.srcObject.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    setAudioEnabled(audioTrack.enabled);
    socketRef.current.emit('toggle-audio', { roomId, enabled: audioTrack.enabled });
  };

  const toggleVideo = () => {
    const videoTrack = userVideo.current.srcObject.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    setVideoEnabled(videoTrack.enabled);
    socketRef.current.emit('toggle-video', { roomId, enabled: videoTrack.enabled });
  };

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];
        const originalTrack = userVideo.current.srcObject.getVideoTracks()[0];

        // Replace your own video with screen
        userVideo.current.srcObject.removeTrack(originalTrack);
        userVideo.current.srcObject.addTrack(screenTrack);

        // Send screen to peers
        peersRef.current.forEach(({ peer }) => {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        screenTrack.onended = () => {
          stopScreenShare();
        };

        setScreenSharing(true);
      } catch (err) {
        console.error('Error sharing screen:', err);
        alert('Screen sharing cancelled or not supported');
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());

      const originalTrack = userVideo.current.srcObject.getVideoTracks()[0];

      // Restore camera video
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          const videoTrack = stream.getVideoTracks()[0];
          const audioTrack = stream.getAudioTracks()[0];

          userVideo.current.srcObject.removeTrack(originalTrack);
          userVideo.current.srcObject.addTrack(videoTrack);

          // Send camera back to peers
          peersRef.current.forEach(({ peer }) => {
            const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          });
        });
    }
    setScreenSharing(false);
  };

  const leaveRoom = () => {
    if (userVideo.current && userVideo.current.srcObject) {
      userVideo.current.srcObject.getTracks().forEach(track => track.stop());
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

      // Add to local messages immediately
      setMessages(prev => [...prev, msg]);

      // Send to server (server will broadcast to others, not back to you)
      socketRef.current.emit('send-message', {
        roomId,
        message: newMessage,
        userName: user.name
      });
      setNewMessage('');
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#000' }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'white' }}>
            Room: {roomId}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={copyRoomId}
            startIcon={<ContentCopyIcon />}
            sx={{ mr: 2, color: 'white', borderColor: 'white' }}
          >
            {copied ? 'Copied!' : 'Copy Code'}
          </Button>
          <Chip label={`${peers.length + 1} participant${peers.length !== 0 ? 's' : ''}`} color="primary" />
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: 'flex', p: 2, gap: 2, overflow: 'hidden' }}>
        <Grid container spacing={2} sx={{ height: '100%' }}>
          <Grid item xs={12} md={peers.length > 0 ? 6 : 12}>
            <Paper sx={{ height: '100%', position: 'relative', bgcolor: '#1e1e1e' }}>
              <video
                ref={userVideo}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)'
                }}
              />
              <Typography
                sx={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  color: 'white',
                  bgcolor: 'rgba(0,0,0,0.6)',
                  px: 2,
                  py: 1,
                  borderRadius: 1
                }}
              >
                {user.name} (You)
              </Typography>
            </Paper>
          </Grid>

          {peers.map((peer, index) => (
            <Grid item xs={12} md={6} key={peer.peerID}>
              <Video peer={peer.peer} userName={peer.userName} />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Paper
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          gap: 2,
          bgcolor: '#1e1e1e'
        }}
      >
        <IconButton
          onClick={toggleAudio}
          sx={{
            bgcolor: audioEnabled ? 'primary.main' : 'error.main',
            color: 'white',
            '&:hover': { bgcolor: audioEnabled ? 'primary.dark' : 'error.dark' }
          }}
        >
          {audioEnabled ? <MicIcon /> : <MicOffIcon />}
        </IconButton>

        <IconButton
          onClick={toggleVideo}
          sx={{
            bgcolor: videoEnabled ? 'primary.main' : 'error.main',
            color: 'white',
            '&:hover': { bgcolor: videoEnabled ? 'primary.dark' : 'error.dark' }
          }}
        >
          {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
        </IconButton>

        <IconButton
          onClick={toggleScreenShare}
          sx={{
            bgcolor: screenSharing ? 'success.main' : 'primary.main',
            color: 'white',
            '&:hover': { bgcolor: screenSharing ? 'success.dark' : 'primary.dark' }
          }}
        >
          {screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
        </IconButton>

        <IconButton
          onClick={() => setChatOpen(!chatOpen)}
          sx={{
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': { bgcolor: 'primary.dark' }
          }}
        >
          <ChatIcon />
        </IconButton>

        <IconButton
          onClick={leaveRoom}
          sx={{
            bgcolor: 'error.main',
            color: 'white',
            '&:hover': { bgcolor: 'error.dark' }
          }}
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
              <Typography variant="caption" color="primary">
                {msg.userName}
              </Typography>
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
          <Button variant="contained" onClick={sendMessage}>
            Send
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}

function Video({ peer, userName }) {
  const ref = useRef();

  useEffect(() => {
    peer.on('stream', stream => {
      ref.current.srcObject = stream;
    });
  }, [peer]);

  return (
    <Paper sx={{ height: '100%', position: 'relative', bgcolor: '#1e1e1e' }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
      <Typography
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          color: 'white',
          bgcolor: 'rgba(0,0,0,0.6)',
          px: 2,
          py: 1,
          borderRadius: 1
        }}
      >
        {userName}
      </Typography>
    </Paper>
  );
}

export default VideoRoom;