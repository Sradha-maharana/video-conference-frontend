// frontend/src/config.js
const isDevelopment = window.location.hostname === 'localhost';

export const API_URL = isDevelopment
  ? 'http://localhost:5000/api'
  : 'https://collabspace.up.railway.app/'; // We'll update this later

export const SOCKET_URL = isDevelopment
  ? 'http://localhost:5000'
  : 'https://collabspace.up.railway.app/'; // We'll update this later