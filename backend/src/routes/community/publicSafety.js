// backend/src/routes/community/publicSafety.js
import express from 'express';
import multer  from 'multer';
import { Storage } from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';

import db                 from '../../config/db.js';
import authenticateToken  from '../../middleware/auth.js';

const router = express.Router();

/* ─────────── Google Cloud Storage ─────────── */
const storage       = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket        = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/public-safety';
const upload        = multer({ storage: multer.memoryStorage() });

/* ─────────── Validation ───────────
   (severity / alert_type / alert_type_other removed) */
const validate = [
    body('title').trim().notEmpty().isLength({ max: 50 }),
    body('expires_at').isISO8601().toDate().optional({ nullable: true }),
    body('county').trim().notEmpty(),
    body('city').trim().optional({ nullable: true }),
];

/* ─────────── POST /api/public-safety ─────────── */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 8),
    validate,
    async (req, res, next) => {
        /* 1. validation errors */
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        /* 2. upload photos */
        let photoUrls = [];
        try {
            photoUrls = await Promise.all(
                (req.files || []).map((file) => {
                    const gcsName = `${FOLDER_PREFIX}/${Date.now()}_${file.originalname}`;
                    const blob    = bucket.file(gcsName);
                    const stream  = blob.createWriteStream({ metadata: { contentType: file.mimetype } });

                    return new Promise((resolve, reject) => {
                        stream
                            .on('error', reject)
                            .on('finish', () =>
                                resolve(`https://storage.googleapis.com/${bucket.name}/${gcsName}`)
                            );
                        stream.end(file.buffer);
                    });
                })
            );
        } catch (err) {
            return next(err);
        }

        /* 3. DB transaction */
        const {
            title,
            description = '',
            expires_at  = null,
            city,
            county,
            latitude,
            longitude,
            visibility = 'public',
        } = req.body;

        try {
            const id = await db.transaction(async (trx) => {
                /* a) community_posts */
                const [postId] = await trx('community_posts').insert({
                    user_id   : req.user.id,
                    category  : 'public-safety-alerts',
                    title,
                    description,
                    visibility,
                    city,
                    county,
                    latitude  : latitude  ? parseFloat(latitude)  : null,
                    longitude : longitude ? parseFloat(longitude) : null,
                    posted_at : trx.fn.now(),
                });

                /* b) public_safety_alerts  (alert-type columns removed) */
                await trx('public_safety_alerts').insert({
                    id        : postId,
                    user_id   : req.user.id,
                    title,
                    body      : description,
                    city,
                    county,
                    latitude  : latitude  ? parseFloat(latitude)  : null,
                    longitude : longitude ? parseFloat(longitude) : null,
                    expires_at,
                });

                /* c) community_photos */
                if (photoUrls.length) {
                    await trx('community_photos').insert(
                        photoUrls.map((url, idx) => ({
                            post_id : postId,
                            url,
                            position: idx,
                        }))
                    );
                }

                return postId;
            });

            res.status(201).json({ id, photos: photoUrls });
        } catch (err) {
            next(err);
        }
    }
);

/* ─────────── GET /api/public-safety ───────────
   Returns all active alerts, auto-filters expired ones. */
router.get('/', async (req, res, next) => {
    try {
        const { city = '', county = '' } = req.query;

        const q = db('community_posts as cp')
            .join('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_photos as p', 'cp.id', 'p.post_id')
            .select(
                'cp.id',
                'u.first_name',
                'u.last_name',
                'u.avatar_url',
                'cp.posted_at',
                'cp.title',
                'cp.description',
                'cp.city',
                'cp.county',
                'psa.expires_at',
                db.raw('JSON_ARRAYAGG(p.url) AS photos')
            )
            .groupBy('cp.id')
            .where((qb) => {
                /* remove expired alerts */
                qb.whereNull('psa.expires_at').orWhere('psa.expires_at', '>', db.fn.now());
            });

        if (city.trim()) {
            q.whereRaw('LOWER(cp.city) = ?', city.trim().toLowerCase());
        } else if (county.trim()) {
            q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());
        }

        res.json(await q);
    } catch (err) {
        next(err);
    }
});

export default router;
