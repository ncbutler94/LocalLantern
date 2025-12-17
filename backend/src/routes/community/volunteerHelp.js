// backend/src/routes/community/volunteerHelp.js
// -----------------------------------------------------------------------------
// Community: Volunteer Offers + Help Requests API
// -----------------------------------------------------------------------------
//
// What this route does:
//  • Validates fields + ≤4 photos
//  • Uploads photos to GCS
//  • Inserts 1 row in community_posts         (aggregator)
//  • Inserts 1 row in volunteer_help_requests (detail; shares id)
//  • Optionally inserts rows in community_photos
//
// Notes:
//  • This endpoint is intentionally COMMUNITY-oriented (volunteer/neighbor help)
//  • Paid/marketplace work should live on the Services page, not here
// -----------------------------------------------------------------------------

import express from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';

import knex from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ── Google Cloud Storage ─────────────────────────────────────────────────── */
const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/volunteer-and-help-requests';
const upload = multer({ storage: multer.memoryStorage() });

/* ── Allowed values (keep DB + UI in sync) ───────────────────────────────── */
const HELP_TYPES = [
    // original
    'labor',
    'staffing',
    'skills',
    'other',
    // new (community-oriented)
    'rides',
    'meals',
    'donations',
    'care',
];

const URGENCY_OPTIONS = ['flexible', 'soon', 'urgent'];
const TRAVEL_RADIUS_OPTIONS = ['city', 'county', 'neighboring_counties', 'statewide'];
const CONTACT_METHOD_OPTIONS = ['either', 'text', 'call', 'email'];

/* ── Validation (location optional) ──────────────────────────────────────── */
const validate = [
    body('title').trim().notEmpty().isLength({ max: 80 }),

    // help vs volunteer
    body('request_kind').optional({ nullable: true }).isIn(['help', 'volunteer']),

    // must match ENUM / allowed list in DB
    body('help_type').notEmpty().isIn(HELP_TYPES),

    // If help_type is "other", require a short label.
    body('help_type_other')
        .custom((value, { req }) => {
            const helpType = String(req.body.help_type || '').trim().toLowerCase();
            const otherVal = String(value || '').trim();
            if (helpType === 'other' && !otherVal) {
                throw new Error('Please specify the other category.');
            }
            return true;
        })
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 80 }),

    // optional
    body('needed_date').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('contact').trim().notEmpty().isLength({ max: 255 }),

    // optional: help-request details
    body('needed_time').optional({ nullable: true }).trim().isLength({ max: 80 }),
    body('helpers_needed').optional({ nullable: true }).isInt({ min: 1, max: 999 }).toInt(),
    body('urgency').optional({ nullable: true }).isIn(URGENCY_OPTIONS),

    // optional: volunteer-offer details
    body('availability').optional({ nullable: true }).trim().isLength({ max: 160 }),
    body('travel_radius').optional({ nullable: true }).isIn(TRAVEL_RADIUS_OPTIONS),

    // optional: shared
    body('contact_method').optional({ nullable: true }).isIn(CONTACT_METHOD_OPTIONS),

    body('extra_notes').trim().isLength({ max: 2000 }).optional({ nullable: true }),

    body('city').trim().optional({ nullable: true }),
    body('county').trim().optional({ nullable: true }),

    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
];

function normalizeKind(v) {
    const raw = String(v || '').trim().toLowerCase();
    return raw === 'volunteer' ? 'volunteer' : 'help';
}

function normalizeContactMethod(v) {
    const raw = String(v || '').trim().toLowerCase();
    return CONTACT_METHOD_OPTIONS.includes(raw) ? raw : 'either';
}

function normalizeUrgency(v) {
    const raw = String(v || '').trim().toLowerCase();
    return URGENCY_OPTIONS.includes(raw) ? raw : 'flexible';
}

function normalizeTravelRadius(v) {
    const raw = String(v || '').trim().toLowerCase();
    return TRAVEL_RADIUS_OPTIONS.includes(raw) ? raw : 'county';
}

/* ── POST /api/volunteer-help ─────────────────────────────────────────────── */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 4),
    validate,
    async (req, res, next) => {
        /* 1️⃣ Field errors → 422 */
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        /* 2️⃣ Upload photos to GCS */
        let photoUrls = [];
        try {
            photoUrls = await Promise.all(
                (req.files || []).map((file) => {
                    const gcsName = `${FOLDER_PREFIX}/${Date.now()}_${file.originalname}`;
                    const blob = bucket.file(gcsName);
                    const stream = blob.createWriteStream({
                        metadata: { contentType: file.mimetype },
                    });
                    return new Promise((resolve, reject) => {
                        stream
                            .on('error', reject)
                            .on('finish', () =>
                                resolve(`https://storage.googleapis.com/${bucket.name}/${gcsName}`),
                            );
                        stream.end(file.buffer);
                    });
                }),
            );
        } catch (err) {
            return next(err);
        }

        /* 3️⃣ Transaction */
        const {
            title,
            help_type,
            help_type_other = null,
            extra_notes = '',
            needed_date,
            contact,
            city = null,
            county = null,
            latitude,
            longitude,
            needed_time = null,
            helpers_needed = null,
            urgency,
            availability = null,
            travel_radius,
            contact_method,
        } = req.body;

        const request_kind = normalizeKind(req.body.request_kind);

        // Split categories for Community UX
        // - help requests   => category 'help-requests'
        // - volunteer offers => category 'volunteer-requests'
        const category = request_kind === 'volunteer' ? 'volunteer-requests' : 'help-requests';

        const trx = await knex.transaction();
        try {
            /* a) aggregator row */
            const [postId] = await trx('community_posts').insert({
                user_id: req.user.id,
                category,
                title,
                // Keep full notes here so cards can preview it (they typically clamp text)
                description: extra_notes,
                city,
                county,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                posted_at: trx.fn.now(),
            });

            /* b) detail row */
            await trx('volunteer_help_requests').insert({
                id: postId,
                request_kind,
                help_type,
                help_type_other:
                    String(help_type).trim().toLowerCase() === 'other'
                        ? String(help_type_other || '').trim() || null
                        : null,
                needed_date: needed_date ? needed_date : null,
                needed_time: needed_time ? String(needed_time).trim() : null,
                helpers_needed: typeof helpers_needed === 'number' ? helpers_needed : null,
                urgency: normalizeUrgency(urgency),
                availability: availability ? String(availability).trim() : null,
                travel_radius: normalizeTravelRadius(travel_radius),
                contact_method: normalizeContactMethod(contact_method),
                extra_notes,
                contact: String(contact || '').trim(),
                created_at: trx.fn.now(),
            });

            /* c) photo table (optional, keeps UI uniform) */
            if (photoUrls.length) {
                await trx('community_photos').insert(
                    photoUrls.map((url, idx) => ({
                        post_id: postId,
                        url,
                        position: idx,
                    })),
                );
            }

            /* commit */
            await trx.commit();
            res.status(201).json({ id: postId, photos: photoUrls });
        } catch (err) {
            await trx.rollback();
            next(err);
        }
    },
);

export default router;
