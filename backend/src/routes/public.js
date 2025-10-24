// backend/src/routes/public.js
import express from 'express';      // :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}

const router = express.Router();

// stub /public/map-points
router.get('/map-points', (req, res) => {
  // for now return an empty FeatureCollection
  res.json({ type: 'FeatureCollection', features: [] });
});

export default router;
