// backend/src/config/passport.js
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import db from './db.js';  // adjust path if needed

// We keep serialize/deserialize for completeness, but session is disabled.
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db('users').where({ id }).first();
    done(null, user || false);
  } catch (err) {
    done(err, null);
  }
});

// ── Google ────────────────────────────────────────
passport.use(new GoogleStrategy({
      clientID:        process.env.GOOGLE_CLIENT_ID,
      clientSecret:    process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:     `${process.env.APP_URL}/auth/google/callback`,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await db('users').where({ google_id: profile.id }).first();

        if (!user) {
          const email = profile.emails[0].value;
          const existing = await db('users').where({ email }).first();
          if (existing) {
            await db('users').where({ id: existing.id }).update({ google_id: profile.id });
            user = { ...existing, google_id: profile.id };
          } else {
            req.session.newSocialUser = true;
            req.session.socialEmail   = email;
            const randomPassword      = crypto.randomBytes(32).toString('hex');
            const dummyHash           = await bcrypt.hash(randomPassword, 10);
            const [userId] = await db('users')
                .insert({
                  first_name:     profile.name.givenName,
                  last_name:      profile.name.familyName,
                  email,
                  google_id:      profile.id,
                  password_hash:  dummyHash,
                  needs_password: true,
                  is_verified:    true
                });
            user = await db('users').where({ id: userId }).first();
          }
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
));

// ── Facebook ──────────────────────────────────────
passport.use(new FacebookStrategy({
      clientID:        process.env.FACEBOOK_APP_ID,
      clientSecret:    process.env.FACEBOOK_APP_SECRET,
      callbackURL:     `${process.env.APP_URL}/auth/facebook/callback`,
      profileFields:   ['id','emails','name'],
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await db('users').where({ facebook_id: profile.id }).first();
        if (!user) {
          const email = profile.emails?.[0]?.value || null;
          const existing = email
              ? await db('users').where({ email }).first()
              : null;
          if (existing) {
            await db('users').where({ id: existing.id }).update({ facebook_id: profile.id });
            user = { ...existing, facebook_id: profile.id };
          } else {
            req.session.newSocialUser = true;
            req.session.socialEmail   = email;
            const randomPassword      = crypto.randomBytes(32).toString('hex');
            const dummyHash           = await bcrypt.hash(randomPassword, 10);
            const [userId] = await db('users')
                .insert({
                  first_name:     profile.name.givenName || '',
                  last_name:      profile.name.familyName || '',
                  email:          email || '',
                  facebook_id:    profile.id,
                  password_hash:  dummyHash,
                  needs_password: true,
                  is_verified:    true
                });
            user = await db('users').where({ id: userId }).first();
          }
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
));

export default passport;
