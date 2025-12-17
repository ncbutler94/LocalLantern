// src/components/SidePanel/Events/NewEventDialog.jsx
// -----------------------------------------------------------------------------
// Create Event — 3-step dialog.
// This update:
//  • Description: fixed height, non‑resizable scroll box, 10,000‑char limit with live counter.
//  • If "Online event" is on, City and County are optional (no validation errors).
//  • Price field stays as a normal money input (accepts decimals).
//  • Event photo preview shows full image (contain) and never crops.
//  • Popups do not close on backdrop click; all have an "X" in the top‑right.
// -----------------------------------------------------------------------------

import React, { useMemo, useRef, useState } from 'react';
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    Stepper, Step, StepLabel, TextField, Typography, Stack,
    Switch, MenuItem, Alert, LinearProgress, InputAdornment
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import EventIcon from '@mui/icons-material/Event';
import LoginIcon from '@mui/icons-material/Login';
import axios from 'axios';

import CityCountySelect from '../../components/CityCountySelect';
import { useAuth } from '../../components/AuthModalContext';

// Local data used for centroid fallback (same pattern as Community)
import cityData from '../../data/alabamaCities.json';
import countyData from '../../data/alabamaCounties.json';

const CATEGORIES = [
    'Festival',
    'Concert',
    'Church',
    'Market',
    'Parade',
    'Volunteer',
    'Sports',
    'Class/Workshop',
    'Government/School',
    'Charity/Fundraiser',
    'Educational/Lecture',
    'Holiday/Celebration',
    'Family/Kids',
    'Other',
];

function coordsFromLocalData(city, county) {
    if (city) {
        const c = cityData.find((x) => x.name === city);
        if (c?.coordinates?.length === 2) return [c.coordinates[0], c.coordinates[1]];
    }
    if (county) {
        const k = county.endsWith(' County') ? county : `${county} County`;
        const co = countyData.find((x) => x.name === k);
        if (co?.coordinates?.length === 2) return [co.coordinates[0], co.coordinates[1]];
    }
    return [null, null];
}

const steps = ['Basics', 'When & Where', 'Price & Media'];

// Small preview (display‑only) — keeps original upload unchanged
async function makePreviewThumb(file, maxEdge = 720) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const { width, height } = img;
            const scale = Math.min(1, maxEdge / Math.max(width, height));
            const w = Math.round(width * scale);
            const h = Math.round(height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

export default function NewEventDialog({ open, onClose, onCreated, user }) {
    const { open: openLogin } = useAuth();

    // ── Stepper
    const [activeStep, setActiveStep] = useState(0);

    // ── Basics
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');

    // ── When & Where (split date / time + location)
    const [startDate, setStartDate] = useState(''); // yyyy-MM-dd
    const [startTime, setStartTime] = useState(''); // HH:mm
    const [endDate, setEndDate] = useState('');     // yyyy-MM-dd (optional)
    const [endTime, setEndTime] = useState('');     // HH:mm (optional)
    const [isOnline, setIsOnline] = useState(false);

    const [city, setCity] = useState('');
    const [county, setCounty] = useState('');
    const [address, setAddress] = useState(''); // optional street address

    // ── Price & Media
    const [isFree, setIsFree] = useState(false);
    const [price, setPrice] = useState(''); // keep as string; convert on submit
    const [imageUrl, setImageUrl] = useState('');
    const [imageThumb, setImageThumb] = useState(''); // display-only thumbnail
    const [imgUploading, setImgUploading] = useState(false);

    // ── UX
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Helpers
    const hasAddress = useMemo(() => !!address.trim(), [address]);

    // Build a local datetime -> ISO (UTC)
    const toISOStringUTC = (dateStr, timeStr) => {
        if (!dateStr) return '';
        const t = (timeStr || '00:00').padStart(5, '0');
        const d = new Date(`${dateStr}T${t}`);
        if (isNaN(+d)) return '';
        return d.toISOString();
    };

    // Date constraints
    const todayStr = useMemo(() => {
        const n = new Date();
        const y = n.getFullYear();
        const m = String(n.getMonth() + 1).padStart(2, '0');
        const d = String(n.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }, []);
    const disableEndDate = !startDate;

    // Refs (optional focus)
    const startDateRef = useRef(null);
    const startTimeRef = useRef(null);
    const endDateRef = useRef(null);
    const endTimeRef = useRef(null);

    // ── per-step validation
    const stepError = useMemo(() => {
        if (activeStep === 0) {
            if (!title.trim()) return 'Title is required.';
            return '';
        }
        if (activeStep === 1) {
            if (!startDate) return 'Start date is required.';
            if (!startTime) return 'Start time is required.';
            // County/City optional when ONLINE
            if (!isOnline) {
                if (!county.trim()) return 'County is required.';
                if (hasAddress && !city.trim()) return 'City is required when a street address is provided.';
            }
            if (endDate) {
                if (endDate < startDate) return 'End date cannot be earlier than start date.';
                if (endDate === startDate && endTime && endTime < startTime) {
                    return 'End time cannot be earlier than start time.';
                }
            }
            return '';
        }
        if (activeStep === 2) {
            const p = price.trim();
            if (!isFree && p && Number(p) < 0) return 'Price cannot be negative.';
            return '';
        }
        return '';
    }, [activeStep, title, startDate, startTime, isOnline, county, city, hasAddress, endDate, endTime, isFree, price]);

    const canNext = !stepError && !imgUploading && !submitting;

    // ── photo upload (cover image)
    const onPickImage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setImgUploading(true);
        try {
            // Create a small preview thumbnail for display only.
            const thumb = await makePreviewThumb(file, 720);
            if (thumb) setImageThumb(thumb);

            const { name, type } = file;
            const r = await axios.post(`${process.env.REACT_APP_API_URL}/api/uploads/signed-url`, {
                folder: 'events',
                fileName: name,
                contentType: type,
            });
            const { uploadUrl, publicUrl } = r.data;
            await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
            setImageUrl(publicUrl);
        } catch (err) {
            console.error('Upload failed', err);
            setError('Image upload failed.');
        } finally {
            setImgUploading(false);
        }
    };

    const removePhoto = () => {
        setImageUrl('');
        setImageThumb('');
    };

    // ── submit
    const doSubmit = async () => {
        const finalErr = stepError;
        if (finalErr) { setError(finalErr); return; }
        if (!user) { openLogin(); return; }

        setError('');
        setSubmitting(true);
        try {
            // Decide coordinates
            let lat = null, lng = null;
            if (!isOnline) {
                if (hasAddress) {
                    const body = { street: address, city, state: 'AL', country: 'US' };
                    const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/geocode`, body);
                    lat = res.data?.lat ?? null;
                    lng = res.data?.lng ?? null;
                } else {
                    const [y, x] = coordsFromLocalData(city, county);
                    lat = y; lng = x;
                }
            }

            // Build datetimes (UTC)
            const start_iso = toISOStringUTC(startDate, startTime);
            let end_iso = null;
            if (endDate) {
                end_iso = toISOStringUTC(endDate, endTime || startTime || '00:00');
            }

            // One price → backend min/max
            const priceNum = !isFree && price !== '' ? Number(price) : null;

            const payload = {
                title: title.trim(),
                description: description || null,
                category: category || null,

                start_datetime: start_iso,
                end_datetime: end_iso,

                venue_name: null,
                address: hasAddress ? address : null,
                city: city || null,
                county: county || null,
                lat, lng,

                is_online: !!isOnline,

                is_free: !!isFree,
                price_min: priceNum,
                price_max: priceNum,

                audience_flags: {},
                accessibility_flags: {},
                tags: [],

                image_url: imageUrl || null,
                source: 'user',
                status: 'published',
            };

            const result = await axios.post(`${process.env.REACT_APP_API_URL}/api/events`, payload);
            const id = result.data?.id;
            if (typeof onCreated === 'function') onCreated(id || null);
            internalClose();
        } catch (err) {
            console.error('Create event failed', err);
            setError(
                err?.response?.data?.errors?.join(', ')
                || err?.response?.data?.error
                || 'Could not create event. Please check your inputs.'
            );
        } finally {
            setSubmitting(false);
        }
    };

    // Reset state, then call parent onClose
    const resetState = () => {
        setActiveStep(0);
        setTitle(''); setCategory(''); setDescription('');
        setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setIsOnline(false);
        setCity(''); setCounty(''); setAddress('');
        setIsFree(false); setPrice('');
        setImageUrl(''); setImageThumb(''); setImgUploading(false);
        setError(''); setSubmitting(false);
    };

    const internalClose = () => {
        resetState();
        onClose?.();
    };

    // Prevent closing on backdrop click or ESC
    const handleDialogClose = (_e, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        internalClose();
    };

    const renderStep = () => {
        switch (activeStep) {
            case 0:
                return (
                    <Stack spacing={2}>
                        <TextField
                            label="Title *"
                            fullWidth
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            inputProps={{ maxLength: 255 }}
                        />
                        <TextField
                            select
                            label="Category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            helperText="Choose the closest match"
                            fullWidth
                        >
                            <MenuItem value=""><em>None</em></MenuItem>
                            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </TextField>

                        {/* Description: fixed height, non‑resizable, with live counter */}
                        <TextField
                            label="Description (up to 10,000 characters)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value.slice(0, 10000))}
                            multiline
                            rows={8}
                            fullWidth
                            helperText={`${description.length}/10000`}
                            inputProps={{ maxLength: 10000 }}
                            sx={{
                                '& textarea': { resize: 'none', overflowY: 'auto' }, // non-resizable scroll box
                            }}
                        />
                    </Stack>
                );
            case 1:
                return (
                    <Stack spacing={2}>
                        {/* Dates & times (Central Time) */}
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                type="date"
                                label="Start date (Central Time) *"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); if (endDate && e.target.value && endDate < e.target.value) setEndDate(''); }}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                inputProps={{ min: todayStr }}
                                inputRef={startDateRef}
                                helperText="Times are saved in UTC and shown in Central Time."
                            />
                            <TextField
                                type="time"
                                label="Start time (Central Time) *"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                inputRef={startTimeRef}
                            />
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                type="date"
                                label="End date (optional)"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                inputProps={{ min: startDate || todayStr }}
                                disabled={disableEndDate}
                                inputRef={endDateRef}
                                helperText={disableEndDate ? 'Select a start date first.' : ''}
                            />
                            <TextField
                                type="time"
                                label="End time (optional)"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                disabled={!endDate}
                                inputRef={endTimeRef}
                                inputProps={{
                                    min: endDate && startDate && endDate === startDate ? (startTime || undefined) : undefined,
                                }}
                            />
                        </Stack>

                        {/* Online toggle */}
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: 'fit-content', mt: 0.5 }}>
                            <Switch
                                id="online-event-switch"
                                checked={isOnline}
                                onChange={(e) => setIsOnline(e.target.checked)}
                                inputProps={{ 'aria-label': 'Online event' }}
                            />
                            <Typography component="label" htmlFor="online-event-switch" sx={{ cursor: 'pointer', userSelect: 'none' }}>
                                Online event
                            </Typography>
                        </Stack>

                        {/* Location (County/City optional when Online) */}
                        <CityCountySelect
                            city={city}
                            setCity={setCity}
                            county={county}
                            setCounty={setCounty}
                        />

                        <TextField
                            label="Street Address (optional)"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            fullWidth
                            helperText={hasAddress
                                ? (isOnline ? 'Address is optional for online events.' : 'With a street address, City & County are required.')
                                : (isOnline ? 'Online events may omit City and County.' : 'If you skip the address, we’ll place the event by city/county.')}
                        />
                    </Stack>
                );
            case 2:
                return (
                    <Stack spacing={2}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ width: 'fit-content' }}>
                                <Switch
                                    id="free-event-switch"
                                    checked={isFree}
                                    onChange={(e) => {
                                        const v = e.target.checked;
                                        setIsFree(v);
                                        if (v) setPrice('');
                                    }}
                                    inputProps={{ 'aria-label': 'Free event' }}
                                />
                                <Typography component="label" htmlFor="free-event-switch" sx={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Free
                                </Typography>
                            </Stack>

                            <TextField
                                label="Price"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                type="number"
                                size="small"
                                sx={{ width: 180 }}
                                disabled={isFree}
                                placeholder={isFree ? 'Free' : ''}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                }}
                                inputProps={{
                                    step: '0.01',
                                    min: 0,
                                    inputMode: 'decimal',
                                }}
                            />
                        </Stack>

                        {/* Event Photo */}
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Event Photo</Typography>

                            {imageUrl || imageThumb ? (
                                <Stack spacing={1.5}>
                                    {/* Contained preview so the full image is always visible */}
                                    <Box
                                        sx={{
                                            width: '100%',
                                            height: { xs: 220, sm: 260 },
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: 'background.default',
                                            borderRadius: 1.5,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src={imageThumb || imageUrl}
                                            alt="Event preview"
                                            sx={{
                                                maxWidth: '100%',
                                                maxHeight: '100%',
                                                objectFit: 'contain',
                                                display: 'block',
                                            }}
                                        />
                                    </Box>

                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Button component="label" startIcon={<AddPhotoAlternateIcon />} variant="outlined" disabled={imgUploading}>
                                            {imgUploading ? 'Uploading…' : 'Change Photo'}
                                            <input type="file" accept="image/*" hidden onChange={onPickImage} />
                                        </Button>
                                        <Button color="inherit" onClick={removePhoto} disabled={!imageUrl && !imageThumb}>
                                            Remove Photo
                                        </Button>
                                    </Stack>
                                </Stack>
                            ) : (
                                <Button component="label" startIcon={<AddPhotoAlternateIcon />} variant="outlined" disabled={imgUploading}>
                                    {imgUploading ? 'Uploading…' : 'Upload Photo'}
                                    <input type="file" accept="image/*" hidden onChange={onPickImage} />
                                </Button>
                            )}
                        </Box>
                    </Stack>
                );
            default:
                return null;
        }
    };

    const isSignedOut = !user;

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            fullWidth
            maxWidth={isSignedOut ? 'xs' : 'sm'}
            disableEscapeKeyDown
        >
            <DialogTitle>{isSignedOut ? 'Sign in required' : 'Create a New Event'}</DialogTitle>

            <DialogContent dividers>
                {isSignedOut ? (
                    <>
                        <Typography variant="body1" sx={{ mb: 1.5 }}>
                            You need to be logged in to create an event.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            This helps keep event listings trustworthy and lets you manage your submissions.
                        </Typography>
                    </>
                ) : (
                    <>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {submitting && <LinearProgress sx={{ mb: 2 }} />}

                        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
                            {steps.map((s) => (
                                <Step key={s}><StepLabel>{s}</StepLabel></Step>
                            ))}
                        </Stepper>

                        {renderStep()}
                    </>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                    {!isSignedOut && (
                        <Typography variant="caption" color="text.secondary">
                            Fields marked * are required.
                        </Typography>
                    )}
                </Box>

                {isSignedOut ? (
                    <>
                        <Button
                            variant="contained"
                            startIcon={<LoginIcon />}
                            onClick={() => { openLogin(); }}
                        >
                            Sign in
                        </Button>
                        <Button variant="outlined" onClick={internalClose}>Cancel</Button>
                    </>
                ) : (
                    <>
                        {activeStep > 0 && (
                            <Button onClick={() => setActiveStep((s) => Math.max(0, s - 1))} disabled={submitting}>
                                Back
                            </Button>
                        )}
                        {activeStep < steps.length - 1 ? (
                            <Button
                                variant="contained"
                                onClick={() => { if (!stepError) setActiveStep((s) => Math.min(steps.length - 1, s + 1)); }}
                                disabled={!canNext}
                                startIcon={<EventIcon />}
                            >
                                Next
                            </Button>
                        ) : (
                            <Button variant="contained" onClick={doSubmit} disabled={!canNext} startIcon={<EventIcon />}>
                                Create Event
                            </Button>
                        )}
                        <Button variant="outlined" onClick={internalClose} disabled={submitting}>
                            Cancel
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
