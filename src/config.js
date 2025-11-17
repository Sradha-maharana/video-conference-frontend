const isDevelopment = window.location.hostname === 'localhost';

export const API_URL = isDevelopment
  ? 'http://localhost:5000/api'
  : 'https://video-conference-backend-gqh8.onrender.com/api';

export const SOCKET_URL = isDevelopment
  ? 'http://localhost:5000'
  : 'https://video-conference-backend-gqh8.onrender.com';
