// backend/src/routes/community/lostAndFound.js
import express from 'express';
import multer  from 'multer';
import { Storage } from '@google-cloud/storage';
import db from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ---------------------------------------------------------------------------
 * Multer & Google Cloud Storage setup
 * ------------------------------------------------------------------------- */
const upload = multer({
    storage: multer.memoryStorage(),
    limits : { files: 8, fileSize: 5 * 1024 * 1024 }   // 8 × 5 MB
});

const storage       = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket        = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/lost-and-found';

/* ---------------------------------------------------------------------------
 * POST /api/lost-and-found
 * ------------------------------------------------------------------------- */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 8),
    async (req, res, next) => {
        try {
            /* 1️⃣ upload photos ---------------------------------------------------- */
            const photoUrls = await Promise.all(
                (req.files || []).map(file => {
                    const gcsName = `${FOLDER_PREFIX}/${Date.now()}_${file.originalname}`;
                    const blob    = bucket.file(gcsName);
                    const stream  = blob.createWriteStream({
                        metadata: { contentType: file.mimetype }
                    });

                    return new Promise((resolve, reject) => {
                        stream
                            .on('error', reject)
                            .on('finish', () =>
                                resolve(
                                    `https://storage.googleapis.com/${bucket.name}/${gcsName}`
                                )
                            );
                        stream.end(file.buffer);
                    });
                })
            );

            /* 2️⃣ single-transaction insert -------------------------------------- */
            const newId = await db.transaction(async trx => {
                /* a) community_posts */
                const [postId] = await trx('community_posts').insert({
                    category     : 'lost-and-found',
                    user_id      : req.user.id,
                    date_created : trx.fn.now(),
                    posted_at    : trx.fn.now(),
                    title        : req.body.title,
                    description  : req.body.description || null,
                    visibility   : req.body.visibility || 'public',        // ★ NEW ★
                    street_address: req.body.street_address || null,
                    city         : req.body.city   || null,
                    county       : req.body.county || null,
                    latitude     : req.body.latitude  ? parseFloat(req.body.latitude)  : null,
                    longitude    : req.body.longitude ? parseFloat(req.body.longitude) : null
                });

                /* b) lost_and_found (unchanged) */
                await trx('lost_and_found').insert({
                    id            : postId,
                    date_created  : trx.fn.now(),
                    user_id       : req.user.id,
                    title         : req.body.title,
                    description   : req.body.description || null,
                    lost_or_found : req.body.lost_or_found,
                    reward        : req.body.lost_or_found === 'lost' ? req.body.reward : null,
                    street_address: req.body.street_address || null,
                    city          : req.body.city   || null,
                    county        : req.body.county || null,
                    latitude      : req.body.latitude  ? parseFloat(req.body.latitude)  : null,
                    longitude     : req.body.longitude ? parseFloat(req.body.longitude) : null
                });

                /* c) community_photos (unchanged) */
                if (photoUrls.length) {
                    await trx('community_photos').insert(
                        photoUrls.map((url, idx) => ({
                            post_id : postId,
                            url,
                            position: idx
                        }))
                    );
                }

                return postId;
            });

            /* 3️⃣ respond ---------------------------------------------------------- */
            res.status(201).json({ id: newId, photos: photoUrls });
        } catch (err) {
            next(err);
        }
    }
);

// ─── GET /api/lost-and-found ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const { city = '', county = '' } = req.query;

        const q = db('community_posts as cp')
            .join('lost_and_found as lf', 'cp.id', 'lf.id')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_photos as p', 'cp.id', 'p.post_id')
            .select(
                'cp.id',
                'u.first_name',
                'u.last_name',
                'u.avatar_url',
                'cp.date_created',
                'cp.visibility',
                'lf.title',
                'lf.description',
                'lf.lost_or_found',
                'lf.reward',
                'lf.street_address',
                'lf.city',
                'lf.county',
                db.raw('(SELECT COUNT(*) FROM post_likes    WHERE post_id = cp.id) AS like_count'),
                db.raw('(SELECT COUNT(*) FROM post_comments WHERE post_id = cp.id) AS comment_count'),
                db.raw('JSON_ARRAYAGG(p.url) AS photos')
            )
            .groupBy('cp.id');            // ← add this single line

        /* any existing filters or orderBy() calls stay as-is */

        res.json(await q);
    } catch (err) {
        next(err);
    }
});


export default router;
