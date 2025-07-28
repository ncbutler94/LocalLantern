// tests/protected.test.js  :contentReference[oaicite:8]{index=8}&#8203;:contentReference[oaicite:9]{index=9}
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/config/db');
const { generateTestUser } = require('./helpers');

describe('Protected Endpoints', () => {
  let agent;
  let csrfToken;

  beforeAll(() => {
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await db('users').where('email', 'like', 'protected_%@example.com').del();
    const res = await agent.get('/auth/csrf-token').expect(200);
    csrfToken = res.body.csrfToken;
  });

  it('should allow access with a valid token', async () => {
    const testUser = generateTestUser('protected');

    // Register
    await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(200);

    // Verify
    const userRecord = await db('users').where({ email: testUser.email }).first();
    await agent.get(`/auth/verify/${userRecord.verification_token}`).expect(200);

    // fetch new CSRF before login
    const csrfRes2 = await agent.get('/auth/csrf-token').expect(200);
    const csrfToken2 = csrfRes2.body.csrfToken;

    // Login
    const loginRes = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken2)
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

    const token = loginRes.body.token;

    // Access protected route via header
    const protectedRes = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

    expect(protectedRes.body.message).toMatch(/protected route/i);
    expect(protectedRes.body.user).toBeDefined();
  });

  it('should deny access without a token', async () => {
    await request(app).get('/protected').expect(401);
  });

  it('should deny access with an invalid token', async () => {
    await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(403);
  });
});
