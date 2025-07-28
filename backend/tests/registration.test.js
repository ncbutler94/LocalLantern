// tests/registration.test.js  :contentReference[oaicite:10]{index=10}&#8203;:contentReference[oaicite:11]{index=11}
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/config/db');
const { generateTestUser } = require('./helpers');

describe('Registration', () => {
  let agent;
  let csrfToken;

  beforeAll(() => {
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await db('users').where('email', 'like', 'registration_%@example.com').del();
    const res = await agent.get('/auth/csrf-token').expect(200);
    csrfToken = res.body.csrfToken;
  });

  it('should register a new user successfully', async () => {
    const testUser = generateTestUser('registration');
    const res = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(200);
    expect(res.body.message).toMatch(/registered successfully/i);
  });

  it('should not register a user with missing required fields', async () => {
    const testUser = generateTestUser('registration');
    delete testUser.firstName;
    const res = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(400);
    expect(res.body.message).toMatch(/validation failed/i);
  });

  it('should not register a user with an invalid email', async () => {
    const testUser = generateTestUser('registration');
    testUser.email = 'invalid-email';
    const res = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(400);
    expect(res.body.message).toMatch(/validation failed/i);
  });

  it('should not register a user with mismatched passwords', async () => {
    const testUser = generateTestUser('registration');
    testUser.confirmPassword = 'DifferentPassword';
    const res = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(400);
    expect(res.body.message).toMatch(/validation failed/i);
  });

  it('should not allow duplicate registrations', async () => {
    const testUser = generateTestUser('registration');

    // First registration
    await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(testUser)
        .expect(200);

    // fetch new CSRF
    const csrfRes2 = await agent.get('/auth/csrf-token').expect(200);
    const csrfToken2 = csrfRes2.body.csrfToken;

    // Second registration
    const duplicateRes = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken2)
        .send(testUser)
        .expect(400);

    expect(duplicateRes.body.message).toMatch(/user already exists/i);
  });
});
