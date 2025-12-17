import { useEffect, useState } from 'react';
import cityData from '../../../data/alabamaCities.json';
import countyData from '../../../data/alabamaCounties.json';

/* ──────────────────────────────
   Shared constants
   ────────────────────────────── */
export const MAX_TITLE = 50;
export const MAX_DESCRIPTION = 1_000;
export const MAX_PHOTOS = 4;

/* ──────────────────────────────
   Helpers for city / county
   ────────────────────────────── */
const stripSuffix = (s) => String(s || '').replace(/ County$/i, '').trim();

/** Returns [lat, lng] for a city or county, or null if unknown. */
export function coordsFromLocalData(city, county) {
    if (city) {
        const hit = cityData.find((c) => c.name === city);
        if (hit) return hit.coordinates; // [lat, lng]
    }
    if (county) {
        const hit = countyData.find((c) => stripSuffix(c.name) === stripSuffix(county));
        if (hit) return hit.coordinates;
    }
    return null;
}

/* ─────────────────────────────────────────────────────────────
   Hook: useBasePostForm(options)
   - Defaults location from the *database user* (not device GPS).
   - County is required; city is optional.
   - Returns `countyRequired: true` so UI can render an asterisk.
   - Accepts optional { defaultCity, defaultCounty } to override.
   ───────────────────────────────────────────────────────────── */
export default function useBasePostForm(options = {}) {
    const optDefaultCity = (options.defaultCity || '').trim();
    const optDefaultCounty = (options.defaultCounty || '').trim();

    const countyRequired = Object.prototype.hasOwnProperty.call(options, 'countyRequired')
        ? Boolean(options.countyRequired)
        : true;

    /* field state */
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [photos, setPhotos] = useState(Array(MAX_PHOTOS).fill(null));
    const [city, setCity] = useState(optDefaultCity);
    const [county, setCounty] = useState(optDefaultCounty);

    /* meta */
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    /* ────────────────────────────────────────────────────────────
       Fetch defaults from the database user when fields are empty.
       We try a few common endpoints; non-fatal on failure.
       This does *not* use device geolocation.
       ──────────────────────────────────────────────────────────── */
    useEffect(() => {
        // If the component supplied defaults, prefer those.
        if (optDefaultCity || optDefaultCounty) {
            if (!city && optDefaultCity) setCity(optDefaultCity);
            if (!county && optDefaultCounty) setCounty(optDefaultCounty);
            return;
        }

        let cancelled = false;

        // Utility to extract city/county from various shapes
        const extractLocation = (obj) => {
            if (!obj || typeof obj !== 'object') return null;

            const candidates = [
                obj,
                obj.user,
                obj.me,
                obj.profile,
                obj.account,
                obj.data,
                obj.currentUser,
            ].filter(Boolean);

            for (const root of candidates) {
                const foundCounty =
                    (root.county ??
                        root.home_county ??
                        root.default_county ??
                        (root.location && root.location.county) ??
                        (root.address && root.address.county) ??
                        '') + '';
                const foundCity =
                    (root.city ??
                        root.home_city ??
                        root.default_city ??
                        (root.location && root.location.city) ??
                        (root.address && root.address.city) ??
                        '') + '';

                if (foundCounty || foundCity) {
                    return {
                        county: foundCounty.trim(),
                        city: foundCity.trim(),
                    };
                }
            }
            return null;
        };

        (async () => {
            try {
                // 1) Try global if your app sets one (zero-cost)
                const anyWin = window;
                const globalUser =
                    anyWin && (anyWin.__CURRENT_USER__ || anyWin.CURRENT_USER || anyWin.USER);
                const gLoc = extractLocation(globalUser);
                if (!cancelled && gLoc) {
                    if (!county && gLoc.county) setCounty(gLoc.county);
                    if (!city && gLoc.city) setCity(gLoc.city);
                    return;
                }
            } catch {
                /* ignore */
            }

            const endpoints = ['/api/me', '/api/auth/me', '/api/users/me', '/api/profile/me'];
            for (const url of endpoints) {
                try {
                    const res = await fetch(url, { credentials: 'include' });
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (cancelled) return;
                    const loc = extractLocation(data);
                    if (loc) {
                        if (!county && loc.county) setCounty(loc.county);
                        if (!city && loc.city) setCity(loc.city);
                        return;
                    }
                } catch {
                    // keep trying others
                }
            }
            // If nothing found, leave fields as-is (empty).
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once per mount; defaults only

    /* ───────── validation ─────────
       County is required; City optional; Title required. */
    const missingRequired = !title.trim() || (countyRequired && !county.trim());

    const tooltipMsg = !title.trim()
        ? 'Title is required.'
        : (countyRequired && !county.trim())
            ? 'County is required.'
            : '';

    /* ───────── photo handlers ───────── */
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const url = URL.createObjectURL(file);
        setPhotos((prev) => {
            const next = [...prev];
            const idx = next.findIndex((p) => p === null);
            if (idx !== -1) next[idx] = { file, url };
            return next;
        });
    };

    const handleRemovePhoto = (idx) => {
        setPhotos((prev) => {
            const next = [...prev];
            if (next[idx]?.url) URL.revokeObjectURL(next[idx].url);
            next.splice(idx, 1);
            next.push(null); // keep array length = MAX_PHOTOS
            return next;
        });
    };

    /* ───────── coordinate helper ─────────
       Returns [lat, lng] from city/county centroid (no GPS). */
    const resolveCoordinates = () => {
        const coords = coordsFromLocalData(city, county);
        if (Array.isArray(coords) && coords.length === 2) return coords;
        return [null, null];
    };

    return {
        /* core fields */
        title,
        setTitle,
        description,
        setDescription,
        photos,
        handleFileChange,
        handleRemovePhoto,
        city,
        setCity,
        county,
        setCounty,

        /* meta & validation helpers */
        submitting,
        setSubmitting,
        attemptedSubmit,
        setAttemptedSubmit,
        error,
        setError,
        isDisabled: missingRequired || submitting,
        tooltipMsg,

        /* flags so UI can render required asterisk on County field */
        countyRequired,

        /* city/county centroid helper for lat/lng fallbacks */
        coordsFromLocalData,

        /* city/county centroid convenience for forms */
        resolveCoordinates,
    };
}
