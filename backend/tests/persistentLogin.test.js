// tests/persistentLogin.test.js  :contentReference[oaicite:6]{index=6}&#8203;:contentReference[oaicite:7]{index=7}
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/config/db');
const { generateTestUser } = require('./helpers');

describe('Persistent Login Test', () => {
  let agent;
  let csrfToken;

  beforeAll(() => {
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await db('users').where('email', 'like', 'persistent_%@example.com').del();
    const res = await agent.get('/auth/csrf-token').expect(200);
    csrfToken = res.body.csrfToken;
  });

  it('should persist cookies across requests', async () => {
    const testUser = generateTestUser('persistent');

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

    // Login (this stores JWT cookie)
    const loginRes = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken2)
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

    expect(loginRes.body.token).toBeDefined();

    // Use the same agent (with cookie) to access protected endpoint
    const protectedRes = await agent.get('/protected').expect(200);
    expect(protectedRes.body.user.email).toEqual(testUser.email);
  });
});
