// ✅ ALL imports must be first
import React from 'react';
import ReactDOM from 'react-dom/client';
import process from 'process';
import { Buffer } from 'buffer';

import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// ✅ Polyfills AFTER imports
window.process = process;
window.Buffer = Buffer;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

reportWebVitals();
