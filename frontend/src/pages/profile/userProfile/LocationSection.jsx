// src/pages/profile/userProfile/LocationSection.jsx
// Geocodes the chosen City/County and displays a small Leaflet map.
// Header now uses only a globe icon (no "Edit Privacy" text).
// Fix: CityCountySelect now receives setCity/setCounty (not onCityChange/onCountyChange).

import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Divider,
    IconButton,
    Tooltip,
    Typography,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import LocationOnIcon from '@mui/icons-material/LocationOn';

import MiniMap from '../../../components/MiniMap';
import CityCountySelect from '../../../components/CityCountySelect';

const AL_CENTROID = [32.806671, -86.79113];

async function geocode(city, county, signal) {
    const key = `geo:${(city || '').toLowerCase()}:${(county || '').toLowerCase()}`;
    const cached = localStorage.getItem(key);
    if (cached) {
        try {
            const j = JSON.parse(cached);
            if (Number.isFinite(j.lat) && Number.isFinite(j.lng)) return j;
        } catch {
            /* ignore cache parse errors */
        }
    }
    if (!city && !county) return null;

    const q = city
        ? `${city}${county ? `, ${county} County` : ''}, Alabama`
        : `${county} County, Alabama`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        q
    )}`;
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const arr = await r.json();
    const best = Array.isArray(arr) && arr[0] ? arr[0] : null;
    if (best) {
        const lat = parseFloat(best.lat);
        const lng = parseFloat(best.lon);
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
                                            isOwner = false, // pass isMine from UserProfilePage if you want the globe icon visible outside edit mode
                                            homeCity,
                                            setHomeCity,
                                            homeCounty,
                                            setHomeCounty,
                                            onPrivacy, // parent typically calls openPrivacy(e, 'location')
                                        }) {
    const [marker, setMarker] = useState(null);

    // geocode whenever city/county changes (abort-safe)
    useEffect(() => {
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            if (!homeCity && !homeCounty) {
                setMarker(null);
                return;
            }
            try {
                const m = await geocode(homeCity, homeCounty, ctrl.signal);
                if (alive) setMarker(m);
            } catch {
                if (alive) setMarker(null);
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [homeCity, homeCounty]);

    const locationText = useMemo(
        () => [homeCity, homeCounty && `${homeCounty} County`].filter(Boolean).join(', '),
        [homeCity, homeCounty]
    );

    const showPrivacyIcon = isOwner || editMode;

    return (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.25,
                }}
            >
                <Typography variant="h6">Location</Typography>

                {showPrivacyIcon && (
                    <Tooltip title="Privacy">
                        <IconButton size="small" onClick={onPrivacy} aria-label="Location privacy">
                            <PublicIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Divider />

            <CardContent sx={{ p: 1.25 }}>
                {editMode ? (
                    <Box sx={{ maxWidth: 520 }}>
                        {/* IMPORTANT: CityCountySelect expects setCity / setCounty (not onCityChange/onCountyChange) */}
                        <CityCountySelect
                            city={homeCity}
                            setCity={setHomeCity}
                            county={homeCounty}
                            setCounty={setHomeCounty}
                        />
                    </Box>
                ) : (
                    <>
                        {homeCity || homeCounty ? (
                            <>
                                {marker && (
                                    <Box sx={{ width: '100%', maxWidth: 520 }}>
                                        <MiniMap
                                            markers={[
                                                { lat: marker.lat, lng: marker.lng, title: locationText },
                                            ]}
                                            height={220}
                                            scrollWheelZoom={false}
                                        />
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                    <LocationOnIcon fontSize="small" />
                                    <Typography variant="body2" sx={{ ml: 0.5 }}>
                                        {locationText}
                                    </Typography>
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
