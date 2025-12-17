// src/index.js

// Keep your Leaflet bootstrap (unchanged)
import './leafletPatch';
import 'leaflet/dist/leaflet.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';

// NEW: master theme wiring
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import theme from './theme';

// Axios defaults for cookie-based auth (unchanged)
axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
    </ThemeProvider>
);
