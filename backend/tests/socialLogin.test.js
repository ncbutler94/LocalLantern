// tests/socialLogin.test.js  :contentReference[oaicite:14]{index=14}&#8203;:contentReference[oaicite:15]{index=15}
const request = require('supertest');
const app     = require('../src/app');

describe('Social Login Endpoints', () => {
  test('GET /auth/google should redirect', async () => {
    const response = await request(app)
        .get('/auth/google')
        .redirects(0);
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/accounts\.google\.com/);
  });

  test('GET /auth/facebook should redirect', async () => {
    const response = await request(app)
        .get('/auth/facebook')
        .redirects(0);
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/facebook\.com/);
  });
});
