// backend/src/index.js
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';

import app from './app.js';
import { attachIO as attachMessagesIO } from './routes/messages/messages.js';

const PORT   = process.env.PORT || 4001;
const isProd = process.env.NODE_ENV === 'production';

axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.REACT_APP_API_URL;  // http://localhost:4001

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

console.log('[Env check]', {
    PORT,
    FRONTEND_URL: allowedOrigins,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GCS_BUCKET: process.env.GCS_BUCKET,
    cwd: process.cwd(),
});

/* ───────────────────────── Create HTTP(S) server ───────────────────── */
let server;
if (isProd) {
    // SSL cert/key paths
    const certPath = path.resolve('ssl', 'cert.pem');
    const keyPath  = path.resolve('ssl', 'key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.error('❌ SSL cert or key not found at', certPath, keyPath);
        process.exit(1);
    }

    const cert = fs.readFileSync(certPath, 'utf8');
    const key  = fs.readFileSync(keyPath,  'utf8');

    server = https.createServer({ key, cert }, app);
} else {
    server = http.createServer(app);
}

/* ───────────────────────── Attach Socket.IO ─────────────────────────── */
const io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins, credentials: true },
    path: '/socket.io',
});

// Simple room wiring: user rooms and conversation rooms
io.on('connection', (socket) => {
    socket.on('user:join', ({ userId }) => {
        if (!userId) return;
        socket.join(`user:${userId}`);
    });
    socket.on('conversation:join', ({ conversationId }) => {
        if (!conversationId) return;
        socket.join(`conversation:${conversationId}`);
    });
    socket.on('disconnect', () => {
        // nothing special; rooms auto‑cleanup
    });
});

// Make io available to the messages router so it can emit events
attachMessagesIO(io);

/* ───────────────────────── Start server ─────────────────────────────── */
server.listen(PORT, () => {
    console.log(`${isProd ? '🔒 HTTPS' : '🚀 HTTP'} server listening on port ${PORT}`);
});
