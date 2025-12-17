import React from 'react';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Typography,
    TextField,
    Button,
    Tooltip,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    IconButton,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import GroupIcon from '@mui/icons-material/Group';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';

import useBasePostForm, { MAX_TITLE, MAX_DESCRIPTION } from './useBasePostForm';
import CityCountySelect from '../../../components/CityCountySelect';

const MAX_PHOTOS = 4;

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function NewGeneralDiscussionForm({
                                                     onClose,
                                                     onSubmit,
                                                     onRefresh,
                                                     defaultCity = '',
                                                     defaultCounty = '',
                                                     countyRequired = true,
                                                 }) {
    const base = useBasePostForm({ defaultCity, defaultCounty, countyRequired });

    const [visibility, setVisibility] = React.useState('public');

    // Photos (ordered): index 0 = cover
    const [photos, setPhotos] = React.useState([]);
    const photosRef = React.useRef([]);
    const fileInputRef = React.useRef(null);

    const [isDropActive, setIsDropActive] = React.useState(false);

    // Drag reorder state
    const dragIndexRef = React.useRef(null);
    const isReorderingRef = React.useRef(false);

    const { city, county, setCity, setCounty } = base;

    const remainingCount = MAX_PHOTOS - photos.length;

    // Keep ref for cleanup
    React.useEffect(() => {
        photosRef.current = photos;
    }, [photos]);

    // Cleanup object URLs on unmount
    React.useEffect(() => {
        return () => {
            photosRef.current.forEach((p) => {
                try {
                    URL.revokeObjectURL(p.url);
                } catch (e) {
                    // ignore
                }
            });
        };
    }, []);

    // Apply passed defaults (if base isn't already populated)
    React.useEffect(() => {
        if (!city && defaultCity) setCity(defaultCity);
        if (!county && defaultCounty) setCounty(defaultCounty);
    }, [city, county, defaultCity, defaultCounty, setCity, setCounty]);

    // Fallback: if no defaults were provided, auto-fill from profile
    const fetchedProfileRef = React.useRef(false);
    React.useEffect(() => {
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
    }, [city, county, defaultCity, defaultCounty, setCity, setCounty]);

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
                next.push({ id: makeId(), file, url });
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
            if (toRemove?.url) {
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

    const onThumbDragStart = React.useCallback((idx) => {
        if (idx < 0 || idx >= photos.length) return;
        dragIndexRef.current = idx;
        isReorderingRef.current = true;
    }, [photos.length]);

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

    /* Safe submitter */
    const doSubmit = async (formData) => {
        if (typeof onSubmit === 'function') {
            return onSubmit(formData);
        }

        const res = await fetch('/api/general-discussion', {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });

        if (!res.ok) {
            const msg = (await res.text()) || 'Failed to submit general discussion post.';
            throw new Error(msg);
        }

        return res.json();
    };

    async function handlePost() {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (base.isDisabled) return;

        base.setSubmitting(true);
        try {
            const coords = base.coordsFromLocalData(base.city, base.county) || [];
            const [lat, lng] = coords.length === 2 ? coords : ['', ''];

            const form = new FormData();
            form.append('title', base.title);
            form.append('visibility', visibility);
            form.append('description', base.description);
            form.append('city', base.city);
            form.append('county', base.county);
            form.append('latitude', lat);
            form.append('longitude', lng);

            // Order matters: first = cover
            photos.forEach((p) => form.append('photos', p.file));

            await doSubmit(form);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            base.setError(err?.message || 'Submission failed.');
        } finally {
            base.setSubmitting(false);
        }
    }

    return (
        <>
            <DialogTitle>New General Discussion Post</DialogTitle>

            <DialogContent
                dividers
                autoComplete="off"
                component="form"
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
                {base.error && <Typography color="error">{base.error}</Typography>}

                <TextField
                    label="Title"
                    required
                    fullWidth
                    value={base.title}
                    onChange={(e) => base.setTitle(e.target.value)}
                    inputProps={{ maxLength: MAX_TITLE }}
                />
                <Typography variant="caption">{base.title.length} / {MAX_TITLE}</Typography>

                <FormControl required sx={{ width: { xs: '100%', sm: 180 } }}>
                    <InputLabel>Visibility</InputLabel>
                    <Select
                        value={visibility}
                        label="Visibility"
                        size="small"
                        onChange={(e) => setVisibility(e.target.value)}
                    >
                        <MenuItem value="public">
                            <PublicIcon fontSize="small" style={{ marginRight: 8 }} /> Public
                        </MenuItem>
                        <MenuItem value="followers">
                            <GroupIcon fontSize="small" style={{ marginRight: 8 }} /> Followers Only
                        </MenuItem>
                    </Select>
                </FormControl>

                <CityCountySelect
                    city={base.city}
                    setCity={base.setCity}
                    county={base.county}
                    setCounty={base.setCounty}
                    countyRequired={countyRequired}
                    countyLabelOverride={countyRequired ? 'County *' : 'County'}
                    countyError={base.attemptedSubmit && !base.county ? 'County is required.' : ''}
                />

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

                {/* Photos section */}
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
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={base.tooltipMsg} disableHoverListener={!base.tooltipMsg}>
                    <span>
                        <Button variant="contained" onClick={handlePost} disabled={base.isDisabled}>
                            {base.submitting ? <CircularProgress size={20} /> : 'Post'}
                        </Button>
                    </span>
                </Tooltip>
                <Button variant="outlined" onClick={onClose} disabled={base.submitting}>
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
