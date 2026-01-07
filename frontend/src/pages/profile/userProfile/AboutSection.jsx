// src/pages/profile/userProfile/AboutSection.jsx
// Updates in this version:
// - Removes per-section privacy rules; uses a single private-account gate.
// - Removes Bio editing/display here (Bio now lives under the profile header).
// - Removes Location editing here (Location is now edited under Edit Profile in the header).
// - Keeps: Relationship + Birthday, and still displays Location in view mode.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CakeIcon from '@mui/icons-material/Cake';

/* ---------------- helpers ---------------- */

const formatDate = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const toCountyDisplay = (county) =>
    county
        ? String(county).toLowerCase().includes('county')
            ? String(county)
            : `${county} County`
        : '';

const locationLabel = (city, county) => [city, toCountyDisplay(county)].filter(Boolean).join(', ');

const normalizeRelationshipRaw = (raw) => {
    if (raw == null || raw === '') return 'prefer-not';
    if (typeof raw === 'number') {
        const mapNum = { 1: 'single', 2: 'in-relationship', 3: 'married', 4: 'its-complicated' };
        return mapNum[raw] || 'prefer-not';
    }
    let v = String(raw).trim().toLowerCase().replace(/[’]/g, "'");
    if (v === 'in relationship' || v === 'in a relationship') v = 'in-relationship';
    if (v === "it's complicated" || v === 'its complicated') v = 'its-complicated';
    if (v === 'do not display' || v === 'hide' || v === 'none' || v === 'prefer-not-to-say') v = 'prefer-not';
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

export default function AboutSection({
                                         profile: initialProfile = null,
                                         editMode = false,
                                         isOwner = false,
                                         isFollower = false,
                                         isPrivateAccount = false,
                                         onEdit = null,
                                     }) {
    const [profile, setProfile] = useState(initialProfile);
    const [loading, setLoading] = useState(!initialProfile);

    const [relationship, setRelationship] = useState('prefer-not');
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

    const getProfileUser = (rawProfile) => rawProfile?.user || rawProfile || {};

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

        setRelationship(normalizeRelationshipRaw(p.relationship));
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

    useEffect(() => {
        let alive = true;
        (async () => {
            if (initialProfile && typeof initialProfile === 'object') {
                if (!alive) return;
                setProfile(initialProfile);
                setLoading(false);
                return;
            }

            const urls = ['/users/profile', '/api/users/profile'];
            for (const u of urls) {
                try {
                    const r = await fetch(u, { credentials: 'include' });
                    if (!r.ok) continue;
                    const data = await r.json();
                    if (!alive) return;
                    setProfile(data);
                    setLoading(false);
                    return;
                } catch {
                    // try next
                }
            }

            if (alive) setLoading(false);
        })();

        return () => {
            alive = false;
        };
    }, [initialProfile]);

    useEffect(() => {
        if (!profile) return;
        if (!editMode) syncFieldsFromProfile(profile);
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
        if (birthdayTouchedRef.current) return;
        if (birthday) return;

        const p = getProfileUser(profile);
        const nextBirthday = readBirthdayFromProfile(p);
        if (!nextBirthday) return;

        if (isUnder18(nextBirthday)) {
            setBirthday('');
            setBirthdayError('You must be at least 18 years old.');
            return;
        }

        setBirthday(nextBirthday);
        setBirthdayError('');
    }, [editMode, profile, birthday, maxDob]);

    useEffect(() => {
        if (typeof onEdit !== 'function') return;
        onEdit({
            relationship,
            birthday: birthday || '',
        });
    }, [onEdit, relationship, birthday]);

    const canViewAbout = useMemo(() => {
        if (isOwner) return true;
        if (!isPrivateAccount) return true;
        return !!isFollower;
    }, [isOwner, isPrivateAccount, isFollower]);

    const pUser = getProfileUser(profile);
    const city = pUser.home_city ?? pUser.city ?? '';
    const county = pUser.home_county ?? pUser.county ?? '';
    const labelLocation = locationLabel(city, county);

    const showRelationship = relationship && relationship !== 'prefer-not';

    if (loading) {
        return <Typography color="text.secondary">Loading…</Typography>;
    }

    if (!canViewAbout && !editMode) {
        return (
            <Typography variant="body2" color="text.secondary">
                This profile is private.
            </Typography>
        );
    }

    return !editMode ? (
        <Box id="about-body" sx={{ display: 'grid', rowGap: 1.25 }}>
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

            {labelLocation ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <LocationOnIcon fontSize="small" sx={{ color: 'orange' }} />
                    <Typography variant="body2">{labelLocation}</Typography>
                </Box>
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
                inputProps={{ max: maxDob }}
            />
        </Box>
    );
}

AboutSection.propTypes = {
    profile: PropTypes.object,
    editMode: PropTypes.bool,
    isOwner: PropTypes.bool,
    isFollower: PropTypes.bool,
    isPrivateAccount: PropTypes.bool,
    onEdit: PropTypes.func,
};
