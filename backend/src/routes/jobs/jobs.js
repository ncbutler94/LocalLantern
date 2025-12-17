// backend/src/routes/jobs/jobs.js
/* Jobs API (MySQL 8 / Knex)
   - /categories is defined BEFORE any param route
   - Numeric-only params for ids
   - Supports ?remote=1 filter
*/

import express from 'express';
import db from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';
import optionalAuth from '../../middleware/optionalAuth.js';

const router = express.Router();

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isTruthy = (v) => v === true || v === '1' || v === 1 || v === 'true';

/* ------------------------------- CATEGORIES ------------------------------- */
router.get('/categories', async (_req, res) => {
    try {
        const categories = [
            { id: 'administrative', label: 'Administrative' },
            { id: 'accounting-finance', label: 'Accounting & Finance' },
            { id: 'arts-design', label: 'Arts & Design' },
            { id: 'business-ops', label: 'Business Operations' },
            { id: 'community-social', label: 'Community & Social Services' },
            { id: 'construction', label: 'Construction' },
            { id: 'customer-support', label: 'Customer Support' },
            { id: 'data-science', label: 'Data Science' },
            { id: 'education', label: 'Education' },
            { id: 'engineering', label: 'Engineering' },
            { id: 'food-service', label: 'Food Service' },
            { id: 'government', label: 'Government' },
            { id: 'healthcare', label: 'Healthcare' },
            { id: 'hospitality', label: 'Hospitality' },
            { id: 'hr-recruiting', label: 'HR & Recruiting' },
            { id: 'it', label: 'IT & Help Desk' },
            { id: 'legal', label: 'Legal' },
            { id: 'logistics', label: 'Logistics & Supply Chain' },
            { id: 'maintenance', label: 'Maintenance & Repair' },
            { id: 'manufacturing', label: 'Manufacturing' },
            { id: 'marketing', label: 'Marketing' },
            { id: 'media', label: 'Media & Communications' },
            { id: 'nonprofit', label: 'Nonprofit' },
            { id: 'project-mgmt', label: 'Project Management' },
            { id: 'real-estate', label: 'Real Estate' },
            { id: 'retail', label: 'Retail' },
            { id: 'sales', label: 'Sales' },
            { id: 'security', label: 'Security' },
            { id: 'software', label: 'Software Development' },
            { id: 'transportation', label: 'Transportation' },
            { id: 'warehouse', label: 'Warehouse' },
            { id: 'other', label: 'Other' },
        ];
        return res.json(categories);
    } catch {
        return res.json([]);
    }
});

/* --------------------------------- CREATE --------------------------------- */
/**
 * POST /api/jobs
 * Accepts either:
 *   { salary }  → maps to salary_min & salary_max
 *   or legacy { salary_min, salary_max }
 * Always requires valid coordinates (lat/lng).
 *
 * (Source ref of earlier implementation for context: jobs.js)  // filecite marker is placed outside code below.
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const body = req.body || {};

        // Strings (trim and cap lengths to schema)
        const title       = String(body.title || '').trim().slice(0, 65);
        const employer    = String(body.employer || '').trim().slice(0, 255);
        const category    = body.category ? String(body.category).trim().slice(0, 64) : null;
        const empType     = body.employment_type ? String(body.employment_type).trim() : null;
        const expLevel    = body.experience_level ? String(body.experience_level).trim() : null; // e.g. '2-3'
        const remote      = body.remote ? 1 : 0;
        const applyUrl    = body.apply_url ? String(body.apply_url).trim().slice(0, 512) : null;
        const street      = String(body.street_address || '').trim().slice(0, 255);
        const city        = String(body.city || '').trim().slice(0, 100);
        const county      = String(body.county || '').trim().replace(/ County$/i, '').slice(0, 100);
        const description = String(body.description || '');
        const expiresAt   = body.expires_at ? new Date(body.expires_at) : null;

        // Salary: allow new single "salary" or legacy min/max
        let salaryMin = null;
        let salaryMax = null;
        if (body.salary != null && body.salary !== '') {
            const s = Number(body.salary);
            if (Number.isFinite(s) && s >= 0) {
                salaryMin = Number(s.toFixed(2));
                salaryMax = Number(s.toFixed(2));
            }
        } else {
            salaryMin = body.salary_min != null && body.salary_min !== '' ? Number(body.salary_min) : null;
            salaryMax = body.salary_max != null && body.salary_max !== '' ? Number(body.salary_max) : null;
        }

        // Coordinates (required – we calculate on the client before submit)
        const lat = body.latitude  != null && body.latitude  !== '' ? Number(body.latitude)  : null;
        const lng = body.longitude != null && body.longitude !== '' ? Number(body.longitude) : null;

        if (!title)  return res.status(400).send('Title is required.');
        if (!county) return res.status(400).send('County is required.');
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).send('Missing or invalid coordinates.');
        }
        if (salaryMin != null && salaryMin < 0) return res.status(400).send('Pay must be ≥ 0.');
        if (salaryMax != null && salaryMax < 0) return res.status(400).send('Pay must be ≥ 0.');

        const [id] = await db('jobs').insert({
            title,
            employer: employer || null,
            description,                          // may be empty string
            street_address: street || null,
            city: city || null,
            county: county || null,
            user_id: req.user.id,
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
            category: category || null,
            employment_type: empType || null,
            experience_level: expLevel || null,
            remote,
            apply_url: applyUrl || null,
            salary_min: salaryMin,
            salary_max: salaryMax,
            latitude: lat,
            longitude: lng,
            posted_at: db.fn.now(),
            status: 'active',
            expires_at: expiresAt || null,
        });

        return res.status(201).json({ id });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'jobs_create_error' });
    }
});

/* --------------------------------- LIST ---------------------------------- */
// GET /api/jobs?search=&category=&type=&experience=&minPay=&maxPay=
//               &city=&county=&remote=0|1&sort=newest|oldest|highest
//               &view=all|mine&includeClosed=0|1&limit=&offset=
router.get('/', optionalAuth, async (req, res) => {
    try {
        const {
            search = '',
            category = '',
            type = '',
            experience = '',
            minPay = '',
            maxPay = '',
            city = '',
            county = '',
            remote = '',
            sort = 'newest',
            view = 'all',
            includeClosed = '0',
            limit: limitQ = DEFAULT_LIMIT,
            offset: offsetQ = 0,
        } = req.query;

        const limit = clamp(Number(limitQ) || DEFAULT_LIMIT, 1, MAX_LIMIT);
        const offset = Math.max(0, Number(offsetQ) || 0);

        const viewerId = req.user?.id || 0;

        let q = db('jobs as j')
            .join('users as u', 'j.user_id', 'u.id')
            .where((qb) => {
                if (includeClosed !== '1') qb.andWhere('j.status', 'active');
            });

        // View filters
        if (view === 'mine') {
            if (!viewerId) return res.json([]);
            q.andWhere('j.user_id', viewerId);
        }
        // NOTE: no "saved" view anymore.

        // Text search
        if (search) {
            const s = `%${search}%`;
            q.andWhere((qb) => {
                qb.where('j.title', 'like', s)
                    .orWhere('j.employer', 'like', s)
                    .orWhere('j.description', 'like', s)
                    .orWhere('j.city', 'like', s)
                    .orWhere('j.county', 'like', s);
            });
        }

        // Facets
        if (category) q.andWhere('j.category', category);
        if (type) q.andWhere('j.employment_type', type);
        if (experience) q.andWhere('j.experience_level', experience);
        if (minPay) q.andWhere('j.salary_min', '>=', Number(minPay));
        if (maxPay) q.andWhere('j.salary_max', '<=', Number(maxPay));

        const remoteOnly = isTruthy(remote);
        if (remoteOnly) {
            q.andWhere('j.remote', 1);
        } else {
            if (city) q.andWhere('j.city', city);
            if (county) q.andWhere('j.county', county);
        }

        // Sorts (popular removed – depended on job_saves)
        if (sort === 'newest') {
            q.orderByRaw('COALESCE(j.posted_at, j.created_at) DESC');
        } else if (sort === 'oldest') {
            q.orderByRaw('COALESCE(j.posted_at, j.created_at) ASC');
        } else if (sort === 'highest') {
            q.orderBy([{ column: 'j.salary_max', order: 'desc' }, { column: 'j.salary_min', order: 'desc' }]);
        } else {
            q.orderBy('j.id', 'desc');
        }

        q.limit(limit).offset(offset);

        const rows = await q.select(
            'j.id',
            'j.user_id',
            'j.title',
            'j.employer',
            'j.category',
            'j.employment_type',
            'j.experience_level',
            'j.remote',
            'j.apply_url',
            'j.salary_min',
            'j.salary_max',
            db.raw('COALESCE(j.street_address, j.location) AS street_address'),
            'j.city',
            'j.county',
            'j.latitude',
            'j.longitude',
            'j.description',
            db.raw('COALESCE(j.posted_at, j.created_at) AS posted_at'),
            'j.status',
            'j.expires_at',
            'u.first_name',
            'u.last_name',
            db.raw('COALESCE(u.handle, "") AS handle'),
            db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
            db.raw('COALESCE(u.profile_picture, "") AS profile_picture')
        );

        return res.json(rows);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'jobs_list_error' });
    }
});

/* --------------------------------- SINGLE -------------------------------- */
router.get('/:id(\\d+)', optionalAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);

        const row = await db('jobs as j')
            .join('users as u', 'j.user_id', 'u.id')
            .where('j.id', id)
            .first(
                'j.id',
                'j.user_id',
                'j.title',
                'j.employer',
                'j.category',
                'j.employment_type',
                'j.experience_level',
                'j.remote',
                'j.apply_url',
                'j.salary_min',
                'j.salary_max',
                db.raw('COALESCE(j.street_address, j.location) AS street_address'),
                'j.city',
                'j.county',
                'j.latitude',
                'j.longitude',
                'j.description',
                db.raw('COALESCE(j.posted_at, j.created_at) AS posted_at'),
                'j.status',
                'j.expires_at',
                'u.first_name',
                'u.last_name',
                db.raw('COALESCE(u.handle, "") AS handle'),
                db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
                db.raw('COALESCE(u.profile_picture, "") AS profile_picture')
            );

        if (!row) return res.status(404).json({ error: 'not_found' });
        return res.json(row);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.status(500).json({ error: 'jobs_single_error' });
    }
});

export default router;
