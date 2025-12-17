// -----------------------------------------------------------------------------
// NewVolunteerHelpForm.jsx
//
// Community Help Requests + Volunteer Offers (separate UX, shared endpoint)
//
// Goals:
//  • Differentiate “Ask for Help” vs “Offer to Volunteer” (not the Services page)
//  • Auto-prefill city/county from the user's profile when the dialog opens
//  • Modern photo picker with drag-and-drop upload + cover photo selection
//  • Keep mobile UI clean and readable
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormLabel,
    MenuItem,
    Radio,
    RadioGroup,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';

import useBasePostForm, { MAX_DESCRIPTION, MAX_TITLE } from './useBasePostForm';
import CityCountySelect from '../../../components/CityCountySelect';
import { createVolunteerRequest } from '../../../api/community/volunteerHelp';

const MAX_PHOTOS = 4;

const HELP_TYPES = [
    { value: 'labor', label: 'Home & Yard Help' },
    { value: 'rides', label: 'Rides & Errands' },
    { value: 'meals', label: 'Meals & Groceries' },
    { value: 'donations', label: 'Donations & Supplies' },
    { value: 'care', label: 'Care & Support' },
    { value: 'staffing', label: 'Community Event Help' },
    { value: 'skills', label: 'Skills & Advice' },
    { value: 'other', label: 'Other' },
];

const URGENCY_OPTIONS = [
    { value: 'flexible', label: 'Flexible' },
    { value: 'soon', label: 'Soon' },
    { value: 'urgent', label: 'Urgent' },
];

const TRAVEL_RADIUS_OPTIONS = [
    { value: 'city', label: 'Within my city' },
    { value: 'county', label: 'Within my county' },
    { value: 'neighboring_counties', label: 'Nearby counties' },
    { value: 'statewide', label: 'Anywhere in Alabama' },
];

const CONTACT_METHOD_OPTIONS = [
    { value: 'either', label: 'Either' },
    { value: 'text', label: 'Text' },
    { value: 'call', label: 'Call' },
    { value: 'email', label: 'Email' },
];

function normalizeCounty(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    return raw.replace(/\s+County$/i, '').trim();
}

export default function NewVolunteerHelpForm({
                                                 onClose,
                                                 onRefresh,
                                                 defaultRequestKind = 'help',
                                                 defaultCity = '',
                                                 defaultCounty = '',
                                                 countyRequired = true,
                                             }) {
    // Shared fields (title, description, location, etc.)
    const base = useBasePostForm({
        defaultCity,
        defaultCounty: normalizeCounty(defaultCounty),
        countyRequired,
    });

    // If defaults are fetched/updated after mount (ex: parent dialog fetches profile),
    // fill *only* missing fields.
    useEffect(() => {
        const dc = String(defaultCity || '').trim();
        const dco = normalizeCounty(defaultCounty);
        if (!base.city && dc) base.setCity(dc);
        if (!base.county && dco) base.setCounty(dco);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultCity, defaultCounty]);

    const requestKind =
        String(defaultRequestKind || '').trim().toLowerCase() === 'volunteer' ? 'volunteer' : 'help';

    // Separate (but stored together) details
    const [helpType, setHelpType] = useState('labor');
    const [helpTypeOther, setHelpTypeOther] = useState('');
    const [neededDate, setNeededDate] = useState(''); // yyyy-mm-dd

    // Help-request specific
    const [neededTime, setNeededTime] = useState('');
    const [helpersNeeded, setHelpersNeeded] = useState('');
    const [urgency, setUrgency] = useState('flexible');

    // Volunteer-offer specific
    const [availability, setAvailability] = useState('');
    const [travelRadius, setTravelRadius] = useState('county');

    // Shared
    const [contact, setContact] = useState('');
    const [contactMethod, setContactMethod] = useState('either');

    useEffect(() => {
        if (helpType !== 'other' && helpTypeOther) setHelpTypeOther('');
    }, [helpType, helpTypeOther]);

    // Photos (drag + drop + cover)
    const [photoSlots, setPhotoSlots] = useState(() => Array.from({ length: MAX_PHOTOS }, () => null));
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const photoSlotsRef = useRef(photoSlots);
    useEffect(() => {
        photoSlotsRef.current = photoSlots;
    }, [photoSlots]);

    useEffect(() => {
        // Cleanup all object URLs on unmount
        return () => {
            const current = photoSlotsRef.current || [];
            current.forEach((p) => {
                if (p?.url) URL.revokeObjectURL(p.url);
            });
        };
    }, []);

    const openFilePicker = useCallback(() => {
        fileInputRef.current?.click?.();
    }, []);

    const addFiles = useCallback((files) => {
        if (!files || !files.length) return;

        setPhotoSlots((prev) => {
            const next = [...prev];
            let idx = next.findIndex((s) => !s);

            for (const file of Array.from(files)) {
                if (idx === -1) break;
                if (!file || !String(file.type || '').startsWith('image/')) continue;

                const url = URL.createObjectURL(file);
                next[idx] = { file, url };
                idx = next.findIndex((s) => !s);
            }

            return next;
        });
    }, []);

    const removePhotoAt = useCallback((idx) => {
        setPhotoSlots((prev) => {
            const next = [...prev];
            const removed = next[idx];
            if (removed?.url) URL.revokeObjectURL(removed.url);
            next[idx] = null;
            return next;
        });
    }, []);

    const setAsCover = useCallback((idx) => {
        if (idx === 0) return;
        setPhotoSlots((prev) => {
            const selected = prev[idx];
            if (!selected) return prev;
            const next = [...prev];
            next.splice(idx, 1);
            next.unshift(selected);
            // Ensure fixed-length, keeping empties at the end
            return next.slice(0, MAX_PHOTOS);
        });
    }, []);

    const onFileInputChange = useCallback(
        (e) => {
            const files = e?.target?.files;
            addFiles(files);
            // Reset so the same file can be picked again if needed
            if (e?.target) e.target.value = '';
        },
        [addFiles],
    );

    const onDrop = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
            const files = e?.dataTransfer?.files;
            addFiles(files);
        },
        [addFiles],
    );

    const onDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    }, []);

    const onDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    }, []);

    // Auto-prefill city/county from user profile when the dialog opens.
    // We only fill missing values so we don't override explicit defaults.
    const didAutofillLocationRef = useRef(false);
    useEffect(() => {
        if (didAutofillLocationRef.current) return;
        didAutofillLocationRef.current = true;

        const ac = new AbortController();
        let alive = true;

        (async () => {
            try {
                const res = await fetch('/users/profile', {
                    credentials: 'include',
                    signal: ac.signal,
                });
                if (!res.ok) return;
                const data = await res.json();
                const u = data?.user || null;
                if (!u || !alive) return;

                const profileCity = String(u.city || '').trim();
                const profileCounty = normalizeCounty(u.county || '');

                if (!base.city && profileCity) base.setCity(profileCity);
                if (!base.county && profileCounty) base.setCounty(profileCounty);
            } catch (err) {
                if (err?.name !== 'AbortError') {
                    // no-op; location is optional
                }
            }
        })();

        return () => {
            alive = false;
            ac.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base.city, base.county, base.setCity, base.setCounty]);

    const dateLabel = requestKind === 'volunteer' ? 'Available starting' : 'Needed by';

    const isVolunteer = requestKind === 'volunteer';

    const requiredMissing = useMemo(() => {
        const missing = [];
        if (!String(base.title || '').trim()) missing.push('Title');
        if (!String(helpType || '').trim()) missing.push('Category');
        if (helpType === 'other' && !String(helpTypeOther || '').trim()) missing.push('Other category');
        if (!String(contact || '').trim()) missing.push('Contact info');
        if (countyRequired && !String(base.county || '').trim()) missing.push('County');
        return missing;
    }, [base.title, helpType, helpTypeOther, contact, base.county, countyRequired]);

    const customTooltip = useMemo(() => {
        if (base.tooltipMsg) return base.tooltipMsg;
        if (!requiredMissing.length) return '';
        return `Please fill: ${requiredMissing.join(', ')}`;
    }, [base.tooltipMsg, requiredMissing]);

    const canSubmit = !base.isDisabled && requiredMissing.length === 0;

    const handlePost = async () => {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (!canSubmit) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = base.resolveCoordinates();

            const form = new FormData();
            form.append('title', base.title);
            form.append('extra_notes', base.description);
            form.append('request_kind', requestKind);
            form.append('help_type', helpType);
            if (String(neededDate || '').trim()) form.append('needed_date', neededDate);
            if (helpType === 'other' && String(helpTypeOther || '').trim()) {
                form.append('help_type_other', String(helpTypeOther).trim());
            }
            form.append('contact', contact);
            form.append('contact_method', contactMethod);

            if (requestKind === 'help') {
                form.append('urgency', urgency);
                if (neededTime.trim()) form.append('needed_time', neededTime.trim());
                if (helpersNeeded.trim()) form.append('helpers_needed', helpersNeeded.trim());
            } else {
                if (availability.trim()) form.append('availability', availability.trim());
                form.append('travel_radius', travelRadius);
            }

            form.append('city', base.city);
            form.append('county', base.county);
            form.append('latitude', lat ?? '');
            form.append('longitude', lng ?? '');

            photoSlots
                .filter(Boolean)
                .forEach((p) => {
                    if (p?.file) form.append('photos', p.file);
                });

            await createVolunteerRequest(form);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            base.setError(err?.message || 'Submission failed.');
        } finally {
            base.setSubmitting(false);
        }
    };

    return (
        <>
            <DialogTitle
                sx={{
                    pr: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                        {isVolunteer ? 'Offer to Volunteer' : 'Ask for Help'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {isVolunteer
                            ? 'Share how you can help neighbors (not a paid service listing).'
                            : 'Request neighbor-to-neighbor support (not a paid service listing).'}
                    </Typography>
                </Box>

            </DialogTitle>

            <DialogContent
                dividers
                autoComplete="off"
                component="form"
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
                {base.error && <Typography color="error">{base.error}</Typography>}

                <Alert severity="info" sx={{ borderRadius: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Community posts are for volunteer / neighbor support.
                    </Typography>
                    <Typography variant="body2">
                        If you’re hiring someone or offering a paid service, please use the Services page.
                    </Typography>
                </Alert>

                {/* Title */}
                <TextField
                    label="Title"
                    required
                    fullWidth
                    value={base.title}
                    onChange={(e) => base.setTitle(e.target.value)}
                    inputProps={{ maxLength: MAX_TITLE }}
                    placeholder={
                        isVolunteer
                            ? 'Example: "Available to help with rides on weekends"'
                            : 'Example: "Need help moving a couch this Saturday"'
                    }
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {base.title.length} / {MAX_TITLE}
                </Typography>

                {/* Help type */}
                <FormControl component="fieldset" required>
                    <FormLabel sx={{ fontWeight: 800 }}>
                        {isVolunteer ? 'I can help with' : 'Help needed'}
                    </FormLabel>
                    <RadioGroup
                        value={helpType}
                        onChange={(e) => setHelpType(e.target.value)}
                        sx={{
                            mt: 1,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                            gap: 1,
                        }}
                    >
                        {HELP_TYPES.map((t) => (
                            <FormControlLabel
                                key={t.value}
                                value={t.value}
                                control={<Radio />}
                                label={t.label}
                                sx={{
                                    m: 0,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    px: 1,
                                    py: 0.75,
                                    '&:hover': { borderColor: 'text.primary' },
                                }}
                            />
                        ))}
                    </RadioGroup>
                </FormControl>

                {helpType === 'other' && (
                    <TextField
                        label="Other category"
                        required
                        fullWidth
                        value={helpTypeOther}
                        onChange={(e) => setHelpTypeOther(e.target.value)}
                        inputProps={{ maxLength: 80 }}
                        placeholder='Example: "Pet sitting"'
                    />
                )}

                {/* Date */}
                <TextField
                    label={dateLabel}
                    type="date"
                    fullWidth
                    value={neededDate}
                    onChange={(e) => setNeededDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    helperText="Optional"
                />

                {/* Help-request specific fields */}
                {!isVolunteer && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Preferred time (optional)"
                            fullWidth
                            value={neededTime}
                            onChange={(e) => setNeededTime(e.target.value)}
                            placeholder="Example: mornings, after 5pm, flexible"
                            inputProps={{ maxLength: 80 }}
                        />

                        <TextField
                            label="How many helpers? (optional)"
                            fullWidth
                            value={helpersNeeded}
                            onChange={(e) => {
                                const next = e.target.value;
                                // keep it numeric-ish without being overly strict
                                if (next === '' || /^\d{0,3}$/.test(next)) setHelpersNeeded(next);
                            }}
                            placeholder="Example: 2"
                            inputProps={{ inputMode: 'numeric' }}
                        />

                        <TextField
                            select
                            label="Urgency"
                            fullWidth
                            value={urgency}
                            onChange={(e) => setUrgency(e.target.value)}
                        >
                            {URGENCY_OPTIONS.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                )}

                {/* Volunteer-offer specific fields */}
                {isVolunteer && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Availability (optional)"
                            fullWidth
                            value={availability}
                            onChange={(e) => setAvailability(e.target.value)}
                            placeholder="Example: Weekends, Tue/Thu evenings"
                            inputProps={{ maxLength: 160 }}
                        />

                        <TextField
                            select
                            label="Travel radius"
                            fullWidth
                            value={travelRadius}
                            onChange={(e) => setTravelRadius(e.target.value)}
                        >
                            {TRAVEL_RADIUS_OPTIONS.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                )}

                {/* Contact */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <TextField
                        label="Best contact info (email or phone)"
                        required
                        fullWidth
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        inputProps={{ maxLength: 255 }}
                    />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Preferred method:
                        </Typography>
                        <ToggleButtonGroup
                            exclusive
                            value={contactMethod}
                            onChange={(_e, next) => {
                                if (next) setContactMethod(next);
                            }}
                            size="small"
                            aria-label="Preferred contact method"
                            sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 1,
                                '& .MuiToggleButton-root': {
                                    textTransform: 'none',
                                    fontWeight: 800,
                                    borderRadius: 999,
                                    px: 2,
                                    py: 0.5,
                                },
                            }}
                        >
                            {CONTACT_METHOD_OPTIONS.map((opt) => (
                                <ToggleButton key={opt.value} value={opt.value} aria-label={opt.label}>
                                    {opt.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Tip: avoid posting sensitive details in the description—share specifics after you connect.
                    </Typography>
                </Box>

                {/* City & County */}
                <CityCountySelect
                    city={base.city}
                    setCity={base.setCity}
                    county={base.county}
                    setCounty={base.setCounty}
                    countyRequired={countyRequired}
                    countyLabelOverride={countyRequired ? 'County *' : 'County'}
                />

                {/* Description */}
                <TextField
                    label={isVolunteer ? 'Details (what you can help with)' : 'Details (what you need)'}
                    multiline
                    rows={4}
                    fullWidth
                    value={base.description}
                    onChange={(e) => base.setDescription(e.target.value)}
                    inputProps={{ maxLength: MAX_DESCRIPTION }}
                    placeholder={
                        isVolunteer
                            ? 'Include any limits, comfort level, and how people should reach you.'
                            : 'Include what you need, any supplies/tools needed, and anything helpers should know.'
                    }
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {base.description.length} / {MAX_DESCRIPTION}
                </Typography>

                {/* Photos */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        Photos (optional – up to {MAX_PHOTOS})
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        The first photo is used as the cover.
                    </Typography>

                    <Box
                        role="button"
                        tabIndex={0}
                        onClick={openFilePicker}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') openFilePicker();
                        }}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        sx={{
                            border: '2px dashed',
                            borderColor: dragActive ? 'primary.main' : 'divider',
                            borderRadius: 2,
                            p: 2,
                            cursor: 'pointer',
                            outline: 'none',
                            '&:focus-visible': {
                                boxShadow: '0 0 0 3px rgba(25,118,210,0.25)',
                            },
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            hidden
                            accept="image/*"
                            type="file"
                            multiple
                            onChange={onFileInputChange}
                        />

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Box>
                                <Typography sx={{ fontWeight: 800 }}>
                                    Drag & drop photos here
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    or click to upload
                                </Typography>
                            </Box>
                            <Button variant="outlined" onClick={openFilePicker}>
                                Choose photos
                            </Button>
                        </Box>

                        <Box
                            sx={{
                                mt: 2,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${MAX_PHOTOS}, minmax(0, 1fr))`,
                                gap: 1,
                                '@media (max-width: 520px)': {
                                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                },
                            }}
                        >
                            {photoSlots.map((p, idx) => {
                                const isCover = idx === 0 && !!p;

                                return (
                                    <Box
                                        key={idx}
                                        sx={{
                                            position: 'relative',
                                            width: '100%',
                                            pt: '100%',
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            border: '1px solid',
                                            borderColor: p ? 'divider' : 'transparent',
                                            bgcolor: p ? 'background.paper' : 'action.hover',
                                        }}
                                    >
                                        {p ? (
                                            <>
                                                <Box
                                                    component="img"
                                                    src={p.url}
                                                    alt={idx === 0 ? 'Cover photo' : 'Photo preview'}
                                                    sx={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                    }}
                                                />

                                                {isCover && (
                                                    <Box
                                                        sx={{
                                                            position: 'absolute',
                                                            left: 8,
                                                            top: 8,
                                                            bgcolor: 'rgba(0,0,0,0.55)',
                                                            color: 'white',
                                                            px: 1,
                                                            py: 0.25,
                                                            borderRadius: 999,
                                                            fontSize: 12,
                                                            fontWeight: 800,
                                                        }}
                                                    >
                                                        Cover
                                                    </Box>
                                                )}

                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        right: 6,
                                                        top: 6,
                                                        display: 'flex',
                                                        gap: 0.75,
                                                    }}
                                                >
                                                    {idx !== 0 && (
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setAsCover(idx);
                                                            }}
                                                            sx={{
                                                                minWidth: 0,
                                                                px: 1,
                                                                py: 0.25,
                                                                fontSize: 12,
                                                                fontWeight: 800,
                                                            }}
                                                        >
                                                            Set cover
                                                        </Button>
                                                    )}

                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="error"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            removePhotoAt(idx);
                                                        }}
                                                        sx={{
                                                            minWidth: 0,
                                                            px: 1,
                                                            py: 0.25,
                                                            fontSize: 12,
                                                            fontWeight: 800,
                                                        }}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Box>
                                            </>
                                        ) : (
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'text.secondary',
                                                    fontWeight: 900,
                                                    fontSize: 22,
                                                    userSelect: 'none',
                                                }}
                                            >
                                                +
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        {photoSlots.filter(Boolean).length > 0 && (
                            <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary' }}>
                                Cover photo is set (first image).
                            </Typography>
                        )}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={customTooltip} disableHoverListener={!customTooltip}>
                    <span>
                        <Button
                            variant="contained"
                            disabled={!canSubmit || base.submitting}
                            onClick={handlePost}
                            sx={{ fontWeight: 800, borderRadius: 999, px: 3 }}
                        >
                            {base.submitting ? <CircularProgress size={20} /> : 'Post'}
                        </Button>
                    </span>
                </Tooltip>

                <Button
                    variant="outlined"
                    onClick={onClose}
                    disabled={base.submitting}
                    sx={{ fontWeight: 800, borderRadius: 999, px: 3 }}
                >
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
