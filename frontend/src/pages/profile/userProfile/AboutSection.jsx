// src/pages/profile/userProfile/AboutSection.jsx
// Renders the About body only. Privacy is handled by SectionCard / UserProfilePage popover.
// Updates (this version):
// - Bio input is fixed-height and scrolls (no autosize while typing).
// - County shown above City on the edit form (this section only).
// - Header color now matches the Community Posts header (uses SectionCard default; no override).
// - Relationship dropdown: removed "Do not display". If "Prefer not to say" is chosen, it is hidden on profile.
// - Emits edits via onEdit(partial).
// - NEW: Shows Birthday with a blue cake icon, and adds a Birthday date field in edit mode.
// - NEW: Location icon is now orange.

import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Typography,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CakeIcon from '@mui/icons-material/Cake';

const BIO_LIMIT = 200;

/* ---------------- helpers ---------------- */

const formatDate = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

const toCountyDisplay = (county) =>
    county
        ? String(county).toLowerCase().includes('county')
            ? String(county)
            : `${county} County`
        : '';

const locationLabel = (city, county) =>
    [city, toCountyDisplay(county)].filter(Boolean).join(', ');

// Normalize DB/raw values into our internal enum.
const normalizeRelationshipRaw = (raw) => {
    if (raw == null || raw === '') return 'prefer-not';
    if (typeof raw === 'number') {
        // legacy numeric codes if any
        const mapNum = { 1: 'single', 2: 'in-relationship', 3: 'married', 4: 'its-complicated' };
        return mapNum[raw] || 'prefer-not';
    }
    let v = String(raw).trim().toLowerCase().replace(/[’]/g, "'");
    if (v === 'in relationship' || v === 'in a relationship') v = 'in-relationship';
    if (v === "it's complicated" || v === 'its complicated') v = 'its-complicated';
    if (v === 'do not display' || v === 'hide' || v === 'none' || v === 'prefer-not-to-say')
        v = 'prefer-not';
    return v;
};

const prettyRelationship = (v) => {
    const map = {
        single: 'Single',
        'in-relationship': 'In a relationship',
        married: 'Married',
        'its-complicated': "It's complicated",
        'prefer-not': 'Prefer not to say',
    };
    return map[v] || '';
};

async function fetchProfileIfNeeded(existing) {
    if (existing && typeof existing === 'object') return existing;
    const urls = ['/users/profile', '/api/users/profile'];
    for (const u of urls) {
        try {
            const r = await fetch(u, { credentials: 'include' });
            if (r.ok) return await r.json();
        } catch {}
    }
    return null;
}

/* ---------------- component ---------------- */

export default function AboutSection({
                                         profile: initialProfile = null,
                                         editMode = false,
                                         isOwner = false,
                                         privacyValue = 'public', // from SectionCard/UserProfilePage
                                         isFollower = false, // whether viewer follows this user
                                         onEdit = null, // optional: parent collects partial edits for "Save Profile"
                                     }) {
    const [profile, setProfile] = useState(initialProfile);
    const [loading, setLoading] = useState(!initialProfile);

    const [bio, setBio] = useState('');
    const [relationship, setRelationship] = useState('prefer-not'); // internal enum
    const [joined, setJoined] = useState('');

    const [city, setCity] = useState('');
    const [county, setCounty] = useState('');
    const [birthday, setBirthday] = useState(''); // YYYY-MM-DD

    // Load profile if not provided
    useEffect(() => {
        let alive = true;
        (async () => {
            const p = await fetchProfileIfNeeded(initialProfile);
            if (!alive) return;
            setProfile(p);
            setLoading(false);
        })();
        return () => {
            alive = false;
        };
    }, [initialProfile]);

    // Sync local inputs from profile
    useEffect(() => {
        // Accept either { ...user } or { user: { ... } }
        const raw = profile || {};
        const p = raw.user || raw;

        const initialBio = p.bio ?? p.about ?? p.about_me ?? '';
        setBio(String(initialBio).slice(0, BIO_LIMIT));
        setRelationship(normalizeRelationshipRaw(p.relationship));
        setJoined(p.created_at ?? p.joined_at ?? '');
        setCity(p.home_city ?? p.city ?? '');
        setCounty(p.home_county ?? p.county ?? '');
        setBirthday(p.birthday ?? '');
    }, [profile]);

    // Emit edits to parent so the header "Save Profile" can handle persistence.
    useEffect(() => {
        if (typeof onEdit === 'function') {
            onEdit({
                bio,
                relationship,       // keep raw value; view layer hides "prefer-not"
                home_city: city || '',
                home_county: county || '',
                birthday: birthday || '', // ISO date (YYYY-MM-DD)
            });
        }
    }, [onEdit, bio, relationship, city, county, birthday]);

    // Same view rules as other sections: public, followers/friends, or private
    const canViewAbout = useMemo(() => {
        if (isOwner) return true;
        if (privacyValue === 'public') return true;
        if (privacyValue === 'friends' || privacyValue === 'followers') return !!isFollower;
        return false;
    }, [isOwner, privacyValue, isFollower]);

    const labelLocation = useMemo(() => locationLabel(city, county), [city, county]);

    // Hide relationship entirely when "prefer-not"
    const showRelationship = relationship && relationship !== 'prefer-not';
    const hasAny = useMemo(
        () => Boolean((bio && bio.trim()) || showRelationship || birthday || (city || county) || joined),
        [bio, showRelationship, birthday, city, county, joined]
    );

    if (loading) {
        return <Typography color="text.secondary">Loading…</Typography>;
    }

    if (!canViewAbout && !editMode) {
        return (
            <Typography variant="body2" color="text.secondary">
                {privacyValue === 'private'
                    ? 'This section is visible to you only.'
                    : 'This section is visible to followers.'}
            </Typography>
        );
    }

    return !editMode ? (
        <Box id="about-body" sx={{ display: 'grid', rowGap: 1.25 }}>
            {hasAny ? (
                <>
                    {/* Bio — plain text with extra bottom spacing */}
                    {bio ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.25 }}>
                            {bio}
                        </Typography>
                    ) : null}

                    {/* Relationship — hidden if "prefer-not" */}
                    {showRelationship ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FavoriteIcon fontSize="small" color="error" />
                            <Typography variant="body2">{prettyRelationship(relationship)}</Typography>
                        </Box>
                    ) : null}

                    {/* Birthday */}
                    {birthday ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CakeIcon fontSize="small" sx={{ color: '#1976d2' }} />
                            <Typography variant="body2">Birthday {formatDate(birthday)}</Typography>
                        </Box>
                    ) : null}

                    {/* Location */}
                    {city || county ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <LocationOnIcon fontSize="small" sx={{ color: 'orange' }} />
                            <Typography variant="body2">{labelLocation}</Typography>
                        </Box>
                    ) : null}

                    {/* Joined */}
                    {joined ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CalendarMonthIcon fontSize="small" />
                            <Typography variant="body2">Joined {formatDate(joined)}</Typography>
                        </Box>
                    ) : null}
                </>
            ) : (
                <Typography color="text.secondary">No About details to show.</Typography>
            )}
        </Box>
    ) : (
        <Box
            id="about-body"
            sx={{
                display: 'grid',
                rowGap: 1.25,
                maxWidth: 640, // keep inputs from getting too wide
                mt: 2, // move inputs down away from title bar
                width: '100%',
            }}
        >
            {/* Bio — fixed height; scrolls instead of growing */}
            <TextField
                label="Bio"
                value={bio}
                onChange={(e) => {
                    const val = e.target.value || '';
                    setBio(val.length <= BIO_LIMIT ? val : val.slice(0, BIO_LIMIT));
                }}
                helperText={`${bio.length} / ${BIO_LIMIT}`}
                multiline
                rows={4} // fixed height
                fullWidth
                inputProps={{ maxLength: BIO_LIMIT }}
                sx={{
                    '& .MuiInputBase-inputMultiline': {
                        overflow: 'auto',
                        resize: 'none', // prevent manual resize handles
                    },
                }}
            />

            {/* Relationship dropdown (no "Do not display") */}
            <FormControl fullWidth>
                <InputLabel id="about-relationship-label">Relationship</InputLabel>
                <Select
                    labelId="about-relationship-label"
                    label="Relationship"
                    value={relationship || 'prefer-not'}
                    onChange={(e) => setRelationship(e.target.value)}
                >
                    <MenuItem value="single">Single</MenuItem>
                    <MenuItem value="in-relationship">In a relationship</MenuItem>
                    <MenuItem value="married">Married</MenuItem>
                    <MenuItem value="its-complicated">It&apos;s complicated</MenuItem>
                    <MenuItem value="prefer-not">Prefer not to say</MenuItem>
                </Select>
            </FormControl>

            {/* Birthday */}
            <TextField
                label="Birthday"
                type="date"
                value={birthday || ''}
                onChange={(e) => setBirthday(e.target.value || '')}
                fullWidth
                InputLabelProps={{ shrink: true }}
            />

            {/* County above City (this section only) */}
            <Box sx={{ display: 'grid', rowGap: 1 }}>
                <TextField
                    label="County"
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    fullWidth
                />
                <TextField
                    label="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    fullWidth
                />
            </Box>
        </Box>
    );
}

AboutSection.propTypes = {
    profile: PropTypes.object,
    editMode: PropTypes.bool,
    isOwner: PropTypes.bool,
    privacyValue: PropTypes.string,
    isFollower: PropTypes.bool,
    onEdit: PropTypes.func, // receives { bio, relationship, birthday, home_city, home_county }
};
