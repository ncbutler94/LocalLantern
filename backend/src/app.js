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

// NEW (already in your project): posts router has comment likes & replies
import postsRouter       from './routes/posts.js';

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
        name: 'll.sid',
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

/* ───────────── Posts router (incl. comment likes / replies / images) ──── */
app.use('/api/posts', postsRouter); // mounted once

/* ───────────────────────────── Tenor proxy (NEW) ──────────────────────── */
/**
 * Why proxy? Keeps TENOR_API_KEY server‑side and lets us set sensible defaults:
 *  - contentfilter: medium (stricter than Tenor’s default “off”)
 *  - media_filter:  gif,tinygif,mp4,tinymp4 (smaller payloads)
 * Docs: search endpoint + params (q,key,client_key,limit,media_filter,contentfilter,locale,country,pos).
 */
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const TENOR_CLIENT_KEY = process.env.TENOR_CLIENT_KEY || 'thelocallantern_web';

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function buildTenorUrl(pathname, params) {
    const url = new URL(`${TENOR_BASE}${pathname}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
    return url.toString();
}

app.get('/api/tenor/search', async (req, res) => {
    try {
        const key = process.env.TENOR_API_KEY;
        if (!key) return res.status(500).json({ error: 'TENOR_API_KEY_not_set' });

        const q = (req.query.q || '').toString().trim();
        if (!q) return res.status(400).json({ error: 'missing_query' });

        const limit          = clamp(Number(req.query.limit || 20), 1, 50);
        const pos            = (req.query.pos || '').toString();
        const media_filter   = (req.query.media_filter || 'gif,tinygif,mp4,tinymp4').toString();
        const contentfilter  = (req.query.contentfilter || 'medium').toString(); // safer default
        const locale         = (req.query.locale || 'en_US').toString();
        const country        = (req.query.country || 'US').toString();
        const searchfilter   = (req.query.searchfilter || '').toString(); // e.g., 'sticker'

        const url = buildTenorUrl('/search', {
            q, key, client_key: TENOR_CLIENT_KEY, limit, pos,
            media_filter, contentfilter, locale, country, searchfilter,
        });

        const r = await fetch(url);
        const data = await r.json();
        return res.json(data);
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ error: 'tenor_search_error' });
    }
});

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
            key, client_key: TENOR_CLIENT_KEY, limit, pos,
            media_filter, contentfilter, locale, country,
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
        const url   = buildTenorUrl('/search_suggestions', {
            q, key, client_key: TENOR_CLIENT_KEY, limit
        });

        const r = await fetch(url);
        const data = await r.json();
        return res.json(data);
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ error: 'tenor_suggestions_error' });
    }
});
/* ──────────────────────────────────────────────────────────────────────── */

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
