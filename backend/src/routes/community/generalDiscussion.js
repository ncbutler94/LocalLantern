import express from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';

import db from '../../config/db.js'; // adjust path if needed
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ───── Google Cloud Storage setup (same pattern as the other categories) ───── */
const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/general-discussion'; // ← folder already created
const upload = multer({ storage: multer.memoryStorage() });

/* ───── validation (location optional) ───── */
const validate = [
    body('title').trim().notEmpty().isLength({ max: 50 }),
    body('description').trim().isLength({ max: 1000 }).optional({ nullable: true }),
    body('county').trim().optional({ nullable: true }),
    body('city').trim().optional({ nullable: true }),
    body('visibility').isIn(['public', 'followers']).optional({ nullable: true }),
];

/* ───── POST /api/general-discussion ───── */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 8),
    validate,
    async (req, res, next) => {
        /* 1. validate body -------------------------------------------------------- */
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        /* 2. upload photos -------------------------------------------------------- */
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

        /* 3. single-transaction insert ------------------------------------------- */
        const { title, description = '', latitude, longitude } = req.body;

        // default location to user's profile when not supplied
        const city =
            (req.body.city ?? req.user?.city ?? '').toString().trim() || null;
        const county =
            (req.body.county ?? req.user?.county ?? '').toString().trim() || null;

        try {
            const id = await db.transaction(async (trx) => {
                /* a) community_posts */
                const [postId] = await trx('community_posts').insert({
                    user_id: req.user.id,
                    category: 'general-discussion',
                    title,
                    description,
                    visibility: req.body.visibility || 'public', // default for now
                    city,
                    county,
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    posted_at: trx.fn.now(),
                });

                // b) general_discussion – mirror the announcements insert
                await trx('general_discussion').insert({
                    id: postId,
                    user_id: req.user.id,
                    title,
                    body: description,
                    city,
                    county,
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    // date_created defaults to NOW() via schema
                });

                /* c) community_photos */
                if (photoUrls.length) {
                    await trx('community_photos').insert(
                        photoUrls.map((url, idx) => ({
                            post_id: postId,
                            url,
                            position: idx,
                        })),
                    );
                }

                return postId;
            });

            res.status(201).json({ id, photos: photoUrls });
        } catch (err) {
            next(err);
        }
    },
);

/* ───── GET /api/general-discussion (list with optional location filters) ───── */
router.get('/', async (req, res, next) => {
    try {
        const { city = '', county = '' } = req.query;

        const q = db('community_posts as cp')
            .join('general_discussion as gd', 'cp.id', 'gd.id') // tie-in row
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
                db.raw('(SELECT COUNT(*) FROM post_likes    WHERE post_id = cp.id) AS like_count'),
                db.raw('(SELECT COUNT(*) FROM post_comments WHERE post_id = cp.id) AS comment_count'),
                db.raw('COALESCE(JSON_ARRAYAGG(p.url), JSON_ARRAY()) AS photos'),
            )
            .groupBy('cp.id')
            .orderBy('cp.posted_at', 'desc');

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
