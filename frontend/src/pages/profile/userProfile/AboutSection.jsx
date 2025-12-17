// src/pages/profile/userProfile/AboutSection.jsx
// Updates in this version:
// - Adds a bit more spacing between Bio and Relationship in edit mode.
// - Moves the "Location" label up slightly (less top margin and a tighter label spacing).
// - Keeps: birthday auto-populate + 18+ enforcement + onEdit wiring.

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const normalizeRelationshipRaw = (raw) => {
    if (raw == null || raw === '') return 'prefer-not';
    if (typeof raw === 'number') {
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

const normalizeToISODate = (raw) => {
    if (!raw) return '';
    if (raw instanceof Date) {
        if (Number.isNaN(raw.valueOf())) return '';
        return raw.toISOString().slice(0, 10);
    }

    const s = String(raw).trim();
    if (!s) return '';

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const [mm, dd, yyyy] = s.split('/').map((x) => parseInt(x, 10));
        if (!yyyy || !mm || !dd) return '';
        const mm2 = String(mm).padStart(2, '0');
        const dd2 = String(dd).padStart(2, '0');
        return `${yyyy}-${mm2}-${dd2}`;
    }

    const d = new Date(s);
    if (Number.isNaN(d.valueOf())) return '';
    return d.toISOString().slice(0, 10);
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
                                         privacyValue = 'public',
                                         isFollower = false,
                                         onEdit = null,
                                     }) {
    const [profile, setProfile] = useState(initialProfile);
    const [loading, setLoading] = useState(!initialProfile);

    const [bio, setBio] = useState('');
    const [relationship, setRelationship] = useState('prefer-not');
    const [joined, setJoined] = useState('');

    const [city, setCity] = useState('');
    const [county, setCounty] = useState('');

    const [birthday, setBirthday] = useState(''); // YYYY-MM-DD
    const [birthdayError, setBirthdayError] = useState('');

    const prevEditModeRef = useRef(false);
    const birthdayTouchedRef = useRef(false);

    const maxDob = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setFullYear(d.getFullYear() - 18);
        return d.toISOString().slice(0, 10);
    }, []);

    const isUnder18 = (dateStr) => {
        if (!dateStr) return false;
        return dateStr > maxDob;
    };

    const getProfileUser = (rawProfile) => {
        const raw = rawProfile || {};
        return raw.user || raw;
    };

    const readBirthdayFromProfile = (p) => {
        const candidates = [p.birthday, p.birthdate, p.date_of_birth, p.dob, p.birth_date];
        for (const c of candidates) {
            const iso = normalizeToISODate(c);
            if (iso) return iso;
        }
        return '';
    };

    const syncFieldsFromProfile = (rawProfile) => {
        const p = getProfileUser(rawProfile);

        const nextBio = p.bio ?? p.about ?? p.about_me ?? '';
        const nextRelationship = normalizeRelationshipRaw(p.relationship);
        const nextJoined = p.created_at ?? p.joined_at ?? '';
        const nextCity = p.home_city ?? p.city ?? '';
        const nextCounty = p.home_county ?? p.county ?? '';

        setBio(String(nextBio).slice(0, BIO_LIMIT));
        setRelationship(nextRelationship);
        setJoined(nextJoined);
        setCity(nextCity || '');
        setCounty(nextCounty || '');

        const nextBirthday = readBirthdayFromProfile(p);
        if (nextBirthday && isUnder18(nextBirthday)) {
            setBirthday('');
            setBirthdayError('You must be at least 18 years old.');
        } else {
            setBirthday(nextBirthday || '');
            setBirthdayError('');
        }

        birthdayTouchedRef.current = false;
    };

    const maybeAutofillBirthdayFromProfile = (rawProfile) => {
        if (birthdayTouchedRef.current) return;
        if (birthday) return;

        const p = getProfileUser(rawProfile);
        const nextBirthday = readBirthdayFromProfile(p);
        if (!nextBirthday) return;

        if (isUnder18(nextBirthday)) {
            setBirthday('');
            setBirthdayError('You must be at least 18 years old.');
            return;
        }

        setBirthday(nextBirthday);
        setBirthdayError('');
    };

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

    useEffect(() => {
        if (!profile) return;
        if (!editMode) {
            syncFieldsFromProfile(profile);
        }
    }, [profile, editMode]);

    useEffect(() => {
        const wasEditing = prevEditModeRef.current;

        if (editMode && !wasEditing && profile) {
            syncFieldsFromProfile(profile);
        }

        prevEditModeRef.current = editMode;
    }, [editMode, profile]);

    useEffect(() => {
        if (!editMode) return;
        if (!profile) return;
        maybeAutofillBirthdayFromProfile(profile);
    }, [editMode, profile, birthday]);

    useEffect(() => {
        if (typeof onEdit === 'function') {
            onEdit({
                bio,
                relationship,
                home_city: city || '',
                home_county: county || '',
                birthday: birthday || '',
            });
        }
    }, [onEdit, bio, relationship, city, county, birthday]);

    const canViewAbout = useMemo(() => {
        if (isOwner) return true;
        if (privacyValue === 'public') return true;
        if (privacyValue === 'friends' || privacyValue === 'followers') return !!isFollower;
        return false;
    }, [isOwner, privacyValue, isFollower]);

    const labelLocation = useMemo(() => locationLabel(city, county), [city, county]);

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
                    {bio ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.25 }}>
                            {bio}
                        </Typography>
                    ) : null}

                    {showRelationship ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FavoriteIcon fontSize="small" color="error" />
                            <Typography variant="body2">{prettyRelationship(relationship)}</Typography>
                        </Box>
                    ) : null}

                    {birthday ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CakeIcon fontSize="small" sx={{ color: '#1976d2' }} />
                            <Typography variant="body2">Birthday {formatDate(birthday)}</Typography>
                        </Box>
                    ) : null}

                    {city || county ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <LocationOnIcon fontSize="small" sx={{ color: 'orange' }} />
                            <Typography variant="body2">{labelLocation}</Typography>
                        </Box>
                    ) : null}

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
                maxWidth: 640,
                mt: 2,
                width: '100%',
            }}
        >
            <TextField
                label="Bio"
                value={bio}
                onChange={(e) => {
                    const val = e.target.value || '';
                    setBio(val.length <= BIO_LIMIT ? val : val.slice(0, BIO_LIMIT));
                }}
                helperText={`${bio.length} / ${BIO_LIMIT}`}
                multiline
                rows={4}
                fullWidth
                inputProps={{ maxLength: BIO_LIMIT }}
                sx={{
                    mb: 2, // ✅ extra space between Bio and Relationship
                    '& .MuiInputBase-inputMultiline': {
                        overflow: 'auto',
                        resize: 'none',
                    },
                }}
            />

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

            <TextField
                label="Birthday"
                type="date"
                value={birthday || ''}
                onChange={(e) => {
                    const next = e.target.value || '';
                    birthdayTouchedRef.current = true;

                    if (next && isUnder18(next)) {
                        setBirthdayError('You must be at least 18 years old.');
                        return;
                    }

                    setBirthdayError('');
                    setBirthday(next);
                }}
                fullWidth
                error={Boolean(birthdayError)}
                helperText={birthdayError || ' '}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                    max: maxDob,
                }}
            />

            <Box sx={{ mt: 0 /* ✅ move Location up */ }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2 /* ✅ tighter */ }}>
                    Location
                </Typography>

                {/* County above City */}
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
        </Box>
    );
}

AboutSection.propTypes = {
    profile: PropTypes.object,
    editMode: PropTypes.bool,
    isOwner: PropTypes.bool,
    privacyValue: PropTypes.string,
    isFollower: PropTypes.bool,
    onEdit: PropTypes.func,
};
