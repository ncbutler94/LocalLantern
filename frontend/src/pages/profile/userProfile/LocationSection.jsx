// src/pages/profile/userProfile/LocationSection.jsx
// Restores geocoded marker; hides Leaflet prefix; keeps OSM attribution.

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Divider, Typography } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import MiniMap from '../../../components/Map/MiniMap';
import CityCountySelect from '../../../components/Common/CityCountySelect/CityCountySelect';

const AL_CENTROID = [32.806671, -86.79113];

async function geocode(city, county, signal) {
    const key = `geo:${(city||'').toLowerCase()}:${(county||'').toLowerCase()}`;
    const cached = localStorage.getItem(key);
    if (cached) {
        try { const j = JSON.parse(cached); if (Number.isFinite(j.lat) && Number.isFinite(j.lng)) return j; } catch { /* ignore */ }
    }
    if (!city && !county) return null;
    const q = city ? `${city}${county ? `, ${county} County` : ''}, Alabama` : `${county} County, Alabama`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const arr = await r.json();
    const best = Array.isArray(arr) && arr[0] ? arr[0] : null;
    if (best) {
        const lat = parseFloat(best.lat), lng = parseFloat(best.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const obj = { lat, lng };
            localStorage.setItem(key, JSON.stringify(obj));
            return obj;
        }
    }
    return { lat: AL_CENTROID[0], lng: AL_CENTROID[1] };
}

export default function LocationSection({
                                            editMode,
                                            homeCity, setHomeCity,
                                            homeCounty, setHomeCounty,
                                            onPrivacy,
                                        }) {
    const [marker, setMarker] = useState(null);

    // geocode whenever city/county changes (abort-safe)
    useEffect(() => {
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            if (!homeCity && !homeCounty) { setMarker(null); return; }
            try {
                const m = await geocode(homeCity, homeCounty, ctrl.signal);
                if (alive) setMarker(m);
            } catch { if (alive) setMarker(null); }
        })();
        return () => { alive = false; ctrl.abort(); };
    }, [homeCity, homeCounty]);

    const locationText = useMemo(
        () => [homeCity, homeCounty && `${homeCounty} County`].filter(Boolean).join(', '),
        [homeCity, homeCounty]
    );

    return (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.25 }}>
                <Typography variant="h6">Location</Typography>
                {editMode && (
                    <Button size="small" startIcon={<PublicIcon />} onClick={onPrivacy}>
                        Edit Privacy
                    </Button>
                )}
            </Box>
            <Divider />
            <CardContent sx={{ p: 1.25 }}>
                {editMode ? (
                    <Box sx={{ maxWidth: 520 }}>
                        <CityCountySelect city={homeCity} setCity={setHomeCity} county={homeCounty} setCounty={setHomeCounty} />
                    </Box>
                ) : (
                    <>
                        {(homeCity || homeCounty) ? (
                            <>
                                {marker && (
                                    <Box sx={{ width: '100%', maxWidth: 520 }}>
                                        <MiniMap
                                            markers={[{ lat: marker.lat, lng: marker.lng, title: locationText }]}
                                            height={220}
                                            scrollWheelZoom={false}
                                            cleanAttribution
                                        />
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                    <LocationOnIcon fontSize="small" />
                                    <Typography variant="body2" sx={{ ml: .5 }}>{locationText}</Typography>
                                </Box>
                            </>
                        ) : (
                            <Typography color="text.secondary">No location set.</Typography>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
