// scripts/generateCityCountyMap.js
/**
 * 1) In your package.json, add:
 *    "type": "module"
 *
 * 2) Run with:
 *      npm install node-fetch
 *      node scripts/generateCityCountyMap.js
 *
 * Writes: frontend/src/data/cityCountyMap.json
 */

import fetch from 'node-fetch';
import fs    from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

// emulate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// load your cities file via fs
const cityDataPath = path.resolve(
    __dirname,
    '../frontend/src/data/alabamaCities.json'
);
const cityData = JSON.parse(fs.readFileSync(cityDataPath, 'utf8'));  // :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}

(async () => {
  const map = [];

  for (const { name, coordinates: [lat, lon] } of cityData) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
    try {
      const res  = await fetch(url, { headers: { 'User-Agent': 'LocalLantern/1.0' } });
      const body = await res.json();
      const county = body.address.county;
      if (county) {
        map.push({ name, county });
        console.log(`✔ ${name} → ${county}`);
      } else {
        console.warn(`✖ no county for ${name}`);
      }
    } catch (err) {
      console.error(`✖ error for ${name}:`, err);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  const outPath = path.resolve(
      __dirname,
      '../frontend/src/data/cityCountyMap.json'
  );
  fs.writeFileSync(
      outPath,
      JSON.stringify(
          map.sort((a, b) => a.name.localeCompare(b.name)),
          null,
          2
      )
  );
  console.log(`✅ Written ${outPath}`);
})();
