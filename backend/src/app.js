// backend/src/app.js
import 'dotenv/config';
import express            from 'express';
import cors               from 'cors';
import cookieParser       from 'cookie-parser';
import session            from 'express-session';
import passport           from './config/passport.js';

import communityRoutes         from './routes/community/community.js';
import lostAndFoundRouter      from './routes/community/lostAndFound.js';
import announcementsRouter     from './routes/community/announcements.js';
import generalDiscussionRouter from './routes/community/generalDiscussion.js';
import publicSafetyRouter      from './routes/community/publicSafety.js';
import recommendationsRouter   from './routes/community/recommendations.js';
import volunteerHelpRouter     from './routes/community/volunteerHelp.js';

import authRoutes        from './routes/auth.js';
import userRoutes        from './routes/user.js';
import publicRoutes      from './routes/public.js';

import postsRouter       from './routes/posts.js';           // ← ⭐ comment‑likes router
import authenticateToken from './middleware/auth.js';
import logger            from './utils/logger.js';

import { Client } from '@googlemaps/google-maps-services-js';

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

/* ─────────────────────────── Core middleware ─────────────────────────── */
app.use(
    cors({
        origin: 'http://localhost:3000',
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());
app.use(
    session({
        name:  'll.sid',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        proxy: isProd,
        cookie: {
            secure:   isProd,
            httpOnly: true,
            sameSite: isProd ? 'none' : 'lax',
            maxAge:   7 * 24 * 60 * 60 * 1000,
        },
    })
);
app.use(passport.initialize());

/* ─────────────────────── Public & community routes ────────────────────── */
app.use('/public',               publicRoutes);
app.use('/api/community',        communityRoutes);
app.use('/api/lost-and-found',   lostAndFoundRouter);
app.use('/api/announcements',    announcementsRouter);
app.use('/api/general-discussion', generalDiscussionRouter);
app.use('/api/public-safety',    publicSafetyRouter);
app.use('/api/recommendations',  recommendationsRouter);
app.use('/api/volunteer-help',   volunteerHelpRouter);

/* ───────────────────── Google Geocode proxy (street‑only) ─────────────── */
const mapsClient = new Client({});

app.post('/api/geocode-google', async (req, res) => {
    const { address = '' } = req.body;
    console.log('[/api/geocode-google] payload.address:', address);

    const query = address.trim();
    if (!query) return res.status(400).json({ error: 'empty_query' });

    try {
        const response = await mapsClient.geocode({
            params: { address: query, key: process.env.GOOGLE_API_KEY },
        });

        const results = response.data.results;
        if (!results.length) return res.status(404).json({ error: 'not_found' });

        const top   = results[0];
        const types = top.types || [];
        const isStreet =
            types.includes('street_address') ||
            types.includes('premise') ||
            types.includes('route');

        if (!isStreet) return res.status(404).json({ error: 'not_found' });

        const { lat, lng } = top.geometry.location;
        return res.json({ lat, lng });
    } catch (err) {
        console.error('[/api/geocode-google] Geocode error:', err);
        return res.status(500).json({ error: 'geocode_error' });
    }
});

/* ───────────────────────────── Auth & user ────────────────────────────── */
app.use('/auth',  authRoutes);
app.use('/users', userRoutes);

/* ─────────────────── new posts router (incl. comment likes) ───────────── */
app.use('/api/posts', postsRouter);       // ← ⭐ mounted exactly once

/* ──────────────── Protected test endpoint (unchanged) ─────────────────── */
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Protected route', user: req.user });
});

/* ───────────────────────── Central error handler ──────────────────────── */
app.use((err, req, res, _next) => {
    logger.error(err);
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ message: 'Invalid CSRF token' });
    }
    res
        .status(err.status || 500)
        .json({ message: err.message || 'Server error' });
});

export default app;
