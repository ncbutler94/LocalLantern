// tests/login.test.js  :contentReference[oaicite:4]{index=4}&#8203;:contentReference[oaicite:5]{index=5}
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/config/db');
const { generateTestUser } = require('./helpers');

describe('Login', () => {
  let agent;
  let csrfToken;

  beforeAll(() => {
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await db('users').where('email', 'like', 'login_%@example.com').del();
    const res = await agent.get('/auth/csrf-token').expect(200);
    csrfToken = res.body.csrfToken;
  });

  it('should fail to login with wrong credentials', async () => {
    const testUser = generateTestUser('login');

    await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(200);

    const userRecord = await db('users')
        .where({ email: testUser.email })
        .first();

    await agent
        .get(`/auth/verify/${userRecord.verification_token}`)
        .expect(200);

    // fetch a fresh CSRF token before login
    const csrfRes2 = await agent.get('/auth/csrf-token').expect(200);
    const csrfToken2 = csrfRes2.body.csrfToken;

    const loginRes = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken2)
        .send({ email: testUser.email, password: 'WrongPassword' })
        .expect(400);

    expect(loginRes.body.message).toMatch(/invalid email or password/i);
  });

  it('should fail to login if email is not verified', async () => {
    const testUser = generateTestUser('login');

    await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(200);

    // get new CSRF
    const csrfRes2 = await agent.get('/auth/csrf-token').expect(200);
    const csrfToken2 = csrfRes2.body.csrfToken;

    const loginRes = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken2)
        .send({ email: testUser.email, password: testUser.password })
        .expect(403);

    expect(loginRes.body.message).toMatch(/email not verified/i);
  });
});
