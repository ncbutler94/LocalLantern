// scripts/generateCounties.js

/**
 * Run with:
 *   npm install node-fetch
 *   node scripts/generateCounties.js
 *
 * This will write `alabamaCounties.json` into your frontend/src/data folder.
 */

import fetch from 'node-fetch';
import fs from 'fs';

const counties = [
  "Autauga", "Baldwin", "Barbour", "Bibb", "Blount", "Bullock", "Butler",
  "Calhoun", "Chambers", "Cherokee", "Chilton", "Choctaw", "Clarke",
  "Clay", "Cleburne", "Coffee", "Colbert", "Conecuh", "Coosa", "Covington",
  "Crenshaw", "Cullman", "Dale", "Dallas", "DeKalb", "Elmore", "Escambia",
  "Etowah", "Fayette", "Franklin", "Geneva", "Greene", "Hale", "Henry",
  "Houston", "Jackson", "Jefferson", "Lamar", "Lauderdale", "Lawrence",
  "Lee", "Limestone", "Lowndes", "Macon", "Madison", "Marengo", "Marion",
  "Marshall", "Mobile", "Monroe", "Montgomery", "Morgan", "Perry", "Pickens",
  "Pike", "Randolph", "Russell", "Shelby", "St. Clair", "Sumter", "Talladega",
  "Tallapoosa", "Tuscaloosa", "Walker", "Washington", "Wilcox", "Winston"
];

(async () => {
  const results = [];

  for (const county of counties) {
    const query = encodeURIComponent(`${county} County, Alabama`);
    try {
      const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`
      );
      const data = await res.json();
      if (data.length) {
        const { lat, lon } = data[0];
        results.push({
          name: county,
          coordinates: [ parseFloat(lat), parseFloat(lon) ]
        });
        console.log(`✔ ${county}: [${lat}, ${lon}]`);
      } else {
        console.warn(`✖ No result for ${county}`);
      }
    } catch (err) {
      console.error(`✖ Error fetching ${county}:`, err);
    }
    // be nice to the API
    await new Promise(r => setTimeout(r, 1000));
  }

  // write out the JSON file into frontend/src/data/
  fs.writeFileSync(
      'frontend/src/data/alabamaCounties.json',
      JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Done! Saved to frontend/src/data/alabamaCounties.json');
})();
