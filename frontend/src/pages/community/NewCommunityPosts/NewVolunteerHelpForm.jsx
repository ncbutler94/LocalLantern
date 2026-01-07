// -----------------------------------------------------------------------------
// NewVolunteerHelpForm.jsx
//
// Community Help Requests + Volunteer Offers (separate UX, shared endpoint)
//
// Edit-mode support:
//  • Accepts editMode + initialData and renders identical UI as “New”
//  • Save uses JSON payload via shared EditCommunityPostDialog (PATCH)
//  • Delete button appears when editMode + onDelete provided (handled by wrapper)
//  • Photo editor supports existing photo URLs + reordering (cover = first)
//
// UPDATE 2025-12-23 (UI + simplification):
//  • Photos UI now matches the Lost & Found popup (drag/drop + 4 slots + cover + reorder)
//  • Removed: Needed-by date, Preferred time, Helpers needed (they were not shown on detail/page)
//  • Users describe timing/helpers in the Details field instead.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    TextField,
    Tooltip,
    Typography,
    IconButton,
    Checkbox,
    FormControlLabel,
} from '@mui/material';

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';

import useBasePostForm, { MAX_DESCRIPTION, MAX_TITLE } from './useBasePostForm';
import CityCountySelect from '../../../components/CityCountySelect';
import { createVolunteerRequest } from '../../../api/community/volunteerHelp';

const MAX_PHOTOS = 8;

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




function normalizeCounty(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    return raw.replace(/\s+County$/i, '').trim();
}

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseApiError(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;

    if (s.startsWith('{') && s.endsWith('}')) {
        try {
            const obj = JSON.parse(s);
            if (obj && typeof obj === 'object') return obj;
        } catch {
            // ignore
        }
    }
    return null;
}

function formatResetAt(resetAt) {
    if (!resetAt) return '';
    try {
        const d = new Date(resetAt);
        if (Number.isNaN(d.getTime())) return String(resetAt);
        return d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return String(resetAt);
    }
}

function buildPrettyError(raw) {
    const obj = parseApiError(raw);
    const msg = String(obj?.message || raw || '').trim();

    const isEditLimit =
        msg.toLowerCase().includes('edit a post up to') &&
        msg.toLowerCase().includes('times') &&
        msg.toLowerCase().includes('24-hour');

    if (isEditLimit) {
        const when = obj?.resetAt ? formatResetAt(obj.resetAt) : '';
        return {
            title: 'Edit limit reached',
            body: 'You can edit a post up to 5 times within a 24-hour window.',
            footer: when ? `Try again after ${when}.` : '',
        };
    }

    if (obj && (obj.message || obj.resetAt || obj.remaining != null)) {
        const when = obj?.resetAt ? formatResetAt(obj.resetAt) : '';
        return {
            title: 'Unable to save',
            body: msg || 'Something went wrong.',
            footer: when ? `Try again after ${when}.` : '',
        };
    }

    if (!msg) return null;
    return { title: 'Unable to save', body: msg, footer: '' };
}


export default function NewVolunteerHelpForm({
                                                 onClose,
                                                 onRefresh,
                                                 defaultRequestKind = 'help',
                                                 defaultCity = '',
                                                 defaultCounty = '',
                                                 countyRequired = true,

                                                 // injected by EditCommunityPostDialog
                                                 editMode = false,
                                                 initialData = null,
                                                 onDelete,
                                                 onSubmit, // in edit mode: receives JSON payload (PATCH wrapper). In create-mode we ignore and call createVolunteerRequest.
                                             }) {
    // Shared fields
    const base = useBasePostForm({
        defaultCity,
        defaultCounty: normalizeCounty(defaultCounty),
        countyRequired,
    });

    // If defaults are fetched/updated after mount (create-mode only), fill missing
    useEffect(() => {
        if (editMode) return;
        const dc = String(defaultCity || '').trim();
        const dco = normalizeCounty(defaultCounty);
        if (!base.city && dc) base.setCity(dc);
        if (!base.county && dco) base.setCounty(dco);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editMode, defaultCity, defaultCounty]);

    const requestKind =
        String(defaultRequestKind || '').trim().toLowerCase() === 'volunteer' ? 'volunteer' : 'help';
    const isVolunteer = requestKind === 'volunteer';

    // Separate details
    const [helpType, setHelpType] = useState('labor');
    const [helpTypeOther, setHelpTypeOther] = useState('');

    // Urgent flag (help requests only)
    const [isUrgent, setIsUrgent] = useState(false);

    /* ───────── photos (drag/drop + reorder, matches Lost & Found) ───────── */
    // Photos (ordered): index 0 = cover
    // Each item: { id, url, file?: File, existing?: boolean }
    const [photos, setPhotos] = useState([]);
    const photosRef = useRef([]);
    const fileInputRef = useRef(null);

    const [isDropActive, setIsDropActive] = useState(false);

    // Drag reorder state
    const dragIndexRef = useRef(null);
    const isReorderingRef = useRef(false);

    const remainingCount = MAX_PHOTOS - photos.length;

    useEffect(() => {
        photosRef.current = photos;
    }, [photos]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            photosRef.current.forEach((p) => {
                if (p?.existing) return;
                try {
                    if (p?.url) URL.revokeObjectURL(p.url);
                } catch {
                    // ignore
                }
            });
        };
    }, []);

    const addFiles = useCallback((fileList) => {
        const incoming = Array.from(fileList || []).filter((f) => String(f?.type || '').startsWith('image/'));
        if (!incoming.length) return;

        setPhotos((prev) => {
            const room = MAX_PHOTOS - prev.length;
            if (room <= 0) return prev;

            const slice = incoming.slice(0, room);
            const next = [...prev];
            slice.forEach((file) => {
                const url = URL.createObjectURL(file);
                next.push({ id: makeId(), file, url, existing: false });
            });
            return next;
        });
    }, []);

    const handleBrowseClick = useCallback(() => {
        if (base.submitting) return;
        if (remainingCount <= 0) return;
        if (fileInputRef.current) fileInputRef.current.click();
    }, [base.submitting, remainingCount]);

    const handleFileChange = useCallback(
        (e) => {
            if (base.submitting) return;
            addFiles(e.target.files);
            e.target.value = '';
        },
        [addFiles, base.submitting],
    );

    const removePhoto = useCallback((idx) => {
        setPhotos((prev) => {
            if (idx < 0 || idx >= prev.length) return prev;
            const toRemove = prev[idx];
            if (toRemove?.url && !toRemove?.existing) {
                try {
                    URL.revokeObjectURL(toRemove.url);
                } catch {
                    // ignore
                }
            }
            return prev.filter((_, i) => i !== idx);
        });
    }, []);

    const movePhoto = useCallback((from, to) => {
        setPhotos((prev) => {
            if (from === to) return prev;
            if (from < 0 || from >= prev.length) return prev;
            if (to < 0 || to >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    }, []);

    const onThumbDragStart = useCallback(
        (idx) => {
            if (idx < 0 || idx >= photos.length) return;
            dragIndexRef.current = idx;
            isReorderingRef.current = true;
        },
        [photos.length],
    );

    const onThumbDragEnd = useCallback(() => {
        dragIndexRef.current = null;
        isReorderingRef.current = false;
        setIsDropActive(false);
    }, []);

    const onThumbDrop = useCallback(
        (e, idx) => {
            e.preventDefault();
            e.stopPropagation();

            if (idx < 0 || idx >= photos.length) {
                dragIndexRef.current = null;
                isReorderingRef.current = false;
                setIsDropActive(false);
                return;
            }

            const from = dragIndexRef.current;
            dragIndexRef.current = null;
            isReorderingRef.current = false;
            setIsDropActive(false);

            if (typeof from !== 'number') return;
            movePhoto(from, idx);
        },
        [movePhoto, photos.length],
    );

    const onDropZoneDragOver = useCallback(
        (e) => {
            e.preventDefault();
            if (isReorderingRef.current) return;
            if (base.submitting || remainingCount <= 0) return;
            if (!isDropActive) setIsDropActive(true);
        },
        [base.submitting, remainingCount, isDropActive],
    );

    const onDropZoneDragLeave = useCallback(() => {
        if (isReorderingRef.current) return;
        setIsDropActive(false);
    }, []);

    const onDropZoneDrop = useCallback(
        (e) => {
            e.preventDefault();

            if (isReorderingRef.current) {
                dragIndexRef.current = null;
                isReorderingRef.current = false;
                setIsDropActive(false);
                return;
            }

            setIsDropActive(false);
            if (base.submitting) return;
            addFiles(e.dataTransfer.files);
        },
        [addFiles, base.submitting],
    );

    // Edit-mode prefill
    useEffect(() => {
        if (!editMode) return;
        if (!initialData) return;

        if (typeof initialData.title === 'string') base.setTitle(initialData.title);
        if (typeof initialData.description === 'string') base.setDescription(initialData.description);
        if (typeof initialData.city === 'string') base.setCity(initialData.city);
        if (typeof initialData.county === 'string') base.setCounty(normalizeCounty(initialData.county));

        const ht = String(initialData.help_type || '').trim();
        if (ht) setHelpType(ht);

        const hto = String(initialData.help_type_other || '').trim();
        if (hto) setHelpTypeOther(hto);

        // Urgent (support top-level + nested shapes)
        const urgentRaw =
            (initialData?.is_urgent ?? initialData?.isUrgent ?? initialData?.urgent) ??
            (initialData?.volunteer_help?.is_urgent ?? initialData?.volunteer_help?.isUrgent ?? initialData?.volunteer_help?.urgent) ??
            (initialData?.volunteerHelp?.is_urgent ?? initialData?.volunteerHelp?.isUrgent ?? initialData?.volunteerHelp?.urgent) ??
            (initialData?.volunteer_help_request?.is_urgent ?? initialData?.volunteer_help_request?.isUrgent ?? initialData?.volunteer_help_request?.urgent);

        const urgentStr = String(urgentRaw ?? '').trim().toLowerCase();
        const urgentBool =
            urgentStr === '1' ||
            urgentStr === 'true' ||
            urgentStr === 'yes' ||
            urgentStr === 'y' ||
            urgentStr === 'on' ||
            urgentStr === 'urgent';
        setIsUrgent(urgentBool);

        const existing = Array.isArray(initialData.photos) ? initialData.photos : [];
        const cleaned = existing
            .map((u) => String(u || '').trim())
            .filter(Boolean)
            .slice(0, MAX_PHOTOS)
            .map((url) => ({ id: makeId(), url, existing: true }));
        setPhotos(cleaned);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editMode, initialData]);

    // In create-mode, we also try to autofill city/county from profile once (do not override explicit defaults)
    const didAutofillLocationRef = useRef(false);
    useEffect(() => {
        if (editMode) return;
        if (didAutofillLocationRef.current) return;
        didAutofillLocationRef.current = true;

        const ac = new AbortController();
        let alive = true;

        (async () => {
            try {
                const res = await fetch('/users/profile', { credentials: 'include', signal: ac.signal });
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
                    // ignore
                }
            }
        })();

        return () => {
            alive = false;
            ac.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editMode]);

    // Validation (no useMemo — keep simple & safe)
    const requiredMissing = [];
    if (!String(base.title || '').trim()) requiredMissing.push('Title');
    if (!String(helpType || '').trim()) requiredMissing.push('Category');
    if (helpType === 'other' && !String(helpTypeOther || '').trim()) requiredMissing.push('Other category');
    if (countyRequired && !String(base.county || '').trim()) requiredMissing.push('County');

    const customTooltip = base.tooltipMsg
        ? base.tooltipMsg
        : requiredMissing.length
            ? `Please fill: ${requiredMissing.join(', ')}`
            : '';

    const canSubmit = !base.isDisabled && requiredMissing.length === 0;

    const handleSaveOrPost = async () => {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (!canSubmit) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = base.resolveCoordinates();

            if (editMode) {
                const postId = Number(initialData?.id ?? initialData?.post_id ?? initialData?.postId);
                if (!Number.isFinite(postId) || postId <= 0) {
                    throw new Error('Missing post id for edit.');
                }

                const form = new FormData();
                form.append('title', base.title || '');
                form.append('description', base.description || '');
                form.append('request_kind', requestKind || 'help');
                form.append('help_type', helpType || '');
                form.append('help_type_other', helpType === 'other' ? String(helpTypeOther || '').trim() : '');
                form.append('is_urgent', !isVolunteer && isUrgent ? '1' : '0');
                form.append('urgent', !isVolunteer && isUrgent ? '1' : '0');
                form.append('city', base.city || '');
                form.append('county', base.county || '');
                form.append('latitude', lat ?? '');
                form.append('longitude', lng ?? '');

                const orderTokens = [];
                let newIndex = 0;

                (photos || []).forEach((p) => {
                    if (!p) return;

                    if (p.existing && p.url) {
                        orderTokens.push(String(p.url).trim());
                        return;
                    }

                    if (p.file) {
                        form.append('photos', p.file);
                        orderTokens.push(`__new__:${newIndex}`);
                        newIndex += 1;
                    }
                });

                form.append('photo_order', JSON.stringify(orderTokens));

                const res = await fetch(`/api/community/${postId}`, {
                    method: 'PATCH',
                    body: form,
                    credentials: 'include',
                });

                if (!res.ok) {
                    const msg = (await res.text()) || 'Save failed.';
                    throw new Error(msg);
                }

                try {
                    await res.json();
                } catch {
                    // ignore
                }

                if (typeof onRefresh === 'function') await onRefresh();
                onClose();
                return;
            }

            const form = new FormData();
            form.append('title', base.title);
            form.append('extra_notes', base.description);
            form.append('request_kind', requestKind);
            form.append('help_type', helpType);

            // Urgent (help requests only)
            form.append('is_urgent', !isVolunteer && isUrgent ? '1' : '0');
            form.append('urgent', !isVolunteer && isUrgent ? '1' : '0');

            if (helpType === 'other' && String(helpTypeOther || '').trim()) {
                form.append('help_type_other', String(helpTypeOther).trim());
            }

            form.append('city', base.city);
            form.append('county', base.county);
            form.append('latitude', lat ?? '');
            form.append('longitude', lng ?? '');

            (photos || []).forEach((p) => {
                if (p?.file) form.append('photos', p.file);
            });

            await createVolunteerRequest(form);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            base.setError(err?.message || (editMode ? 'Save failed.' : 'Submission failed.'));
        } finally {
            base.setSubmitting(false);
        }
    };

    const titleText = editMode ? (isVolunteer ? 'Edit Volunteer Offer' : 'Edit Help Request') : (isVolunteer ? 'Offer to Volunteer' : 'Ask for Help');
    const primaryBtnText = editMode ? 'Save' : 'Post';

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
                        {titleText}
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
                {base.error ? (() => {
                    const pe = buildPrettyError(base.error);
                    if (!pe) return null;
                    return (
                        <Alert severity="error" sx={{ borderRadius: 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 900 }}>
                                {pe.title}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.25 }}>
                                {pe.body}
                            </Typography>
                            {pe.footer ? (
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                                    {pe.footer}
                                </Typography>
                            ) : null}
                        </Alert>
                    );
                })() : null}

                <Alert severity="info" sx={{ borderRadius: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Community posts are for volunteer / neighbor support.
                    </Typography>
                    <Typography variant="body2">
                        If you’re hiring someone or offering a paid service, please use the Services page.
                    </Typography>
                </Alert>

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

                <TextField
                    select
                    label={isVolunteer ? 'I can help with' : 'Help needed'}
                    required
                    fullWidth
                    value={helpType}
                    onChange={(e) => setHelpType(e.target.value)}
                >
                    {HELP_TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                            {t.label}
                        </MenuItem>
                    ))}
                </TextField>

                {!isVolunteer ? (
                    <Box sx={{ mt: 0.25 }}>
                        <FormControlLabel
                            sx={{ alignItems: 'flex-start', m: 0 }}
                            control={
                                <Checkbox
                                    checked={isUrgent}
                                    onChange={(e) => setIsUrgent(e.target.checked)}
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                        Mark as urgent
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.1 }}>
                                        Adds an “Urgent” badge so neighbors know this needs quick help.
                                    </Typography>
                                </Box>
                            }
                        />
                    </Box>
                ) : null}

                {helpType === 'other' ? (
                    <TextField
                        label="Other category"
                        required
                        fullWidth
                        value={helpTypeOther}
                        onChange={(e) => setHelpTypeOther(e.target.value)}
                        inputProps={{ maxLength: 80 }}
                        placeholder='Example: "Pet sitting"'
                    />
                ) : null}




                <CityCountySelect
                    city={base.city}
                    setCity={base.setCity}
                    county={base.county}
                    setCounty={base.setCounty}
                    countyRequired={countyRequired}
                    countyLabelOverride={countyRequired ? 'County *' : 'County'}
                />

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
                            ? 'Include any limits, comfort level, and any timing details.'
                            : 'Include what you need, and any timing / number of helpers / tools needed.'
                    }
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {base.description.length} / {MAX_DESCRIPTION}
                </Typography>

                {/* Photos (matches Lost & Found UI) */}
                <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PhotoLibraryOutlinedIcon fontSize="small" />
                            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                                Photos
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                First photo is the cover photo.
                            </Typography>
                        </Box>

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleBrowseClick}
                            disabled={base.submitting || remainingCount <= 0}
                        >
                            Add photos
                        </Button>

                        <input
                            ref={fileInputRef}
                            hidden
                            accept="image/*"
                            type="file"
                            multiple
                            onChange={handleFileChange}
                        />
                    </Box>

                    <Box
                        role="button"
                        tabIndex={0}
                        onClick={handleBrowseClick}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleBrowseClick();
                        }}
                        onDragOver={onDropZoneDragOver}
                        onDragLeave={onDropZoneDragLeave}
                        onDrop={onDropZoneDrop}
                        sx={{
                            border: '2px dashed',
                            borderColor: isDropActive ? 'primary.main' : 'divider',
                            borderRadius: 2,
                            p: 1.25,
                            cursor: base.submitting || remainingCount <= 0 ? 'default' : 'pointer',
                            bgcolor: isDropActive ? 'action.hover' : 'transparent',
                            transition: 'background-color 120ms ease, border-color 120ms ease',
                            outline: 'none',
                            '&:focus-visible': {
                                boxShadow: (theme) => `0 0 0 3px ${theme.palette.action.focus}`,
                            },
                        }}
                    >
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 2,
                                flexWrap: 'wrap',
                                px: 0.25,
                                pb: 1,
                            }}
                        >
                            <Typography variant="body2" color="text.secondary">
                                Drag & drop photos here, or click to browse.
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {photos.length} / {MAX_PHOTOS}
                            </Typography>
                        </Box>

                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: 'repeat(2, minmax(0, 1fr))',
                                    sm: 'repeat(4, minmax(0, 1fr))',
                                },
                                gap: 1,
                            }}
                        >
                            {Array.from({ length: MAX_PHOTOS }).map((_, slotIdx) => {
                                const p = photos[slotIdx] || null;
                                const isCoverSlot = slotIdx === 0;

                                if (!p) {
                                    return (
                                        <Box
                                            key={`slot-${slotIdx}`}
                                            sx={{
                                                height: { xs: 110, sm: 96 },
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                borderRadius: 2,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 0.25,
                                                bgcolor: 'background.paper',
                                            }}
                                        >
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    fontWeight: 700,
                                                    color: isCoverSlot ? 'primary.main' : 'text.secondary',
                                                }}
                                            >
                                                {isCoverSlot ? 'Cover Photo' : 'Photo'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {remainingCount <= 0 ? 'Limit reached' : 'Drop or click'}
                                            </Typography>
                                        </Box>
                                    );
                                }

                                const canDropHere = slotIdx < photos.length;

                                return (
                                    <Box
                                        key={p.id}
                                        draggable={!base.submitting}
                                        onDragStart={() => onThumbDragStart(slotIdx)}
                                        onDragEnd={onThumbDragEnd}
                                        onDragOver={(e) => {
                                            if (!canDropHere) return;
                                            e.preventDefault();
                                        }}
                                        onDrop={(e) => {
                                            if (!canDropHere) return;
                                            onThumbDrop(e, slotIdx);
                                        }}
                                        sx={{
                                            position: 'relative',
                                            height: { xs: 110, sm: 96 },
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            border: '1px solid',
                                            borderColor: slotIdx === 0 ? 'primary.main' : 'divider',
                                            bgcolor: 'background.paper',
                                            userSelect: 'none',
                                        }}
                                        title="Drag to reorder"
                                    >
                                        <img
                                            src={p.url}
                                            alt={slotIdx === 0 ? 'Cover photo preview' : `Photo ${slotIdx + 1} preview`}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            draggable={false}
                                        />

                                        {slotIdx === 0 ? (
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    top: 8,
                                                    left: 8,
                                                    px: 1,
                                                    py: 0.25,
                                                    borderRadius: 999,
                                                    bgcolor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                Cover
                                            </Box>
                                        ) : null}

                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                bottom: 6,
                                                left: 6,
                                                right: 6,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 0.5,
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        movePhoto(slotIdx, slotIdx - 1);
                                                    }}
                                                    disabled={base.submitting || slotIdx === 0}
                                                    sx={{
                                                        bgcolor: 'rgba(0,0,0,0.45)',
                                                        color: 'white',
                                                        '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' },
                                                    }}
                                                    aria-label="Move photo left"
                                                >
                                                    <KeyboardArrowLeftIcon fontSize="small" />
                                                </IconButton>

                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        movePhoto(slotIdx, slotIdx + 1);
                                                    }}
                                                    disabled={base.submitting || slotIdx === photos.length - 1}
                                                    sx={{
                                                        bgcolor: 'rgba(0,0,0,0.45)',
                                                        color: 'white',
                                                        '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' },
                                                    }}
                                                    aria-label="Move photo right"
                                                >
                                                    <KeyboardArrowRightIcon fontSize="small" />
                                                </IconButton>
                                            </Box>

                                            <IconButton
                                                size="small"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removePhoto(slotIdx);
                                                }}
                                                disabled={base.submitting}
                                                sx={{
                                                    bgcolor: 'rgba(0,0,0,0.45)',
                                                    color: 'white',
                                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' },
                                                }}
                                                aria-label="Remove photo"
                                            >
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>

                        {editMode && photos.some((p) => p && p.existing === false) ? (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700 }}>
                                    Note: You can add, remove, and reorder photos while editing.
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    Your changes will upload to the same cloud storage as new posts.
                                </Typography>
                            </Box>
                        ) : null}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={customTooltip} disableHoverListener={!customTooltip}>
                    <span>
                        <Button
                            variant="contained"
                            disabled={!canSubmit || base.submitting}
                            onClick={handleSaveOrPost}
                            sx={{ fontWeight: 800, borderRadius: 999, px: 3 }}
                        >
                            {base.submitting ? <CircularProgress size={20} /> : primaryBtnText}
                        </Button>
                    </span>
                </Tooltip>

                {editMode && typeof onDelete === 'function' ? (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={onDelete}
                        disabled={base.submitting}
                        sx={{ fontWeight: 900, borderRadius: 999, px: 3 }}
                    >
                        Delete Post
                    </Button>
                ) : null}

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
