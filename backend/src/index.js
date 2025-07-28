// backend/src/index.js
import 'dotenv/config';
import fs from 'fs';
import https from 'https';
import path from 'path';
import app from './app.js';
import axios from 'axios';
const PORT   = process.env.PORT || 4001;
const isProd = process.env.NODE_ENV === 'production';

axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.REACT_APP_API_URL;  // http://localhost:4001

if (isProd) {
    // Trust proxy headers (e.g. if behind Nginx or Heroku)
    app.set('trust proxy', 1);

    // SSL cert/key paths
    const certPath = path.resolve('ssl', 'cert.pem');
    const keyPath  = path.resolve('ssl', 'key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.error('❌ SSL cert or key not found at', certPath, keyPath);
        process.exit(1);
    }

    const cert = fs.readFileSync(certPath, 'utf8');
    const key  = fs.readFileSync(keyPath,  'utf8');

    https
        .createServer({ key, cert }, app)
        .listen(PORT, () => {
            console.log(`🔒 HTTPS server listening on port ${PORT}`);
        });
} else {
    // Development: plain HTTP
    app.listen(PORT, () => {
        console.log(`🚀 HTTP server listening on port ${PORT} (dev mode)`);
    });
}
