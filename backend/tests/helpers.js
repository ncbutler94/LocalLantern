// tests/helpers.js  :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}
function generateTestUser(prefix = 'test') {
  const uniqueSuffix = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  return {
    firstName: 'Test',
    lastName: 'User',
    email: `${prefix}_${uniqueSuffix}@example.com`,
    password: 'Password1',
    confirmPassword: 'Password1'
  };
}

function maskPhoneNumber(phone) {
  return phone.replace(/\d(?=\d{4})/g, '*');
}

module.exports = { generateTestUser, maskPhoneNumber };
