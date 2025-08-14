// src/components/SidePanel/Business/AddBusinessModal.jsx
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Stepper, Step, StepLabel,
    TextField, Button, Divider, Grid, FormControlLabel, Checkbox,
    MenuItem, InputAdornment, Avatar, IconButton, Alert, Tooltip, Slider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import LinkIcon from '@mui/icons-material/Link';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import PlaceIcon from '@mui/icons-material/Place';
import BusinessIcon from '@mui/icons-material/Business';
import ImageIcon from '@mui/icons-material/Image';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import Cropper from 'react-easy-crop';

// paths from /components/SidePanel/Business
import CityCountySelect from '../../Common/CityCountySelect/CityCountySelect';
import cities from '../../../data/alabamaCities.json';
import counties from '../../../data/alabamaCounties.json';

const NAME_MAX = 250;
const DESC_MAX = 2000;

/* ---------- helpers ---------- */
const stripHtmlToText = (html = '') =>
    (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const isEmail = (s) => /\S+@\S+\.\S+/.test((s || '').trim());
const isPhone = (s) => /^[0-9+()\-.\s]{7,}$/.test((s || '').trim());
const isUrl   = (s) => !s || /^https?:\/\/.+/i.test((s || '').trim());

/** Try Google Maps JS API geocoder first; fall back to backend proxy if available. */
async function geocodeAddress({ street, city, county, state = 'AL', country = 'US' }) {
    // 1) Browser Google Maps JS API
    try {
        const g = window?.google?.maps;
        if (g?.Geocoder) {
            const geocoder = new g.Geocoder();
            const address = [street, city, state].filter(Boolean).join(', ');
            const componentRestrictions = { country };
            return await new Promise((resolve) => {
                geocoder.geocode({ address, componentRestrictions }, (results, status) => {
                    if (status === 'OK' && results?.[0]) {
                        const { lat, lng } = results[0].geometry.location;
                        resolve({ lat: lat(), lng: lng(), formatted: results[0].formatted_address });
                    } else {
                        resolve(null);
                    }
                });
            });
        }
    } catch (_) {}

    // 2) Optional backend proxy
    try {
        const res = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ street, city, state, county, country }),
        });
        if (res.ok) {
            const j = await res.json();
            if (j?.lat && j?.lng) return { lat: Number(j.lat), lng: Number(j.lng), formatted: j.formatted };
        }
    } catch (_) {}

    return null;
}

function centroidFromCityCounty(city, county) {
    if (city) {
        const c = cities.find((x) => x.name === city);
        if (c?.coordinates?.length === 2) return { lat: c.coordinates[0], lng: c.coordinates[1] };
    }
    if (county) {
        const k = counties.find((x) => x.name === county);
        if (k?.coordinates?.length === 2) return { lat: k.coordinates[0], lng: k.coordinates[1] };
    }
    // Alabama center fallback
    return { lat: 32.806671, lng: -86.79113 };
}

/* ---------- form state ---------- */
const initialState = () => ({
    ownerEmail: '',
    useAccountEmail: false,

    name: '',
    category: '',
    phone: '',
    website: '',

    street_address: '',
    city: '',
    county: '',

    logoFile: null,
    coverFile: null,
    logoPreviewUrl: '',
    coverPreviewUrl: '',

    description: '', // HTML from editor
    agreeTerms: false,
});

function reducer(state, { type, value }) {
    switch (type) {
        case 'bulk':   return { ...state, ...value };
        case 'toggle': return { ...state, [value] : !state[value] };
        default:       return { ...state, [type]: value };
    }
}

/* ---------- validation ---------- */
function validateStep(step, s) {
    const errs = {};
    if (step === 0) {
        if (!s.name.trim()) errs.name = 'Business name required';
        if (!s.category) errs.category = 'Choose a category';

        if (!s.ownerEmail.trim()) errs.ownerEmail = 'Email required';
        else if (!isEmail(s.ownerEmail)) errs.ownerEmail = 'Valid email required';

        if (!s.phone.trim()) errs.phone = 'Phone required';
        else if (!isPhone(s.phone)) errs.phone = 'Invalid phone number';
    }
    if (step === 1) {
        // Address is optional, but county is still required
        if (!s.county.trim()) errs.county = 'County required';
        // If they enter a street address, require city (so we can validate correctly)
        if (s.street_address.trim() && !s.city.trim()) errs.city = 'City required when using a street address';
    }
    if (step === 2) {
        if (!stripHtmlToText(s.description)) errs.description = 'Tell people about your business';
        if (s.website && !isUrl(s.website)) errs.website = 'Use full URL (https://...)';
        if (!s.agreeTerms) errs.agreeTerms = 'Please accept the terms to continue';
    }
    return errs;
}

/* ---------- file preview with safe cleanup ---------- */
function useObjectUrl(file) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (!file) { setUrl(''); return; }
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => { URL.revokeObjectURL(u); };
    }, [file]);
    return url;
}

/* ---------- tiny rich-text editor ---------- */
function RichTextEditor({ value, onChange, maxChars = DESC_MAX, placeholder = 'What makes your business special?' }) {
    const ref = useRef(null);
    const [count, setCount] = useState(stripHtmlToText(value).length);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (el.innerHTML !== (value || '')) el.innerHTML = value || '';
        setCount(stripHtmlToText(value).length);
    }, [value]);

    const atLimit = count >= maxChars;

    const handleInput = () => {
        const el = ref.current;
        if (!el) return;
        const textLen = el.innerText.length;
        if (textLen > maxChars) {
            el.innerText = el.innerText.slice(0, maxChars);
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        setCount(Math.min(el.innerText.length, maxChars));
        onChange(el.innerHTML);
    };

    const handleKeyDown = (e) => {
        const allowed = new Set(['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Tab']);
        if (atLimit && !e.ctrlKey && !e.metaKey && !allowed.has(e.key)) {
            if (e.key !== 'Enter') e.preventDefault();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const el = ref.current;
        const cur = el?.innerText.length || 0;
        const remain = Math.max(0, maxChars - cur);
        const text = (e.clipboardData || window.clipboardData).getData('text').slice(0, remain);
        document.execCommand('insertText', false, text);
    };

    const apply = (cmd) => document.execCommand(cmd, false, null);

    return (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <Tooltip title="Bold"><IconButton size="small" onClick={() => apply('bold')}><FormatBoldIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Italic"><IconButton size="small" onClick={() => apply('italic')}><FormatItalicIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Underline"><IconButton size="small" onClick={() => apply('underline')}><FormatUnderlinedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Bulleted list"><IconButton size="small" onClick={() => apply('insertUnorderedList')}><FormatListBulletedIcon fontSize="small" /></IconButton></Tooltip>
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" color={atLimit ? 'error.main' : 'text.secondary'}>{count}/{maxChars}</Typography>
            </Box>

            <Box
                ref={ref}
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                sx={{
                    minHeight: 140,
                    p: 1.25,
                    outline: 'none',
                    '&:empty:before': { content: `"${placeholder}"`, color: 'text.disabled' }
                }}
            />
        </Box>
    );
}

/* ---------- image editing helpers + dialog ---------- */
async function createImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function getCroppedBlob(imageSrc, cropPixels, shape = 'rect', mime = 'image/jpeg') {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width  = Math.max(1, Math.round(cropPixels.width));
    canvas.height = Math.max(1, Math.round(cropPixels.height));

    ctx.drawImage(
        image,
        cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
        0, 0, canvas.width, canvas.height
    );

    // mask to round for logos
    if (shape === 'round') {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        mime = 'image/png';
    }

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mime, 0.92);
    });
}

function ImageEditorDialog({
                               open,
                               src,
                               title = 'Adjust Image',
                               aspect = 1,
                               shape = 'rect',
                               suggestedWidth,
                               onCancel,
                               onApply,
                           }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1.2);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const onCropComplete = useCallback((_a, areaPixels) => setCroppedAreaPixels(areaPixels), []);

    const handleApply = async () => {
        if (!croppedAreaPixels) return;
        let blob = await getCroppedBlob(src, croppedAreaPixels, shape);
        if (blob && suggestedWidth) {
            const tmpUrl = URL.createObjectURL(blob);
            const img = await createImage(tmpUrl);
            URL.revokeObjectURL(tmpUrl);
            if (img.width > suggestedWidth) {
                const scale = suggestedWidth / img.width;
                const c = document.createElement('canvas');
                c.width = suggestedWidth;
                c.height = Math.round(img.height * scale);
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, c.width, c.height);
                blob = await new Promise((r) => c.toBlob(r, blob.type, 0.92));
            }
        }
        onApply?.(blob);
    };

    return (
        <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent sx={{ position: 'relative', height: 360, p: 0 }}>
                <Cropper
                    image={src}
                    crop={crop}
                    zoom={zoom}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    aspect={aspect}
                    cropShape={shape}
                    showGrid={false}
                    restrictPosition={false}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Box sx={{ mr: 'auto', minWidth: 180 }}>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Zoom</Typography>
                    <Slider value={zoom} min={1} max={3} step={0.01} onChange={(_, v) => setZoom(v)} />
                </Box>
                <Button onClick={onCancel}>Cancel</Button>
                <Button variant="contained" onClick={handleApply}>Apply</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ---------- modal ---------- */
export default function AddBusinessModal({
                                             open,
                                             onClose,
                                             onSubmitted,
                                             user,
                                             categories = [],
                                         }) {
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');

    const [state, dispatch] = useReducer(reducer, undefined, initialState);
    const logoPreview  = useObjectUrl(state.logoFile);
    const coverPreview = useObjectUrl(state.coverFile);

    const logoInputRef  = useRef(null);
    const coverInputRef = useRef(null);

    // image editor state
    const [editor, setEditor] = useState({ open: false, type: null, src: '', aspect: 1, shape: 'rect', suggestedWidth: undefined });

    // Abort any in-flight requests on unmount to avoid destroy-function errors
    const abortRef = useRef(null);
    useEffect(() => () => { abortRef.current?.abort(); }, []);

    // reset when opened
    useEffect(() => {
        if (open) {
            dispatch({ type: 'bulk', value: initialState() });
            setStep(0);
            setErrors({});
            setSubmitError('');
        }
    }, [open]);

    useEffect(() => {
        if (state.useAccountEmail && user?.email) {
            dispatch({ type: 'ownerEmail', value: user.email });
        }
    }, [state.useAccountEmail, user]);

    useEffect(() => { setErrors({}); setSubmitError(''); }, [step]);

    const openEditor = (type, file) => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        setEditor({
            open: true,
            type,
            src: url,
            // Wider cover ratio ≈3:1 so crop matches card presentation
            aspect: type === 'logo' ? 1 : 3,
            shape: type === 'logo' ? 'round' : 'rect',
            suggestedWidth: type === 'logo' ? 512 : 2400,
        });
    };

    // revoke editor src on close/update
    useEffect(() => {
        return () => { if (editor.src) URL.revokeObjectURL(editor.src); };
    }, [editor.src]);

    const handleEditorCancel = () => {
        if (editor.src) URL.revokeObjectURL(editor.src);
        setEditor({ open: false, type: null, src: '', aspect: 1, shape: 'rect' });
    };

    const handleEditorApply = async (blob) => {
        if (!blob) return handleEditorCancel();
        const fileName = editor.type === 'logo' ? 'logo.png' : 'cover.jpg';
        const file = new File([blob], fileName, { type: blob.type || (editor.type === 'logo' ? 'image/png' : 'image/jpeg') });
        if (editor.type === 'logo') {
            dispatch({ type: 'logoFile', value: file });
        } else {
            dispatch({ type: 'coverFile', value: file });
        }
        handleEditorCancel();
    };

    const handleBack = () => setStep((s) => Math.max(0, s - 1));

    // choose file → open editor
    const handlePick = (kind) => (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        openEditor(kind, f);
    };

    useEffect(() => {
        if (logoPreview)  dispatch({ type: 'logoPreviewUrl',  value: logoPreview });
        if (coverPreview) dispatch({ type: 'coverPreviewUrl', value: coverPreview });
    }, [logoPreview, coverPreview]);

    const clearLogo = () => {
        dispatch({ type: 'logoFile', value: null });
        dispatch({ type: 'logoPreviewUrl', value: '' });
        if (logoInputRef.current) logoInputRef.current.value = '';
    };
    const clearCover = () => {
        dispatch({ type: 'coverFile', value: null });
        dispatch({ type: 'coverPreviewUrl', value: '' });
        if (coverInputRef.current) coverInputRef.current.value = '';
    };

    // ----- uploads via signed URLs -----
    async function uploadToGCS(file, kind) {
        const body = {
            folder: kind === 'logo' ? 'logo_photos' : 'cover_photos',
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
        };
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        const sig = await fetch('/api/uploads/signed-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: abortRef.current.signal,
        });
        if (!sig.ok) throw new Error('Could not get signed URL');
        const { uploadUrl, publicUrl } = await sig.json();

        const put = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': body.contentType },
            body: file,
            signal: abortRef.current.signal,
        });
        if (!put.ok) throw new Error('Upload failed');
        return publicUrl;
    }

    // Validate step (with async address check on Step 1 if needed)
    const handleNext = async () => {
        const errs = validateStep(step, state);
        setErrors(errs);
        if (Object.keys(errs).length) return;

        // If leaving the Location step and an address is present, validate it now
        if (step === 1 && state.street_address.trim()) {
            const geo = await geocodeAddress({
                street: state.street_address.trim(),
                city: state.city.trim(),
                county: state.county.trim(),
            });
            if (!geo) {
                setErrors((e) => ({ ...e, street_address: 'Address not found. Please check the city/county and address.' }));
                return;
            }
        }

        setStep((s) => s + 1);
    };

    const handleSubmit = async () => {
        const errs = validateStep(2, state);
        setErrors(errs);
        setSubmitError('');
        if (Object.keys(errs).length) return;

        try {
            setSubmitting(true);

            // 0) Resolve coordinates
            let coords;
            if (state.street_address.trim()) {
                const geo = await geocodeAddress({
                    street: state.street_address.trim(),
                    city: state.city.trim(),
                    county: state.county.trim(),
                });
                if (!geo) {
                    setSubmitting(false);
                    setErrors((e) => ({ ...e, street_address: 'Address not found. Please correct it or clear the address.' }));
                    return;
                }
                coords = { lat: geo.lat, lng: geo.lng };
            } else {
                coords = centroidFromCityCounty(state.city.trim(), state.county.trim());
            }

            // 1) upload images if present
            let logoUrl = null;
            let coverUrl = null;
            if (state.logoFile)  logoUrl  = await uploadToGCS(state.logoFile,  'logo');
            if (state.coverFile) coverUrl = await uploadToGCS(state.coverFile, 'cover');

            // 2) create business
            const payload = {
                name: state.name.trim(),
                category: state.category,
                contact_email: state.ownerEmail.trim(),
                phone: state.phone.trim(),
                website: state.website.trim(),
                street_address: state.street_address.trim() || null,
                city: state.city.trim() || null,
                county: state.county.trim() || null,
                latitude: coords.lat,
                longitude: coords.lng,
                description: state.description.trim(), // HTML
                logo_url: logoUrl,
                cover_url: coverUrl,
            };

            abortRef.current?.abort();
            abortRef.current = new AbortController();

            const res = await fetch('/api/businesses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: abortRef.current.signal,
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to create business');

            setSubmitting(false);
            onSubmitted?.(json.business || payload);
            onClose?.();
        } catch (e) {
            console.error(e);
            setSubmitting(false);
            setSubmitError(e.message || 'Could not submit business.');
        }
    };

    const StepHeader = ({ title, subtitle, icon }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>{icon}</Avatar>
            <Box>
                <Typography variant="h6">{title}</Typography>
                {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
            </Box>
        </Box>
    );

    // Prevent close on backdrop click, allow close button / Esc
    const handleDialogClose = (event, reason) => {
        if (reason === 'backdropClick') return;
        onClose?.();
    };

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            fullWidth
            maxWidth="md"
            aria-labelledby="add-business-title"
            scroll="paper"
        >
            <DialogTitle id="add-business-title" sx={{ pr: 6 }}>
                Add a Business
                <IconButton
                    onClick={() => onClose?.()}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                    aria-label="close"
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                <Alert severity="info" icon={false} sx={{ borderRadius: 0 }}>
                    Submissions appear as <strong>pending</strong> until reviewed. Verified listings display a check badge.
                </Alert>

                <Box sx={{ px: 3, py: 2 }}>
                    <Stepper activeStep={step} alternativeLabel>
                        {['Basics', 'Location', 'Branding & Details'].map((label) => (
                            <Step key={label}><StepLabel>{label}</StepLabel></Step>
                        ))}
                    </Stepper>
                </Box>

                <Divider />

                <Box sx={{ px: 3, py: 3 }}>
                    {step === 0 && (
                        <>
                            <StepHeader
                                title="Business Basics"
                                subtitle="How people will see and contact your business."
                                icon={<BusinessIcon />}
                            />

                            {/* Row 1: Business Name (flex) + Category (fixed width) */}
                            <Grid container spacing={2} alignItems="flex-start">
                                <Grid item xs={12} md sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <TextField
                                        fullWidth
                                        required
                                        label="Business Name"
                                        value={state.name}
                                        onChange={(e) => dispatch({ type: 'name', value: e.target.value.slice(0, NAME_MAX) })}
                                        error={!!errors.name}
                                        helperText={errors.name || ''}
                                        inputProps={{ maxLength: NAME_MAX }}
                                    />
                                </Grid>
                                <Grid item xs={12} md="auto">
                                    <Box sx={{ width: { xs: '100%', md: 280 } }}>
                                        <TextField
                                            select
                                            fullWidth
                                            required
                                            label="Category"
                                            value={state.category}
                                            onChange={(e) => dispatch({ type: 'category', value: e.target.value })}
                                            error={!!errors.category}
                                            helperText={errors.category || ''}
                                        >
                                            <MenuItem value="">Select a category</MenuItem>
                                            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                        </TextField>
                                    </Box>
                                </Grid>
                            </Grid>

                            {/* Row 2: Email + Phone */}
                            <Grid container spacing={2} sx={{ mt: 2 }} alignItems="flex-start">
                                <Grid item xs={12} md="auto">
                                    {user ? (
                                        <FormControlLabel
                                            sx={{ mb: 0.5 }}
                                            control={
                                                <Checkbox
                                                    checked={!!state.useAccountEmail}
                                                    onChange={() => dispatch({ type: 'toggle', value: 'useAccountEmail' })}
                                                />
                                            }
                                            label={user?.email ? `Use my account email (${user.email})` : 'Use my account email'}
                                        />
                                    ) : null}
                                    <Box sx={{ width: { xs: '100%', md: 320 } }}>
                                        <TextField
                                            required
                                            label="Owner Email"
                                            value={state.ownerEmail}
                                            onChange={(e) => dispatch({ type: 'ownerEmail', value: e.target.value })}
                                            error={!!errors.ownerEmail}
                                            helperText={errors.ownerEmail || 'We will send a verification link to this email.'}
                                            disabled={!!state.useAccountEmail && !!user?.email}
                                        />
                                    </Box>
                                </Grid>

                                <Grid item xs={12} md="auto">
                                    <Box sx={{ width: { xs: '100%', md: 220 } }}>
                                        <TextField
                                            fullWidth
                                            required
                                            label="Phone"
                                            value={state.phone}
                                            onChange={(e) => dispatch({ type: 'phone', value: e.target.value })}
                                            error={!!errors.phone}
                                            helperText={errors.phone || ''}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <PhoneIphoneIcon />
                                                    </InputAdornment>
                                                )
                                            }}
                                        />
                                    </Box>
                                </Grid>
                            </Grid>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <StepHeader
                                title="Location"
                                subtitle="Where customers can find you."
                                icon={<PlaceIcon />}
                            />

                            {/* City + County */}
                            <CityCountySelect
                                city={state.city}
                                setCity={(val) => dispatch({ type: 'city', value: val })}
                                county={state.county}
                                setCounty={(val) => dispatch({ type: 'county', value: val })}
                                cityError={errors.city || ''}
                                countyError={errors.county || ''}
                            />

                            {/* Street Address — OPTIONAL now */}
                            <Box sx={{ mt: 2 }}>
                                <TextField
                                    fullWidth
                                    label="Street Address (Optional)"
                                    value={state.street_address}
                                    onChange={(e) => dispatch({ type: 'street_address', value: e.target.value })}
                                    error={!!errors.street_address}
                                    helperText={errors.street_address || 'Enter only if you want a precise pin at your door.'}
                                    sx={{ width: '100%', minWidth: 0 }}
                                />
                            </Box>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <StepHeader
                                title="Branding & Details"
                                subtitle="Upload a logo and cover image, then add details."
                                icon={<UploadFileIcon />}
                            />

                            {/* Branding Card */}
                            <Box sx={{
                                border: 1, borderColor: 'divider', borderRadius: 2,
                                p: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                            }}>
                                {/* Cover — compact */}
                                <input
                                    ref={coverInputRef}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={handlePick('cover')}
                                />
                                <Box
                                    onClick={() => coverInputRef.current?.click()}
                                    sx={{
                                        position: 'relative',
                                        border: '1px dashed',
                                        borderColor: coverPreview ? 'divider' : 'action.disabled',
                                        bgcolor: coverPreview ? 'transparent' : 'action.hover',
                                        borderRadius: 2,
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        width: '100%',
                                        height: { xs: 160, sm: 180, md: 200 },
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        mb: 2,
                                    }}
                                >
                                    {coverPreview ? (
                                        <>
                                            <Box
                                                component="img"
                                                src={coverPreview}
                                                alt="Cover preview"
                                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            <IconButton
                                                size="small"
                                                onClick={(e) => { e.stopPropagation(); clearCover(); }}
                                                sx={{
                                                    position: 'absolute', top: 8, right: 8,
                                                    bgcolor: 'rgba(0,0,0,0.6)', color: '#fff',
                                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
                                                }}
                                                aria-label="Remove cover"
                                            >
                                                <CloseRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </>
                                    ) : (
                                        <Box sx={{ textAlign: 'center', p: 2 }}>
                                            <ImageIcon sx={{ fontSize: 42, mb: 1, color: 'text.disabled' }} />
                                            <Typography variant="body2" color="text.secondary">
                                                Upload a cover photo
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>

                                {/* Logo + Name + Website */}
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs="auto">
                                        <input
                                            ref={logoInputRef}
                                            type="file"
                                            accept="image/*"
                                            hidden
                                            onChange={handlePick('logo')}
                                        />
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <Box
                                                onClick={() => logoInputRef.current?.click()}
                                                sx={{
                                                    position: 'relative',
                                                    width: 96, height: 96,
                                                    borderRadius: '50%',
                                                    border: '1px dashed',
                                                    borderColor: logoPreview ? 'transparent' : 'action.disabled',
                                                    bgcolor: logoPreview ? 'transparent' : 'action.hover',
                                                    cursor: 'pointer',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                {logoPreview ? (
                                                    <>
                                                        <Box
                                                            component="img"
                                                            src={logoPreview}
                                                            alt="Logo preview"
                                                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); clearLogo(); }}
                                                            sx={{
                                                                position: 'absolute', top: 6, right: 6,
                                                                bgcolor: 'rgba(0,0,0,0.6)', color: '#fff',
                                                                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
                                                            }}
                                                            aria-label="Remove logo"
                                                        >
                                                            <CloseRoundedIcon fontSize="small" />
                                                        </IconButton>
                                                    </>
                                                ) : (
                                                    <ImageIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
                                                )}
                                            </Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                                                Upload a logo
                                            </Typography>
                                        </Box>
                                    </Grid>

                                    <Grid item xs>
                                        <Typography variant="h6" sx={{ mb: 1 }}>
                                            {state.name || 'Business Name'}
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            label="Website"
                                            value={state.website}
                                            onChange={(e) => dispatch({ type: 'website', value: e.target.value })}
                                            error={!!errors.website}
                                            helperText={errors.website || 'Use full URL, e.g., https://example.com'}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <LinkIcon />
                                                    </InputAdornment>
                                                )
                                            }}
                                        />
                                    </Grid>
                                </Grid>

                                {/* Description editor */}
                                <Box sx={{ mt: 2 }}>
                                    <RichTextEditor
                                        value={state.description}
                                        onChange={(html) => dispatch({ type: 'description', value: html })}
                                        maxChars={DESC_MAX}
                                        placeholder="What makes your business special?"
                                    />
                                    {errors.description && (
                                        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                                            {errors.description}
                                        </Typography>
                                    )}
                                    {submitError && (
                                        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                                            {submitError}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>

                            {/* Terms */}
                            <Box sx={{ mt: 2 }}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={state.agreeTerms}
                                            onChange={() => dispatch({ type: 'toggle', value: 'agreeTerms' })}
                                        />
                                    }
                                    label="I confirm this business information is accurate and I am authorized to submit it."
                                />
                                {errors.agreeTerms && (
                                    <Typography variant="caption" color="error">{errors.agreeTerms}</Typography>
                                )}
                            </Box>
                        </>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Box sx={{ flex: 1, color: 'text.secondary' }}>
                    <Typography variant="caption">
                        By submitting, you agree to our community guidelines. Listings are reviewed for accuracy and quality.
                    </Typography>
                </Box>
                {step > 0 && (
                    <Button onClick={handleBack} disabled={submitting}>
                        Back
                    </Button>
                )}
                {step < 2 ? (
                    <Button variant="contained" onClick={handleNext} disabled={submitting}>
                        Next
                    </Button>
                ) : (
                    <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Submitting…' : 'Submit for Review'}
                    </Button>
                )}
            </DialogActions>

            {/* Crop/resize dialog */}
            {editor.open && (
                <ImageEditorDialog
                    open={editor.open}
                    src={editor.src}
                    title={editor.type === 'logo' ? 'Adjust Logo' : 'Adjust Cover Photo'}
                    aspect={editor.aspect}
                    shape={editor.shape}
                    suggestedWidth={editor.suggestedWidth}
                    onCancel={handleEditorCancel}
                    onApply={handleEditorApply}
                />
            )}
        </Dialog>
    );
}
