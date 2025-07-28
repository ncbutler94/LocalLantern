// tests/globalTeardown.js  :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}
const db = require('../src/config/db');

module.exports = async () => {
  await db.destroy();
};
