// src/routes/auth.js

import express from 'express';
import passport from '../config/passport.js';       // your Passport strategies
import bcrypt from 'bcrypt';                        // for password hashing
import jwt from 'jsonwebtoken';                     // for issuing JWTs
import db from '../config/db.js';                   // your database client/ORM
import authenticateToken from '../middleware/auth.js'; // middleware to protect routes

const router = express.Router();

/**
 * Helper: issue a signed JWT for a given user
 */
function issueJwt(user) {
  return jwt.sign(
      { id: user.id, email: user.email },            // payload
      process.env.JWT_SECRET,                        // secret key
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Helper: set the JWT in an HTTP-only cookie
 */
function setJwtCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',      // only over HTTPS in prod
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path:     '/',                                         // cookie valid for entire site
    maxAge:   7 * 24 * 60 * 60 * 1000                      // 7 days
  });
}

/**
 * POST /auth/logout
 * Destroys server session and clears the JWT cookie
 */
router.post('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.clearCookie('token', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path:     '/'
    });
    res.sendStatus(204);
  });
});

/**
 * Shared success handler for both Google and Facebook OAuth
 */
function handleSocialSuccess(req, res) {
  // Issue a JWT and set it in a cookie
  const token = issueJwt(req.user);
  setJwtCookie(res, token);

  // Read the original redirect out of OAuth "state" (default to '/')
  const redirectTo = req.query.state || '/';

  // Redirect back into your SPA shell, passing along the redirect target
  return res.redirect(
      `${process.env.FRONTEND_URL}/social-login-success?redirect=${encodeURIComponent(redirectTo)}`
  );
}

/* ──────────────────────────────────────────────────────────────
   Your existing email/password routes (register, login, etc.)
   ──────────────────────────────────────────────────────────────
   e.g.:

   router.post('/register', [...validators], async (req, res) => { ... });
   router.post('/login', async (req, res) => { ... });
   router.post('/forgot-password', ...);
   router.post('/reset-password', ...);
   router.post('/change-password', authenticateToken, ...);
   ──────────────────────────────────────────────────────────────
*/

/**
 * 1) GET /auth/google
 *    - Kick off Google OAuth, preserving ?redirect=… in the OAuth state
 */
router.get(
    '/google',
    (req, res, next) => {
      const redirect = req.query.redirect || '/';
      passport.authenticate('google', {
        scope: ['email','profile'],
        state: redirect                             // store original URL here
      })(req, res, next);
    }
);

/**
 * 2) GET /auth/google/callback
 *    - Handle Google’s callback, then issue token & redirect
 */
router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login',
      session:         false
    }),
    handleSocialSuccess
);

/**
 * 3) GET /auth/facebook
 *    - Kick off Facebook OAuth, preserving ?redirect=… in the OAuth state
 */
router.get(
    '/facebook',
    (req, res, next) => {
      const redirect = req.query.redirect || '/';
      passport.authenticate('facebook', {
        scope: ['email'],
        state: redirect
      })(req, res, next);
    }
);

/**
 * 4) GET /auth/facebook/callback
 *    - Handle Facebook’s callback, then issue token & redirect
 */
router.get(
    '/facebook/callback',
    passport.authenticate('facebook', {
      failureRedirect: '/login',
      session:         false
    }),
    handleSocialSuccess
);

export default router;
