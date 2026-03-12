const isDevelopment = window.location.hostname === 'localhost';

export const API_URL = isDevelopment
  ? 'http://localhost:5000/api'
  : 'https://collab-space-backend-g4p4.onrender.com/api';

export const SOCKET_URL = isDevelopment
  ? 'http://localhost:5000'
  : 'https://collab-space-backend-g4p4.onrender.com';