import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Suppress axios network errors from appearing as uncaught runtime errors
// Services may be temporarily unavailable during startup
axios.interceptors.response.use(
  response => response,
  error => {
    // silently drop network/CORS errors — the UI handles empty data gracefully
    return Promise.reject(error);
  }
);

// Global unhandled promise rejection handler — prevents CRA overlay for API errors
window.addEventListener('unhandledrejection', event => {
  if (event.reason && event.reason.isAxiosError) {
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

reportWebVitals();