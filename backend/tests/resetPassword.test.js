// tests/resetPassword.test.js  :contentReference[oaicite:12]{index=12}&#8203;:contentReference[oaicite:13]{index=13}
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/config/db');
const crypto  = require('crypto');
const bcrypt  = require('bcrypt');

describe('Reset Password Endpoints', () => {
  let testUser;
  let agent;
  let csrfToken;

  beforeAll(async () => {
    // Create a test user directly
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const password_hash  = await bcrypt.hash(randomPassword, 10);
    const userData = {
      first_name:    'Test',
      last_name:     'User',
      email:         'testuser@example.com',
      password_hash,
      is_verified:   true
    };
    await db('users').insert(userData);
    testUser = await db('users').where({ email: userData.email }).first();
  });

  beforeAll(() => {
    agent = request.agent(app);
  });

  beforeEach(async () => {
    const res = await agent.get('/auth/csrf-token').expect(200);
    csrfToken = res.body.csrfToken;
  });

  afterAll(async () => {
    await db('users').where({ email: testUser.email }).del();
    await db.destroy();
  });

  test('Forgot password endpoint sends reset link', async () => {
    const response = await agent
        .post('/auth/forgot-password')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: testUser.email })
        .expect(200);

    expect(response.body.message).toMatch(/if that email is registered/i);

    const updatedUser = await db('users').where({ id: testUser.id }).first();
    expect(updatedUser.reset_token).toBeDefined();
    expect(updatedUser.reset_token_expires).toBeDefined();
  });

  test('Reset password endpoint updates password', async () => {
    // generate and store token
    const token     = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    await db('users')
        .where({ id: testUser.id })
        .update({ reset_token: tokenHash, reset_token_expires: expiresAt });

    const newPassword = 'NewPass123';

    const response = await agent
        .post('/auth/reset-password')
        .set('X-CSRF-Token', csrfToken)
        .send({ token, newPassword })
        .expect(200);

    expect(response.body.message).toMatch(/password has been reset successfully/i);

    const updatedUser = await db('users').where({ id: testUser.id }).first();
    const passwordMatches = await bcrypt.compare(newPassword, updatedUser.password_hash);
    expect(passwordMatches).toBe(true);
    expect(updatedUser.reset_token).toBeNull();
    expect(updatedUser.reset_token_expires).toBeNull();
  });
});
