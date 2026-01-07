// community/recommendations.js
import express       from 'express';
import multer        from 'multer';
import { Storage }   from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';

import knex              from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router  = express.Router();

/* ── Google Cloud Storage setup (identical to announcements) ── */
const storage       = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket        = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/recommendations';
const upload        = multer({ storage: multer.memoryStorage() });

/* ── Field validation ── */
const validate = [
    body('title').trim().notEmpty().isLength({ max: 80 }),
    body('description').trim().isLength({ max: 2000 }).optional({ nullable: true }),
    body('city').trim().optional({ nullable: true }),
    body('county').trim().notEmpty()
];

/* ── POST /api/recommendations ── */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 10),
    validate,
    async (req, res, next) => {

        /* 1️⃣ validate */
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        /* 2️⃣ upload photos to GCS (identical pattern) */
        // see announcements route lines 40-60 for the exact Promise flow ➜
        let photoUrls = [];
        try {
            photoUrls = await Promise.all(
                (req.files || []).map(file => {
                    const gcsName = `${FOLDER_PREFIX}/${Date.now()}_${file.originalname}`;
                    const blob    = bucket.file(gcsName);
                    const stream  = blob.createWriteStream({ metadata: { contentType: file.mimetype } });
                    return new Promise((resolve, reject) => {
                        stream.on('error', reject)
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

        /* 3️⃣ INSERT in a single transaction */
        const {
            title,
            description = '',
            city  = null,
            county,
            latitude,
            longitude
        } = req.body;

        const trx = await knex.transaction();
        try {
            /* a) aggregator table (global feed) */
            const [postId] = await trx('community_posts').insert({
                user_id : req.user.id,
                category: 'recommendations',     // CATEGORY
                title,
                description,
                city,
                county,
                latitude : latitude  ? parseFloat(latitude)  : null,
                longitude: longitude ? parseFloat(longitude) : null,
                posted_at: trx.fn.now()
            });

            /* b) main table */
            await trx('recommendations').insert({
                id         : postId,            // keep IDs aligned
                user_id    : req.user.id,
                title,
                description,
                city,
                county,
                latitude : latitude  ? parseFloat(latitude)  : null,
                longitude: longitude ? parseFloat(longitude) : null,
                photos    : JSON.stringify(photoUrls)        // ← text[] if you prefer
            });

            /* c) optional: community_photos for consistency */
            if (photoUrls.length) {
                await trx('community_photos').insert(
                    photoUrls.map((url, idx) => ({
                        post_id : postId,
                        url,
                        position: idx
                    }))
                );
            }

            await trx.commit();
            res.status(201).json({ id: postId, photos: photoUrls });
        } catch (err) {
            await trx.rollback();
            next(err);
        }
    }
);

export default router;
