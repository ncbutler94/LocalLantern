// src/index.js

// 1) Import our patch before anything else runs
import './leafletPatch';

import 'leaflet/dist/leaflet.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import axios from 'axios';

// 2) Axios defaults
axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.REACT_APP_API_URL; // e.g. http://localhost:4001

// 3) Mount React
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
