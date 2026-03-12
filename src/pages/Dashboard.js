import React, { useState } from 'react';
import {
  Container,
  Paper,
  Button,
  Typography,
  Box,
  TextField,
  AppBar,
  Toolbar,
  IconButton,
  Grid,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  InputAdornment
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import LogoutIcon from '@mui/icons-material/Logout';
import VideocamIcon from '@mui/icons-material/Videocam';
import AddIcon from '@mui/icons-material/Add';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { API_URL } from '../config';

function Dashboard({ user, onLogout }) {
  const [roomId, setRoomId] = useState('');
  const [creating, setCreating] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState('');
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    setCreating(true);
    try {
      const response = await axios.post(
        `${API_URL}/rooms/create`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      // ✅ Show share dialog before entering room
      setCreatedRoomId(response.data.roomId);
      setShareDialog(true);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const getMeetingLink = () => `${window.location.origin}/room/${createdRoomId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(getMeetingLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Collab Space meeting',
          text: `Join my video meeting! Room code: ${createdRoomId}`,
          url: getMeetingLink(),
        });
      } catch (err) {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  const startMeeting = () => {
    setShareDialog(false);
    navigate(`/room/${createdRoomId}`);
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim().toUpperCase()}`);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <VideocamIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Collab Space
          </Typography>
          <Typography variant="body1" sx={{ mr: 2 }}>
            {user.name}
          </Typography>
          <IconButton color="inherit" onClick={onLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
          <Typography variant="h4" gutterBottom textAlign="center">
            Welcome, {user.name}!
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
            Start or join a video conference
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', p: 4 }}>
                  <AddIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Create New Meeting
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Start an instant meeting and invite others
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    onClick={handleCreateRoom}
                    disabled={creating}
                    startIcon={<VideocamIcon />}
                  >
                    {creating ? 'Creating...' : 'Create Room'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', p: 4 }}>
                  <MeetingRoomIcon sx={{ fontSize: 60, color: 'secondary.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Join Meeting
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Enter a room code to join
                  </Typography>
                  <TextField
                    fullWidth
                    label="Room Code"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    // ✅ Allow pressing Enter to join
                    onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                    margin="normal"
                    placeholder="e.g., ABC123XY"
                  />
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    onClick={handleJoinRoom}
                    disabled={!roomId.trim()}
                    sx={{ mt: 2 }}
                  >
                    Join Room
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            🔒 Secure end-to-end encrypted video calls
          </Typography>
        </Box>
      </Container>

      {/* Share meeting link dialog */}
      <Dialog open={shareDialog} onClose={startMeeting} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          🎉 Meeting Created!
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Share this link with people you want to invite. They can click it to join directly.
          </Typography>

          {/* Meeting link */}
          <TextField
            fullWidth
            value={createdRoomId ? getMeetingLink() : ''}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={copyLink} edge="end">
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ mb: 2 }}
            label="Meeting Link"
          />

          {/* Room code */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.default', p: 1.5, borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">Room Code:</Typography>
            <Typography variant="body1" fontWeight="bold" letterSpacing={2}>{createdRoomId}</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={shareLink}
            sx={{ mr: 'auto' }}
          >
            {copied ? 'Link Copied! ✓' : 'Share'}
          </Button>
          <Button onClick={() => setShareDialog(false)} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={startMeeting} startIcon={<MeetingRoomIcon />}>
            Start Meeting
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Dashboard;