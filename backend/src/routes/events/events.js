// backend/src/routes/events/events.js
import express from 'express';
import mysql from 'mysql2/promise';

const router = express.Router();

/* ───────────────────────── DB POOL (MySQL 8) ─────────────────────────
   Uses DATABASE_URL if provided (e.g. mysql://user:pass@host:3306/dbname).
   Otherwise falls back to discrete env vars. */
const pool = mysql.createPool(
    process.env.DATABASE_URL
        ? process.env.DATABASE_URL
        : {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'local_lantern',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        }
);

/* ─────────────────────────── Constants ──────────────────────────── */
const ALLOWED_CATEGORIES = new Set([
    'Festival','Concert','Church','Market','Parade',
    'Volunteer','Sports','Class/Workshop','Government/School','Other'
]);
const ALLOWED_STATUSES = new Set(['published','pending','flagged','cancelled']);

/* ─────────────────────────── Utilities ──────────────────────────── */
const toMySQLDateTimeUTC = (dLike) => {
    if (!dLike) return null;
    const d = new Date(dLike);
    if (isNaN(+d)) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
        d.getUTCMinutes()
    )}:${pad(d.getUTCSeconds())}`;
};

const parseBBox = (s) => {
    if (!s) return null;
    const parts = s.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    let [minLat, minLng, maxLat, maxLng] = parts;
    if (minLat > maxLat) [minLat, maxLat] = [maxLat, minLat];
    if (minLng > maxLng) [minLng, maxLng] = [maxLng, minLng];
    if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
    return { minLat, minLng, maxLat, maxLng };
};

const toMeters = ({ radius_km, radius_miles }) => {
    if (radius_km) return Number(radius_km) * 1000;
    if (radius_miles) return Number(radius_miles) * 1609.344;
    return null;
};

const escLike = (s) => s.replace(/[%_]/g, (m) => '\\' + m); // preserve %/_ in LIKE

const isAdmin = (user) => {
    if (!user) return false;
    return user.is_admin === true || user.role === 'admin' || user.role === 'moderator';
};

const clampLen = (s, max) => (s && s.length > max ? s.slice(0, max) : s);

/* Validate incoming payload for create/update */
function validateEventPayload(body) {
    const errors = [];
    const clean = {};

    // Title
    const title = (body.title || '').toString().trim();
    if (!title) errors.push('title is required');
    clean.title = clampLen(title, 255);

    // Category (optional, must be allowed if present)
    const category = (body.category || '').toString().trim();
    clean.category = category ? (ALLOWED_CATEGORIES.has(category) ? category : null) : null;
    if (category && !ALLOWED_CATEGORIES.has(category)) {
        errors.push('category is not allowed');
    }

    // Description
    clean.description = (body.description || '').toString();

    // Datetimes
    const startDT = toMySQLDateTimeUTC(body.start_datetime);
    if (!startDT) errors.push('start_datetime invalid or missing');
    const endDT = body.end_datetime ? toMySQLDateTimeUTC(body.end_datetime) : null;
    if (startDT && endDT && new Date(body.end_datetime) < new Date(body.start_datetime)) {
        errors.push('end_datetime must be after start_datetime');
    }
    clean.start_datetime = startDT;
    clean.end_datetime = endDT;

    // Location & coords
    clean.venue_name = clampLen((body.venue_name || '').toString().trim(), 255) || null;
    clean.address    = clampLen((body.address || '').toString().trim(), 255) || null;
    clean.city       = clampLen((body.city || '').toString().trim(), 128) || null;
    clean.county     = clampLen((body.county || '').toString().trim(), 128) || null;

    const lat = body.lat === '' || body.lat === null || body.lat === undefined ? null : Number(body.lat);
    const lng = body.lng === '' || body.lng === null || body.lng === undefined ? null : Number(body.lng);
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) errors.push('lat out of range');
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) errors.push('lng out of range');
    clean.lat = lat;
    clean.lng = lng;

    // Pricing & flags
    const price_min = body.price_min === '' || body.price_min === null || body.price_min === undefined ? null : Number(body.price_min);
    const price_max = body.price_max === '' || body.price_max === null || body.price_max === undefined ? null : Number(body.price_max);
    if (price_min !== null && (Number.isNaN(price_min) || price_min < 0)) errors.push('price_min invalid');
    if (price_max !== null && (Number.isNaN(price_max) || price_max < 0)) errors.push('price_max invalid');
    if (price_min !== null && price_max !== null && price_max < price_min) errors.push('price_max < price_min');

    clean.price_min = price_min;
    clean.price_max = price_max;
    clean.is_online = !!body.is_online;
    clean.is_free   = !!body.is_free;

    // JSON fields
    clean.audience_flags      = body.audience_flags && typeof body.audience_flags === 'object' ? body.audience_flags : {};
    clean.accessibility_flags = body.accessibility_flags && typeof body.accessibility_flags === 'object' ? body.accessibility_flags : {};
    clean.tags = Array.isArray(body.tags) ? body.tags : [];

    // Media & source
    clean.image_url = (body.image_url || null) ? clampLen(String(body.image_url), 1024) : null;
    clean.source    = clampLen((body.source || 'user').toString(), 24);

    return { errors, clean };
}

/* WHERE builder with text/date/geo filters */
function buildWhere({ q, category, date_from, date_to, county, city, status = 'published', bbox, center, radius_m }) {
    const parts = [];
    const values = [];

    // Status: by default only published; admins can override upstream
    parts.push(`e.status = ?`);
    values.push(status);

    if (q) {
        const like = `%${escLike(q)}%`;
        parts.push(`(e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR e.venue_name LIKE ? ESCAPE '\\' OR e.city LIKE ? ESCAPE '\\')`);
        values.push(like, like, like, like);
    }
    if (category) { parts.push('e.category = ?'); values.push(category); }
    if (county)   { parts.push('e.county LIKE ?'); values.push(`%${escLike(county)}%`); }
    if (city)     { parts.push('e.city LIKE ?');   values.push(`%${escLike(city)}%`); }
    if (date_from){ parts.push('e.start_datetime >= ?'); values.push(toMySQLDateTimeUTC(date_from)); }
    if (date_to)  { parts.push('e.start_datetime <= ?'); values.push(toMySQLDateTimeUTC(date_to)); }
    if (bbox) {
        parts.push('(e.lat BETWEEN ? AND ? AND e.lng BETWEEN ? AND ?)');
        values.push(bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng);
    }
    if (center && radius_m) {
        // MySQL 8: ST_Distance_Sphere(POINT(lon, lat), POINT(lon, lat)) <= meters
        parts.push('e.lat IS NOT NULL AND e.lng IS NOT NULL AND ST_Distance_Sphere(POINT(e.lng, e.lat), POINT(?, ?)) <= ?');
        values.push(center.lng, center.lat, radius_m);
    }

    return { whereSql: `WHERE ${parts.join(' AND ')}`, values };
}

/* ───────────────────────────── LIST ───────────────────────────── */
/** GET /api/events
 *  Query:
 *    q, category, county, city, date_from, date_to
 *    sort=upcoming|popular|new
 *    bbox=minLat,minLng,maxLat,maxLng
 *    lat,lng,radius_km (or radius_miles)
 *    status=published|pending|flagged|cancelled (admin only; default published)
 *    page, limit
 */
router.get('/', async (req, res) => {
    try {
        const {
            q = '', category = '', county = '', city = '',
            date_from = '', date_to = '',
            sort = 'upcoming',
            bbox: bboxStr = '',
            lat: latStr = '', lng: lngStr = '', radius_km = '', radius_miles = '',
            status: statusParam = '',
            page = '1', limit = '20'
        } = req.query;

        const p = Number(page) > 0 ? Number(page) : 1;
        const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const offset = (p - 1) * l;

        const bbox = parseBBox(bboxStr);
        const center = (latStr && lngStr) ? { lat: Number(latStr), lng: Number(lngStr) } : null;
        const radius_m = toMeters({ radius_km, radius_miles });

        const isAdminView = isAdmin(req.user);
        const status = (statusParam && isAdminView && ALLOWED_STATUSES.has(statusParam)) ? statusParam : 'published';

        const { whereSql, values } = buildWhere({
            q: q || undefined, category: category || undefined,
            county: county || undefined, city: city || undefined,
            date_from: date_from || undefined, date_to: date_to || undefined,
            status, bbox, center, radius_m
        });

        let orderBy = 'ORDER BY e.start_datetime ASC';
        let popularityJoin = '';
        if (sort === 'new') {
            orderBy = 'ORDER BY e.created_at DESC';
        } else if (sort === 'popular') {
            popularityJoin = `
        LEFT JOIN (
          SELECT event_id, COUNT(*) AS interest
          FROM event_engagement
          WHERE type = 'interested'
          GROUP BY event_id
        ) pop ON pop.event_id = e.id
      `;
            orderBy = 'ORDER BY COALESCE(pop.interest, 0) DESC, e.start_datetime ASC';
        }

        const listSql = `
      SELECT e.*,
             COALESCE(pop.interest, 0) AS interested_count
      FROM events e
      ${popularityJoin}
      ${whereSql}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
        const countSql = `
      SELECT COUNT(*) AS cnt
      FROM events e
      ${whereSql}
    `;

        const [rows]  = await pool.execute(listSql, [...values, l, offset]);
        const [count] = await pool.execute(countSql, values);
        const total = Number(count[0]?.cnt || 0);

        return res.json({
            items: rows.map(r => ({
                id: r.id,
                title: r.title,
                description: r.description,
                category: r.category,
                start_datetime: r.start_datetime,
                end_datetime: r.end_datetime,
                venue_name: r.venue_name,
                address: r.address,
                city: r.city,
                county: r.county,
                lat: r.lat,
                lng: r.lng,
                is_online: !!r.is_online,
                is_free: !!r.is_free,
                price_min: r.price_min,
                price_max: r.price_max,
                image_url: r.image_url,
                status: r.status,
                interested_count: Number(r.interested_count || 0)
            })),
            page: p,
            limit: l,
            total
        });
    } catch (err) {
        console.error('[GET /api/events] error', err);
        res.status(500).json({ error: 'events_list_error' });
    }
});

/* ─────────────────────────── DETAILS ─────────────────────────── */
router.get('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'bad_id' });

        const sql = `
      SELECT e.*,
        (SELECT COUNT(*) FROM event_engagement WHERE event_id = e.id AND type='interested') AS interested_count,
        (SELECT COUNT(*) FROM event_engagement WHERE event_id = e.id AND type='rsvp')       AS rsvp_count
      FROM events e
      WHERE e.id = ?
      LIMIT 1
    `;
        const [rows] = await pool.execute(sql, [id]);
        if (!rows.length) return res.status(404).json({ error: 'not_found' });
        return res.json(rows[0]);
    } catch (err) {
        console.error('[GET /api/events/:id] error', err);
        res.status(500).json({ error: 'event_detail_error' });
    }
});

/* ─────────────────────────── CREATE ─────────────────────────── */
router.post('/', async (req, res) => {
    try {
        const { errors, clean } = validateEventPayload(req.body || {});
        if (errors.length) return res.status(400).json({ error: 'validation_failed', errors });

        // Duplicate detection: title (loose), same date (day), same city OR same venue
        const dupSql = `
      SELECT id
      FROM events
      WHERE (LOWER(TRIM(title)) = LOWER(TRIM(?)))
        AND DATE(start_datetime) = DATE(?)
        AND (
          (COALESCE(city,'') = COALESCE(?,'')) OR
          (COALESCE(venue_name,'') = COALESCE(?,'')) )
      AND status IN ('published','pending')
      LIMIT 1
    `;
        const [dups] = await pool.execute(dupSql, [
            clean.title, clean.start_datetime, clean.city || '', clean.venue_name || ''
        ]);
        if (dups.length) {
            return res.status(409).json({ error: 'duplicate_event', duplicate_of: dups[0].id });
        }

        const audience = JSON.stringify(clean.audience_flags);
        const access   = JSON.stringify(clean.accessibility_flags);
        const tags     = JSON.stringify(clean.tags);

        const organizerId = req.user?.id || null;
        const initialStatus = isAdmin(req.user) ? 'published' : 'pending';

        const sql = `
      INSERT INTO events
      (title, description, category, start_datetime, end_datetime,
       venue_name, address, city, county, lat, lng,
       is_online, price_min, price_max, is_free,
       audience_flags, accessibility_flags, tags,
       organizer_id, status, image_url, source, created_at, updated_at)
      VALUES
      (?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
       ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `;
        const params = [
            clean.title, clean.description || null, clean.category || null, clean.start_datetime, clean.end_datetime,
            clean.venue_name, clean.address, clean.city, clean.county, clean.lat, clean.lng,
            clean.is_online ? 1 : 0, clean.price_min, clean.price_max, clean.is_free ? 1 : 0,
            audience, access, tags,
            organizerId, initialStatus, clean.image_url, clean.source
        ];

        const [result] = await pool.execute(sql, params);
        const id = Number(result.insertId);
        return res.status(201).json({ id, status: initialStatus });
    } catch (err) {
        console.error('[POST /api/events] error', err);
        res.status(500).json({ error: 'event_create_error' });
    }
});

/* ───────────────────────── Status change ─────────────────────── */
/** Admin only: PUT /api/events/:id/status  body: { status } */
router.put('/:id/status', async (req, res) => {
    try {
        if (!isAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });

        const id = Number(req.params.id);
        const status = (req.body?.status || '').toString();
        if (!id || !ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: 'bad_request' });

        const [r] = await pool.execute(
            `UPDATE events SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? LIMIT 1`,
            [status, id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true });
    } catch (err) {
        console.error('[PUT /api/events/:id/status] error', err);
        res.status(500).json({ error: 'status_update_error' });
    }
});

/* ─────────────────── Interested toggle (auth) ────────────────── */
/** POST /api/events/:id/interested  → toggles; returns { interested, count } */
router.post('/:id/interested', async (req, res) => {
    try {
        if (!req.user?.id) return res.status(401).json({ error: 'auth_required' });

        const eventId = Number(req.params.id);
        const userId  = Number(req.user.id);
        if (!eventId || !userId) return res.status(400).json({ error: 'bad_request' });

        const [existing] = await pool.execute(
            `SELECT id FROM event_engagement WHERE event_id = ? AND user_id = ? AND type = 'interested' LIMIT 1`,
            [eventId, userId]
        );

        if (existing.length) {
            await pool.execute(`DELETE FROM event_engagement WHERE id = ? LIMIT 1`, [existing[0].id]);
        } else {
            await pool.execute(
                `INSERT INTO event_engagement (event_id, user_id, type, created_at) VALUES (?, ?, 'interested', UTC_TIMESTAMP())`,
                [eventId, userId]
            );
        }

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS cnt FROM event_engagement WHERE event_id = ? AND type = 'interested'`,
            [eventId]
        );
        const count = Number(countRows[0]?.cnt || 0);
        return res.json({ interested: existing.length === 0, count });
    } catch (err) {
        console.error('[POST /api/events/:id/interested] error', err);
        res.status(500).json({ error: 'interested_toggle_error' });
    }
});

/* ───────────────────────── Report event ───────────────────────── */
/** POST /api/events/:id/report  body: { reason }  (any user can flag) */
router.post('/:id/report', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'bad_request' });

        // Minimal model: move to 'flagged'. (If you want a reports table, we can add it later.)
        const [r] = await pool.execute(
            `UPDATE events SET status = 'flagged', updated_at = UTC_TIMESTAMP() WHERE id = ? LIMIT 1`,
            [id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true });
    } catch (err) {
        console.error('[POST /api/events/:id/report] error', err);
        res.status(500).json({ error: 'report_error' });
    }
});

/* ───────────────────────────── ICS ───────────────────────────── */
const esc = (s = '') =>
    String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const toICSDateUTC = (d) => {
    const dt = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return (
        dt.getUTCFullYear() +
        pad(dt.getUTCMonth() + 1) +
        pad(dt.getUTCDate()) +
        'T' +
        pad(dt.getUTCHours()) +
        pad(dt.getUTCMinutes()) +
        pad(dt.getUTCSeconds()) +
        'Z'
    );
};
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '') || 'event';

/** GET /api/events/:id/ics — download ICS */
router.get('/:id/ics', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'bad_id' });

        const [rows] = await pool.execute(
            `SELECT id, title, description, start_datetime, end_datetime, venue_name, address, city, county, lat, lng
       FROM events WHERE id = ? LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'not_found' });

        const ev = rows[0];
        const now = new Date();
        const start = ev.start_datetime;
        const end = ev.end_datetime || new Date(new Date(start).getTime() + 60 * 60 * 1000);
        const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const url = `${frontend}/events/${ev.id}`;
        const location = [ev.venue_name, ev.address, ev.city, ev.county].filter(Boolean).join(', ');

        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Local Lantern//Events//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:ll-event-${ev.id}@local-lantern`,
            `DTSTAMP:${toICSDateUTC(now)}`,
            `DTSTART:${toICSDateUTC(start)}`,
            `DTEND:${toICSDateUTC(end)}`,
            `SUMMARY:${esc(ev.title)}`,
            ev.description ? `DESCRIPTION:${esc(ev.description)}` : 'DESCRIPTION:',
            location ? `LOCATION:${esc(location)}` : 'LOCATION:',
            `URL:${esc(url)}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${slug(ev.title)}.ics"`);
        return res.send(ics);
    } catch (err) {
        console.error('[GET /api/events/:id/ics] error', err);
        res.status(500).json({ error: 'event_ics_error' });
    }
});

export default router;
