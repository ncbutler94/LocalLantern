// backend/src/app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from './config/passport.js';

import communityRoutes         from './routes/community/community.js';
import lostAndFoundRouter      from './routes/community/lostAndFound.js';
import announcementsRouter     from './routes/community/announcements.js';
import generalDiscussionRouter from './routes/community/generalDiscussion.js';
import publicSafetyRouter      from './routes/community/publicSafety.js';
import recommendationsRouter   from './routes/community/recommendations.js';
import volunteerHelpRouter     from './routes/community/volunteerHelp.js';

import authRoutes   from './routes/auth.js';
import userRoutes   from './routes/user.js';
import publicRoutes from './routes/public.js';
import postsRouter  from './routes/posts.js';

import businessesRouter from './routes/businesses/businesses.js';
import eventsRouter     from './routes/events/events.js';  // ⬅️ NEW

import logger from './utils/logger.js';
import { Client as GoogleMapsClient } from '@googlemaps/google-maps-services-js';
import { Storage } from '@google-cloud/storage';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

/* ───────────────────────── Core middleware ───────────────────────── */
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
if (isProd) app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(
    session({
        name: 'll.sid',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        proxy: isProd,
        cookie: {
            secure: isProd,
            httpOnly: true,
            sameSite: isProd ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);
app.use(passport.initialize());

/* ───────────────────── Public & community routes ─────────────────── */
app.use('/public',                 publicRoutes);
app.use('/api/community',          communityRoutes);
app.use('/api/lost-and-found',     lostAndFoundRouter);
app.use('/api/announcements',      announcementsRouter);
app.use('/api/general-discussion', generalDiscussionRouter);
app.use('/api/public-safety',      publicSafetyRouter);
app.use('/api/recommendations',    recommendationsRouter);
app.use('/api/volunteer-help',     volunteerHelpRouter);

/* Auth + users */
app.use('/auth',  authRoutes);
app.use('/users', userRoutes);

/* Posts (likes/comments/images) */
app.use('/api/posts', postsRouter);

/* 🚀 Businesses API */
app.use('/api/businesses', businessesRouter);

/* 🚀 NEW: Events API */
app.use('/api/events', eventsRouter);

/* ───────────────────── Google Geocode proxy ────────── */
const mapsClient = new GoogleMapsClient({});

app.post('/api/geocode-google', async (req, res) => {
    const { address = '' } = req.body;
    const query = (address || '').trim();
    if (!query) return res.status(400).json({ error: 'empty_query' });

    try {
        const response = await mapsClient.geocode({
            params: { address: query, key: process.env.GOOGLE_API_KEY }
        });

        const results = response.data.results || [];
        if (!results.length) return res.status(404).json({ error: 'not_found' });

        const top = results[0];
        const types = top.types || [];
        const isStreet = types.includes('street_address') || types.includes('premise') || types.includes('route');

        if (!isStreet) return res.status(404).json({ error: 'not_found' });

        const { lat, lng } = top.geometry.location;
        return res.json({ lat, lng });
    } catch (err) {
        console.error('[/api/geocode-google] Geocode error:', err);
        return res.status(500).json({ error: 'geocode_error' });
    }
});

/* New: alias used by AddBusinessModal (street + city fallback) */
app.post('/api/geocode', async (req, res) => {
    try {
        const { street = '', city = '', state = 'AL', country = 'US' } = req.body || {};
        const address = [street, city, state, country].filter(Boolean).join(', ');
        const response = await mapsClient.geocode({
            params: { address, key: process.env.GOOGLE_API_KEY }
        });
        const results = response.data.results || [];
        if (!results.length) return res.status(404).json({ error: 'not_found' });
        const { lat, lng } = results[0].geometry.location;
        return res.json({ lat, lng, formatted: results[0].formatted_address });
    } catch (err) {
        console.error('[/api/geocode] error:', err);
        return res.status(500).json({ error: 'geocode_error' });
    }
});

/* ───────────────────── Signed URL uploads (GCS) ───────────────────── */
const storage = new Storage();
const GCS_BUCKET = process.env.GCS_BUCKET;

app.post('/api/uploads/signed-url', async (req, res) => {
    try {
        if (!GCS_BUCKET) return res.status(500).json({ error: 'GCS_BUCKET_not_set' });

        const { folder, fileName, contentType } = req.body || {};
        if (!folder || !fileName || !contentType) {
            return res.status(400).json({ error: 'missing_params' });
        }

        const objectPath = `${folder}/${Date.now()}_${fileName}`;
        const [signedUrl] = await storage
            .bucket(GCS_BUCKET)
            .file(objectPath)
            .getSignedUrl({
                version: 'v4',
                action: 'write',
                expires: Date.now() + 15 * 60 * 1000,
                contentType
            });

        const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${objectPath}`;
        return res.json({ uploadUrl: signedUrl, publicUrl, objectPath });
    } catch (err) {
        console.error('[/api/uploads/signed-url] error:', err);
        return res.status(500).json({ error: 'signed_url_error' });
    }
});

/* Tenor helpers (unchanged) */
const TENOR_CLIENT_KEY = 'the-local-lantern';
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const buildTenorUrl = (path, params) =>
    `https://tenor.googleapis.com/v2${path}?${new URLSearchParams(params).toString()}`;

app.get('/api/tenor/featured', async (req, res) => {
    try {
        const key = process.env.TENOR_API_KEY;
        if (!key) return res.status(500).json({ error: 'TENOR_API_KEY_not_set' });

        const limit         = clamp(Number(req.query.limit || 20), 1, 50);
        const pos           = (req.query.pos || '').toString();
        const media_filter  = (req.query.media_filter || 'gif,tinygif,mp4,tinymp4').toString();
        const contentfilter = (req.query.contentfilter || 'medium').toString();
        const locale        = (req.query.locale || 'en_US').toString();
        const country       = (req.query.country || 'US').toString();

        const url = buildTenorUrl('/featured', {
            key, client_key: TENOR_CLIENT_KEY, limit, pos, media_filter, contentfilter, locale, country
        });

        const r = await fetch(url);
        const data = await r.json();
        return res.json(data);
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ error: 'tenor_featured_error' });
    }
});

app.get('/api/tenor/suggestions', async (req, res) => {
    try {
        const key = process.env.TENOR_API_KEY;
        if (!key) return res.status(500).json({ error: 'TENOR_API_KEY_not_set' });

        const q     = (req.query.q || '').toString().trim();
        const limit = clamp(Number(req.query.limit || 8), 1, 50);
        const url   = buildTenorUrl('/search_suggestions', { q, key, client_key: TENOR_CLIENT_KEY, limit });

        const r = await fetch(url);
        const data = await r.json();
        return res.json(data);
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ error: 'tenor_suggestions_error' });
    }
});

/* Health & errors */
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use((err, req, res, _next) => {
    logger.error(err);
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ message: 'Invalid CSRF token' });
    }
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

export default app;
