import { useState } from 'react';
import cityData   from '../../../../data/alabamaCities.json';
import countyData from '../../../../data/alabamaCounties.json';

/* ──────────────────────────────
   Shared constants
   ────────────────────────────── */
export const MAX_TITLE       = 50;
export const MAX_DESCRIPTION = 1_000;
export const MAX_PHOTOS      = 4;

/* ──────────────────────────────
   Small helper for city / county
   ────────────────────────────── */
const stripSuffix = s => s.replace(/ County$/i, '').trim();

/** Returns [lat, lng] for a city or county, or null if unknown. */
export function coordsFromLocalData(city, county) {
    if (city) {
        const hit = cityData.find(c => c.name === city);
        if (hit) return hit.coordinates;           // [lat, lng]
    }
    if (county) {
        const hit = countyData.find(c => stripSuffix(c.name) === stripSuffix(county));
        if (hit) return hit.coordinates;
    }
    return null;
}

/* ──────────────────────────────
   The hook
   ────────────────────────────── */
export default function useBasePostForm() {
    /* field state */
    const [title,       setTitle]       = useState('');
    const [description, setDescription] = useState('');
    const [photos,      setPhotos]      = useState(Array(MAX_PHOTOS).fill(null));
    const [city,        setCity]        = useState('');
    const [county,      setCounty]      = useState('');

    /* meta */
    const [submitting,      setSubmitting]      = useState(false);
    const [error,           setError]           = useState('');
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    /* ───────── validation ───────── */
    const missingRequired =
        !title.trim() ||
        !city.trim()  ||
        !county.trim();

    const tooltipMsg = !title.trim()
        ? 'Title is required.'
        : !county.trim()
                ? 'County is required.'
                : '';

    /* ───────── photo handlers ───────── */
    const handleFileChange = e => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const url = URL.createObjectURL(file);
        setPhotos(prev => {
            const next = [...prev];
            const idx  = next.findIndex(p => p === null);
            if (idx !== -1) next[idx] = { file, url };
            return next;
        });
    };

    const handleRemovePhoto = idx => {
        setPhotos(prev => {
            const next = [...prev];
            URL.revokeObjectURL(next[idx]?.url);
            next.splice(idx, 1);
            next.push(null);              // keep array length = MAX_PHOTOS
            return next;
        });
    };

    return {
        /* core fields */
        title, setTitle, description, setDescription,
        photos, handleFileChange, handleRemovePhoto,
        city, setCity, county, setCounty,

        /* meta & validation helpers */
        submitting, setSubmitting,
        attemptedSubmit, setAttemptedSubmit,
        error, setError,
        isDisabled: missingRequired || submitting,
        tooltipMsg,

        /* city / county centroid helper */
        coordsFromLocalData        // convenient export for dialogs that need it
    };
}
