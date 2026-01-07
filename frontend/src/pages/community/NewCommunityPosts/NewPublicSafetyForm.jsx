import React, { useState } from 'react';
import dayjs from 'dayjs';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Typography,
    Tooltip,
    Button,
    CircularProgress,
    Alert,
    Box,
    IconButton} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';

import useBasePostForm, { MAX_TITLE, MAX_DESCRIPTION } from './useBasePostForm';
import CityCountySelect from '../../../components/CityCountySelect';
import { LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

const MAX_PHOTOS = 8;

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


export default function NewPublicSafetyForm({
                                                onClose,
                                                onSubmit, // optional — safe local fallback included below
                                                onRefresh, // optional
                                                defaultCity = '',
                                                defaultCounty = '',
                                                countyRequired = true,

                                                // Edit-mode support
                                                editMode = false,
                                                initialData = null, // { id, title, description, city, county, expires_at, photos:[url...] }
                                                onDelete, // optional () => void
                                            }) {
    /* ─── shared base fields ─────────────────────────────────────────────── */
    const base = useBasePostForm({ defaultCity, defaultCounty, countyRequired });

    const { city, county, setCity, setCounty } = base;

    // Apply passed defaults (create-mode only)
    React.useEffect(() => {
        if (editMode) return;
        if (!city && defaultCity) setCity(defaultCity);
        if (!county && defaultCounty) setCounty(defaultCounty);
    }, [editMode, city, county, defaultCity, defaultCounty, setCity, setCounty]);

    // Fallback: if no defaults were provided, auto-fill from profile (create-mode only)
    const fetchedProfileRef = React.useRef(false);
    React.useEffect(() => {
        if (editMode) return;
        if (fetchedProfileRef.current) return;
        if (defaultCity || defaultCounty) return;
        if (city || county) return;

        fetchedProfileRef.current = true;
        const ac = new AbortController();

        fetch('/users/profile', { credentials: 'include', signal: ac.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const u = data?.user || null;
                const profileCity = String(u?.city || '').trim();
                const profileCounty = String(u?.county || '').trim();

                if (!city && profileCity) setCity(profileCity);
                if (!county && profileCounty) setCounty(profileCounty);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError') {
                    // ignore
                }
            });

        return () => ac.abort();
    }, [editMode, city, county, defaultCity, defaultCounty, setCity, setCounty]);

    /* ─── public-safety specific fields ──────────────────────────────────── */
    const [expiresAt, setExpiresAt] = useState(dayjs().add(24, 'hour'));

    /* ─── photos (drag/drop + reorder) ───────────────────────────────────── */
    // Each item: { id, url, file?: File, existing?: boolean }
    const [photos, setPhotos] = useState([]);
    const photosRef = React.useRef([]);
    const fileInputRef = React.useRef(null);

    const [isDropActive, setIsDropActive] = useState(false);

    // Drag reorder state
    const dragIndexRef = React.useRef(null);
    const isReorderingRef = React.useRef(false);

    const remainingCount = MAX_PHOTOS - photos.length;

    React.useEffect(() => {
        photosRef.current = photos;
    }, [photos]);

    React.useEffect(() => {
        return () => {
            photosRef.current.forEach((p) => {
                if (p?.existing) return;
                try {
                    if (p?.url) URL.revokeObjectURL(p.url);
                } catch (e) {
                    // ignore
                }
            });
        };
    }, []);

    // Prefill in edit mode
    React.useEffect(() => {
        if (!editMode) return;
        if (!initialData) return;

        if (typeof initialData.title === 'string') base.setTitle(initialData.title);
        if (typeof initialData.description === 'string') base.setDescription(initialData.description);
        if (typeof initialData.city === 'string') base.setCity(initialData.city);
        if (typeof initialData.county === 'string') base.setCounty(initialData.county);

        const exp = initialData.expires_at || initialData.expiresAt || null;
        if (exp) {
            const d = dayjs(exp);
            if (d.isValid()) setExpiresAt(d);
        }

        const existing = Array.isArray(initialData.photos) ? initialData.photos : [];
        const cleaned = existing
            .map((u) => String(u || '').trim())
            .filter(Boolean)
            .slice(0, MAX_PHOTOS)
            .map((url) => ({ id: makeId(), url, existing: true }));

        setPhotos(cleaned);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editMode, initialData]);

    const addFiles = React.useCallback((fileList) => {
        const incoming = Array.from(fileList || []).filter((f) =>
            String(f?.type || '').startsWith('image/')
        );
        if (incoming.length === 0) return;

        setPhotos((prev) => {
            const stillRoom = MAX_PHOTOS - prev.length;
            if (stillRoom <= 0) return prev;

            const slice = incoming.slice(0, stillRoom);
            const next = [...prev];

            slice.forEach((file) => {
                const url = URL.createObjectURL(file);
                next.push({ id: makeId(), file, url, existing: false });
            });

            return next;
        });
    }, []);

    const handleBrowseClick = React.useCallback(() => {
        if (base.submitting) return;
        if (remainingCount <= 0) return;
        if (fileInputRef.current) fileInputRef.current.click();
    }, [base.submitting, remainingCount]);

    const handleFileChange = React.useCallback(
        (e) => {
            if (base.submitting) return;
            addFiles(e.target.files);
            e.target.value = '';
        },
        [addFiles, base.submitting]
    );

    const removePhoto = React.useCallback((idx) => {
        setPhotos((prev) => {
            if (idx < 0 || idx >= prev.length) return prev;
            const toRemove = prev[idx];
            if (toRemove?.url && !toRemove?.existing) {
                try {
                    URL.revokeObjectURL(toRemove.url);
                } catch (e) {
                    // ignore
                }
            }
            return prev.filter((_, i) => i !== idx);
        });
    }, []);

    const movePhoto = React.useCallback((from, to) => {
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

    const onThumbDragStart = React.useCallback(
        (idx) => {
            if (idx < 0 || idx >= photos.length) return;
            dragIndexRef.current = idx;
            isReorderingRef.current = true;
        },
        [photos.length]
    );

    const onThumbDragEnd = React.useCallback(() => {
        dragIndexRef.current = null;
        isReorderingRef.current = false;
        setIsDropActive(false);
    }, []);

    const onThumbDrop = React.useCallback(
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
        [movePhoto, photos.length]
    );

    const onDropZoneDragOver = React.useCallback(
        (e) => {
            e.preventDefault();
            if (isReorderingRef.current) return;
            if (base.submitting || remainingCount <= 0) return;
            if (!isDropActive) setIsDropActive(true);
        },
        [base.submitting, remainingCount, isDropActive]
    );

    const onDropZoneDragLeave = React.useCallback(() => {
        if (isReorderingRef.current) return;
        setIsDropActive(false);
    }, []);

    const onDropZoneDrop = React.useCallback(
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
        [addFiles, base.submitting]
    );

    /* ─── validation ─────────────────────────────────────────────────────── */
    const needsTitle = !base.title.trim();
    const needsCounty = !base.county.trim();
    const isDisabled = base.submitting || needsTitle || needsCounty;

    const tooltipMsg = needsTitle ? 'Title is required.' : needsCounty ? 'County is required.' : '';

    /* ─── safe local submitter (prevents “onSubmit is not a function”) ───── */
    const doSubmit = async (payloadOrFormData) => {
        if (typeof onSubmit === 'function') {
            return onSubmit(payloadOrFormData);
        }
        const res = await fetch('/api/public-safety', {
            method: 'POST',
            body: payloadOrFormData,
            credentials: 'include',
        });
        if (!res.ok) {
            const msg = (await res.text()) || 'Failed to submit public safety alert.';
            throw new Error(msg);
        }
        return res.json();
    };

    /* ─── submit ─────────────────────────────────────────────────────────── */
    async function handleSaveOrPost() {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (isDisabled) return;

        base.setSubmitting(true);
        try {
            const coords = base.coordsFromLocalData(base.city, base.county) || [];
            const [lat, lng] = coords;

            if (editMode) {
                const postId = Number(initialData?.id ?? initialData?.post_id ?? initialData?.postId);
                if (!Number.isFinite(postId) || postId <= 0) {
                    throw new Error('Missing post id for edit.');
                }

                const fd = new FormData();
                fd.append('title', base.title || '');
                fd.append('description', base.description || '');
                fd.append('city', base.city || '');
                fd.append('county', base.county || '');
                fd.append('latitude', lat ?? '');
                fd.append('longitude', lng ?? '');
                fd.append('expires_at', expiresAt ? expiresAt.format('YYYY-MM-DD HH:mm:ss') : '');

                const orderTokens = [];
                let newIndex = 0;

                photos.forEach((p) => {
                    if (!p) return;

                    if (p.existing && p.url) {
                        orderTokens.push(String(p.url).trim());
                        return;
                    }

                    if (p.file) {
                        fd.append('photos', p.file);
                        orderTokens.push(`__new__:${newIndex}`);
                        newIndex += 1;
                    }
                });

                fd.append('photo_order', JSON.stringify(orderTokens));

                const res = await fetch(`/api/community/${postId}`, {
                    method: 'PATCH',
                    body: fd,
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

            const fd = new FormData();
            fd.append('title', base.title);
            fd.append('description', base.description);
            fd.append('city', base.city);
            fd.append('county', base.county);
            fd.append('latitude', lat ?? '');
            fd.append('longitude', lng ?? '');
            fd.append('expires_at', expiresAt ? expiresAt.format('YYYY-MM-DD HH:mm:ss') : '');

            photos.forEach((p) => {
                if (p?.file) fd.append('photos', p.file);
            });

            await doSubmit(fd);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            base.setError(err?.message || (editMode ? 'Save failed.' : 'Submission failed.'));
        } finally {
            base.setSubmitting(false);
        }
    }

    const titleText = editMode ? 'Edit Public Safety Alert' : 'New Public Safety Alert';
    const primaryBtnText = editMode ? 'Save' : 'Post';

    /* ─── render ─────────────────────────────────────────────────────────── */
    return (
        <>
            <DialogTitle>{titleText}</DialogTitle>

            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

                {/* Title */}
                <TextField
                    label="Title"
                    required
                    fullWidth
                    value={base.title}
                    onChange={(e) => base.setTitle(e.target.value)}
                    inputProps={{ maxLength: MAX_TITLE }}
                />
                <Typography variant="caption">
                    {base.title.length} / {MAX_TITLE}
                </Typography>

                {/* City / County — County required */}
                <CityCountySelect
                    city={base.city}
                    setCity={base.setCity}
                    county={base.county}
                    setCounty={base.setCounty}
                    countyRequired={countyRequired}
                    countyLabelOverride={countyRequired ? 'County *' : 'County'}
                    countyError={base.attemptedSubmit && !base.county ? 'County is required.' : ''}
                />

                {/* Expires At */}
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DateTimePicker
                        label="Expires At"
                        value={expiresAt}
                        onChange={(dt) => setExpiresAt(dt)}
                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                    />
                </LocalizationProvider>

                {/* Description */}
                <TextField
                    label="Description"
                    multiline
                    rows={4}
                    fullWidth
                    value={base.description}
                    onChange={(e) => base.setDescription(e.target.value)}
                    inputProps={{ maxLength: MAX_DESCRIPTION }}
                />
                <Typography variant="caption">
                    {base.description.length} / {MAX_DESCRIPTION}
                </Typography>

                {/* Photos */}
                <Box
                    sx={{
                        mt: 1,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        pt: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.25,
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            flexWrap: 'wrap',
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PhotoLibraryOutlinedIcon fontSize="small" />
                            <Typography variant="subtitle2">Photos</Typography>
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
                                Drag & drop images here, or click to browse.
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

                                        {slotIdx === 0 && (
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
                                        )}

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
                                                aria-label={`Remove photo ${slotIdx + 1}`}
                                            >
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>

                        {editMode && photos.some((p) => p?.existing === false) && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700 }}>
                                    Note: You can add, remove, and reorder photos while editing.
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Your changes will upload to the same cloud storage as new posts.
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={tooltipMsg} disableHoverListener={!tooltipMsg}>
                    <span>
                        <Button variant="contained" disabled={isDisabled} onClick={handleSaveOrPost}>
                            {base.submitting ? <CircularProgress size={20} /> : primaryBtnText}
                        </Button>
                    </span>
                </Tooltip>

                {editMode && typeof onDelete === 'function' && (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={onDelete}
                        disabled={base.submitting}
                        sx={{ fontWeight: 900 }}
                    >
                        Delete Post
                    </Button>
                )}

                <Button variant="outlined" onClick={onClose} disabled={base.submitting}>
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}