// backend/src/routes/auth.js
import 'dotenv/config';
import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import db from '../config/db.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-me';

// Keep handle rules consistent with the rest of the app
const handleRegex = /^[a-zA-Z0-9_.-]{3,30}$/;
// Password: 10–20 chars, at least 1 uppercase and 1 special character
const passwordRegex = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{10,20}$/;
// Simple email check; we also normalize/trim below
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password reset token settings
const RESET_TOKEN_BYTES = 32; // 32 bytes => 64 hex chars
const RESET_TOKEN_REGEX = /^[a-f0-9]{64}$/i;
const RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60);

const APP_NAME = process.env.APP_NAME || 'The Local Lantern';

const toISO = (v) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.valueOf())) return null;
    return d.toISOString().slice(0, 10);
};

const toPublicUser = (u) => {
    if (!u) return null;
    return {
        id: u.id,
        public_id: u.public_id,
        handle: u.handle,
        first_name: u.first_name,
        last_name: u.last_name,
        bio: u.bio || '',
        avatar_url: u.avatar_url || u.profile_picture || null,
        profile_picture: u.profile_picture || null,
        cover_url: u.cover_url || null,
        relationship: u.relationship ?? null,
        birthday: u.birthday || null,
        job_title: u.job_title || null,
        employer: u.employer || null,
        high_school: u.high_school || null,
        college: u.college || null,
        degree: u.degree || null,
        home_city: u.home_city || null,
        home_county: u.home_county || null,
        work_history_json: u.work_history_json || null,
        education_history_json: u.education_history_json || null,
        created_at: u.created_at,
        privacy_json: u.privacy_json || null,
        social_json: u.social_json || null,
    };
};

async function hasColumn(table, column) {
    try {
        return await db.schema.hasColumn(table, column);
    } catch {
        return false;
    }
}

function setAuthCookie(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // also set a second name some middlewares expect
    res.cookie('access_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

function getFrontendBaseUrl() {
    const raw = String(process.env.FRONTEND_URL || 'http://localhost:3000');
    const first = raw.split(',').map((s) => s.trim()).filter(Boolean)[0];
    return first || 'http://localhost:3000';
}

function sha256Hex(input) {
    return crypto.createHash('sha256').update(String(input)).digest('hex');
}

async function ensurePasswordResetTable() {
    const exists = await db.schema.hasTable('password_reset_tokens');
    if (exists) return;

    await db.schema.createTable('password_reset_tokens', (t) => {
        t.increments('id').primary();
        t.integer('user_id').notNullable().index();
        t.string('token_hash', 64).notNullable().unique();
        t.dateTime('expires_at').notNullable().index();
        t.dateTime('used_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
    });
}

function truthyEnv(v) {
    return String(v || '').trim().toLowerCase() === 'true';
}

function getSmtpConfig() {
    const host =
        process.env.SMTP_HOST ||
        process.env.EMAIL_HOST ||
        process.env.MAIL_HOST ||
        '';

    const portRaw =
        process.env.SMTP_PORT ||
        process.env.EMAIL_PORT ||
        process.env.MAIL_PORT ||
        '';

    const user =
        process.env.SMTP_USER ||
        process.env.SMTP_USERNAME ||
        process.env.EMAIL_USER ||
        process.env.MAIL_USER ||
        '';

    const pass =
        process.env.SMTP_PASS ||
        process.env.SMTP_PASSWORD ||
        process.env.EMAIL_PASS ||
        process.env.MAIL_PASS ||
        '';

    const port = Number(portRaw || 587);

    const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
    const secure = secureEnv === 'true' || port === 465;

    if (!host || !user || !pass) return null;

    // For STARTTLS (587), it's generally correct to require TLS upgrade
    const requireTLS = port === 587 && !secure;

    // Allow self-signed certs ONLY if explicitly enabled
    // (useful in dev / corporate MITM environments; not recommended in prod)
    const allowSelfSigned = truthyEnv(process.env.SMTP_ALLOW_SELF_SIGNED);

    const tls = {};
    if (allowSelfSigned) {
        tls.rejectUnauthorized = false;
    }

    const smtp = {
        host,
        port,
        secure,
        auth: { user, pass },
        ...(requireTLS ? { requireTLS: true } : {}),
        ...(Object.keys(tls).length ? { tls } : {}),
    };

    return smtp;
}

function getFromAddress() {
    const address =
        process.env.SMTP_FROM ||
        process.env.EMAIL_FROM ||
        process.env.MAIL_FROM ||
        process.env.SMTP_USER ||
        process.env.EMAIL_USER ||
        '';

    const name =
        process.env.EMAIL_FROM_NAME ||
        process.env.MAIL_FROM_NAME ||
        APP_NAME;

    if (!address) {
        return { name: APP_NAME, address: 'no-reply@locallantern.com' };
    }
    return { name, address };
}

function resolveLogoPath() {
    const candidates = [
        path.resolve(process.cwd(), 'src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../../src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), 'frontend/src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../frontend/src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), 'client/src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../client/src/assets/LocalLanternLogo.png'),
    ];

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch {
            // ignore
        }
    }
    return null;
}

async function sendPasswordResetEmail({ toEmail, resetUrl }) {
    const smtp = getSmtpConfig();
    if (!smtp) {
        if (!isProd) {
            throw new Error(
                'SMTP is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (or your EMAIL_* equivalents).'
            );
        }
        // In production, fail silently to avoid leaking internal config errors.
        return;
    }

    const transporter = nodemailer.createTransport(smtp);

    // Optional: verify SMTP connectivity in dev for clearer logs
    if (!isProd && truthyEnv(process.env.SMTP_DEBUG)) {
        try {
            // verify() can throw the exact TLS/auth error Nodemailer sees
            await transporter.verify();
        } catch (verifyErr) {
            console.error('[auth/sendPasswordResetEmail] SMTP verify failed:', verifyErr);
            throw verifyErr;
        }
    }

    const from = getFromAddress();

    const logoPath = resolveLogoPath();
    const logoCid = 'locallantern-logo';

    const logoHtml = logoPath
        ? `<div style="text-align:center;margin-bottom:16px;">
         <img src="cid:${logoCid}" alt="${APP_NAME}" style="max-width:180px;height:auto;display:inline-block;" />
       </div>`
        : `<div style="text-align:center;margin-bottom:16px;font-weight:700;font-size:18px;">${APP_NAME}</div>`;

    const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#ffffff; color:#111; padding:24px;">
      ${logoHtml}
      <h2 style="margin:0 0 8px 0;">Reset your password</h2>
      <p style="margin:0 0 16px 0; line-height:1.5;">
        We received a request to reset the password for your ${APP_NAME} account.
      </p>

      <div style="margin:20px 0; text-align:center;">
        <a href="${resetUrl}"
           style="display:inline-block; padding:12px 18px; background:#1976d2; color:#fff; text-decoration:none; border-radius:8px; font-weight:700;">
          Reset password
        </a>
      </div>

      <p style="margin:0 0 10px 0; line-height:1.5;">
        If you did not request a password reset, you can safely ignore this email.
      </p>

      <p style="margin:0; font-size:12px; color:#666; line-height:1.5;">
        This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:18px 0;" />

      <p style="margin:0; font-size:12px; color:#666; line-height:1.5;">
        If the button doesn’t work, copy and paste this link into your browser:<br />
        <span style="word-break:break-all;">${resetUrl}</span>
      </p>
    </div>
  `;

    const text = `Reset your password for ${APP_NAME}\n\nOpen this link to reset your password:\n${resetUrl}\n\nIf you didn't request this, ignore this email.\nThis link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`;

    const attachments = [];
    if (logoPath) {
        attachments.push({
            filename: 'LocalLanternLogo.png',
            path: logoPath,
            cid: logoCid,
        });
    }

    await transporter.sendMail({
        from,
        to: toEmail,
        subject: `Reset your ${APP_NAME} password`,
        text,
        html,
        attachments,
    });
}

/**
 * GET /auth/me — returns the current user (if any)
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const u = await db('users').where({ id: req.user.id }).first();
        if (!u) return res.status(401).json({ message: 'Not signed in' });
        res.json({ user: toPublicUser(u) });
    } catch {
        res.status(500).json({ message: 'Failed to load user' });
    }
});

/**
 * POST /auth/register — create account & sign in
 * Body: { email, first_name, last_name, handle, password, home_city, home_county, dob }
 */
router.post(
    '/register',
    [
        body('email').isEmail().normalizeEmail(),
        body('first_name').isLength({ min: 1, max: 50 }).trim(),
        body('last_name').isLength({ min: 1, max: 50 }).trim(),
        body('handle')
            .custom((h) => handleRegex.test(String(h || '')))
            .withMessage('Handle may contain letters, numbers, dot, dash, underscore (3–30 chars).'),
        body('password')
            .custom((p) => passwordRegex.test(String(p || '')))
            .withMessage('Password must be 10–20 chars and include at least 1 uppercase and 1 special character.'),
        body('home_city').isLength({ min: 1, max: 120 }),
        body('home_county').isLength({ min: 1, max: 120 }),
        body('dob').isISO8601().withMessage('Valid date of birth is required.'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array(), message: 'Invalid input.' });

        const email = String(req.body.email).toLowerCase().trim();
        const first_name = String(req.body.first_name || '').trim();
        const last_name = String(req.body.last_name || '').trim();
        const handle = String(req.body.handle || '').trim();
        const home_city = String(req.body.home_city || '').trim();
        const home_county = String(req.body.home_county || '').trim();
        const dobISO = toISO(req.body.dob);

        // Enforce 18+
        const today = new Date();
        const cutoff = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        if (!dobISO || new Date(dobISO) > cutoff) {
            return res.status(400).json({ message: 'You must be at least 18 years old to sign up.' });
        }

        try {
            // Uniqueness
            const existingEmail = await db('users').whereRaw('LOWER(email)=LOWER(?)', [email]).first();
            if (existingEmail) return res.status(409).json({ message: 'That email is already in use.' });

            const existingHandle = await db('users').whereRaw('LOWER(handle)=LOWER(?)', [handle]).first();
            if (existingHandle) return res.status(409).json({ message: 'That profile URL is already taken.' });

            const password_hash = await bcrypt.hash(String(req.body.password), 12);

            // Insert user
            const [id] = await db('users').insert({
                email,
                first_name,
                last_name,
                handle,
                password_hash,
                home_city,
                home_county,
                birthday: dobISO,
                created_at: db.fn.now(),
                updated_at: db.fn.now(),
            });

            // Set public_id = id (if column exists)
            if (await hasColumn('users', 'public_id')) {
                await db('users').where({ id }).update({ public_id: id });
            }

            const u = await db('users').where({ id }).first();

            // Sign & set JWT cookie
            const token = jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
            setAuthCookie(res, token);

            return res.status(201).json({ user: toPublicUser(u) });
        } catch (err) {
            console.error('[auth/register] error', err);
            return res.status(500).json({ message: 'Could not create account.' });
        }
    }
);

/**
 * POST /auth/login — login with email OR username (handle)
 * Body: { login, password }  // "login" may be an email or a handle.
 *        (backward compatible: { email, password } still works)
 */
router.post(
    '/login',
    [
        body('password').isLength({ min: 1 }),
        // 'login' or 'email' will be validated in handler to support either format
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: 'Invalid input.' });

        const rawLogin = String(req.body.login ?? req.body.email ?? '').trim();
        const password = String(req.body.password || '');

        if (!rawLogin) {
            return res.status(400).json({ message: 'Email or username is required.' });
        }

        try {
            let u = null;
            if (emailRegex.test(rawLogin.toLowerCase())) {
                // Treat as email
                const email = rawLogin.toLowerCase();
                u = await db('users').whereRaw('LOWER(email)=LOWER(?)', [email]).first();
            } else {
                // Treat as username/handle (case-insensitive, allow leading @)
                const handle = rawLogin.replace(/^@/, '');
                if (!handleRegex.test(handle)) {
                    // Even if the handle format is off, don't leak which part is wrong.
                    return res.status(401).json({ message: 'Invalid email/username or password.' });
                }
                u = await db('users').whereRaw('LOWER(handle)=LOWER(?)', [handle]).first();
            }

            if (!u || !u.password_hash) {
                return res.status(401).json({ message: 'Invalid email/username or password.' });
            }

            const ok = await bcrypt.compare(password, u.password_hash);
            if (!ok) return res.status(401).json({ message: 'Invalid email/username or password.' });

            const token = jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
            setAuthCookie(res, token);
            return res.json({ user: toPublicUser(u) });
        } catch {
            return res.status(500).json({ message: 'Login failed.' });
        }
    }
);

/**
 * POST /auth/forgot-password
 * Body: { login } // email OR username
 *
 * Always responds with ok:true to avoid user enumeration.
 */
router.post(
    '/forgot-password',
    [body('login').isLength({ min: 1, max: 254 }).trim()],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: 'Invalid input.' });

        const raw = String(req.body.login || '').trim();
        const looksLikeEmail = emailRegex.test(raw.toLowerCase());

        try {
            await ensurePasswordResetTable();

            let u = null;
            if (looksLikeEmail) {
                const email = raw.toLowerCase();
                u = await db('users').whereRaw('LOWER(email)=LOWER(?)', [email]).first();
            } else {
                const handle = raw.replace(/^@/, '');
                if (handleRegex.test(handle)) {
                    u = await db('users').whereRaw('LOWER(handle)=LOWER(?)', [handle]).first();
                } else {
                    // If malformed username, still return ok:true
                    u = null;
                }
            }

            if (u && u.email) {
                // cleanup older tokens (best effort)
                try {
                    await db('password_reset_tokens')
                        .where('expires_at', '<', db.fn.now())
                        .orWhereNotNull('used_at')
                        .del();
                } catch {
                    // ignore
                }

                // Create token
                const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
                const tokenHash = sha256Hex(token);

                const expires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

                // Remove older outstanding tokens for this user (keeps latest link working)
                try {
                    await db('password_reset_tokens').where({ user_id: u.id }).del();
                } catch {
                    // ignore
                }

                await db('password_reset_tokens').insert({
                    user_id: u.id,
                    token_hash: tokenHash,
                    expires_at: expires,
                    used_at: null,
                    created_at: db.fn.now(),
                });

                const resetUrl = `${getFrontendBaseUrl().replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(
                    token
                )}`;

                try {
                    await sendPasswordResetEmail({ toEmail: u.email, resetUrl });
                } catch (mailErr) {
                    console.error('[auth/forgot-password] email error:', mailErr);
                    // do not leak error details to client
                    if (!isProd) {
                        return res.status(500).json({ message: 'Email service failed to send. Check SMTP env config.' });
                    }
                }
            }

            return res.json({ ok: true });
        } catch (err) {
            console.error('[auth/forgot-password] error', err);
            // Still avoid user enumeration; but if dev, it's useful to see config issues
            if (!isProd) return res.status(500).json({ message: 'Failed to process password reset request.' });
            return res.json({ ok: true });
        }
    }
);

/**
 * GET /auth/reset-password/verify?token=...
 * Optional helper endpoint. Returns { ok: true } if token is valid.
 */
router.get('/reset-password/verify', async (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token || !RESET_TOKEN_REGEX.test(token)) {
        return res.status(400).json({ ok: false, message: 'Invalid reset token.' });
    }

    try {
        await ensurePasswordResetTable();
        const tokenHash = sha256Hex(token);
        const row = await db('password_reset_tokens').where({ token_hash: tokenHash }).first();
        if (!row) return res.status(400).json({ ok: false, message: 'Invalid or expired reset token.' });
        if (row.used_at) return res.status(400).json({ ok: false, message: 'This reset link has already been used.' });

        const expiresAt = new Date(row.expires_at);
        if (Number.isNaN(expiresAt.valueOf()) || expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ ok: false, message: 'This reset link has expired.' });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('[auth/reset-password/verify] error', err);
        return res.status(500).json({ ok: false, message: 'Could not verify reset token.' });
    }
});

/**
 * POST /auth/reset-password
 * Body: { token, password }
 */
router.post(
    '/reset-password',
    [
        body('token').isLength({ min: 10 }).trim(),
        body('password')
            .custom((p) => passwordRegex.test(String(p || '')))
            .withMessage('Password must be 10–20 chars and include at least 1 uppercase and 1 special character.'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const msg = errors.array()?.[0]?.msg || 'Invalid input.';
            return res.status(400).json({ message: msg });
        }

        const token = String(req.body.token || '').trim();
        const newPassword = String(req.body.password || '');

        if (!RESET_TOKEN_REGEX.test(token)) {
            return res.status(400).json({ message: 'This reset link is invalid or expired.' });
        }

        try {
            await ensurePasswordResetTable();

            const tokenHash = sha256Hex(token);
            const row = await db('password_reset_tokens').where({ token_hash: tokenHash }).first();

            if (!row) return res.status(400).json({ message: 'This reset link is invalid or expired.' });
            if (row.used_at) return res.status(400).json({ message: 'This reset link has already been used.' });

            const expiresAt = new Date(row.expires_at);
            if (Number.isNaN(expiresAt.valueOf()) || expiresAt.getTime() < Date.now()) {
                return res.status(400).json({ message: 'This reset link has expired.' });
            }

            const u = await db('users').where({ id: row.user_id }).first();
            if (!u) return res.status(400).json({ message: 'This reset link is invalid or expired.' });

            const password_hash = await bcrypt.hash(newPassword, 12);

            await db.transaction(async (trx) => {
                await trx('users')
                    .where({ id: u.id })
                    .update({
                        password_hash,
                        updated_at: trx.fn.now(),
                    });

                await trx('password_reset_tokens')
                    .where({ id: row.id })
                    .update({
                        used_at: trx.fn.now(),
                    });
            });

            return res.json({ ok: true });
        } catch (err) {
            console.error('[auth/reset-password] error', err);
            return res.status(500).json({ message: 'Could not reset password. Please request a new reset link.' });
        }
    }
);

/**
 * POST /auth/logout — clear cookie
 */
router.post('/logout', (_req, res) => {
    res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    res.clearCookie('access_token', { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    res.sendStatus(204);
});

export default router;
