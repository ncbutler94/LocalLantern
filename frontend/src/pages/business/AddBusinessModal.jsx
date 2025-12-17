// NOTE: This file extends your previous modal with a media gallery uploader.
// It keeps your sizing/cropping for logo/cover and adds:
//   • MP4/WEBM/OGG video picker
//   • Up to 10 photos + 1 video
//   • Drag‑reorder, hover‑delete, per‑photo caption
//   • Uploads to GCS (folder: additional_media) then POSTs to /api/businesses/:id/media

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useReducer,
    useRef,
    useState,
} from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Stepper, Step, StepLabel, TextField,
    Button, Divider, Grid, FormControlLabel, Checkbox,
    MenuItem, InputAdornment, Avatar, IconButton, Alert,
    Tooltip, Slider
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
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Cropper from 'react-easy-crop';

import CityCountySelect from '../../components/CityCountySelect';
import { getSignedUrl, addBusinessMedia, createBusiness } from '../../api/business/businesses';
import cities from '../../data/alabamaCities.json';
import counties from '../../data/alabamaCounties.json';

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const PHONE_MAX = 25;
const WEBSITE_MAX = 200;
const ADDRESS_MAX = 120;
const DESC_MAX = 220;       // short card text
const LONG_MAX = 5000;      // long “About” text

const CARD_ASPECT = 16 / 9;
const COVER_MAX_WIDTH = 560;

const stripHtmlToText = (html = '') =>
    (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const isEmail = (s) => /\S+@\S+\.\S+/.test((s || '').trim());
const isPhone = (s) => /^[0-9+()\-.\s]{7,}$/.test((s || '').trim());
const isUrl = (s) => {
    const v = (s || '').trim();
    if (!v) return true;
    const re = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i;
    return re.test(v);
};

async function geocodeAddress({ street, city, county, state = 'AL', country = 'US' }) {
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
    return { lat: 32.806671, lng: -86.79113 };
}

/* ---------- state ---------- */
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

    description: '',           // short HTML (card)
    longDescription: '',       // long rich text "About"
    agreeTerms: false,

    // media uploader
    media: [],                 // [{ id, file, preview, type: 'photo'|'video', caption, sort }]
});

function reducer(state, { type, value }) {
    switch (type) {
        case 'bulk': return { ...state, ...value };
        case 'toggle': return { ...state, [value]: !state[value] };
        default: return { ...state, [type]: value };
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
        if (!s.county.trim()) errs.county = 'County required';
        if (s.street_address.trim() && !s.city.trim())
            errs.city = 'City required when using a street address';
    }
    if (step === 2) {
        if (!stripHtmlToText(s.description)) errs.description = 'Short description required';
        if (s.website && !isUrl(s.website)) errs.website = 'Enter a valid website';
        if (stripHtmlToText(s.longDescription).length > LONG_MAX) errs.longDescription = 'Too long';
        if (!s.agreeTerms) errs.agreeTerms = 'Please accept the terms';
        // media constraints
        const photos = s.media.filter(m => m.type === 'photo').length;
        const videos = s.media.filter(m => m.type === 'video').length;
        if (photos > 10) errs.media = 'Maximum 10 photos';
        if (videos > 1) errs.media = 'Maximum 1 video';
    }
    return errs;
}

/* ---------- object URL hook ---------- */
function useObjectUrl(file) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (!file) { setUrl(''); return; }
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [file]);
    return url;
}

/* ---------- tiny rich text (for short) ---------- */
function RichTextEditor({ value, onChange, maxChars = DESC_MAX, placeholder }) {
    const ref = useRef(null);
    const [count, setCount] = useState(stripHtmlToText(value).length);
    const squelchRef = useRef(false);
    const composingRef = useRef(false);
    const lastHtmlRef = useRef(value || '');
    const rafRef = useRef(0);

    useLayoutEffect(() => {
        const el = ref.current; if (!el) return;
        const html = value || '';
        if (html !== lastHtmlRef.current) {
            squelchRef.current = true;
            el.innerHTML = html;
            lastHtmlRef.current = html;
            setCount(stripHtmlToText(html).length);
            requestAnimationFrame(() => (squelchRef.current = false));
        } else {
            setCount(stripHtmlToText(html).length);
        }
    }, [value]);

    const atLimit = count >= maxChars;

    const handleInput = () => {
        if (squelchRef.current || composingRef.current) return;
        const el = ref.current; if (!el) return;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            let txt = el.innerText || '';
            if (txt.length > maxChars) {
                squelchRef.current = true;
                el.innerText = txt.slice(0, maxChars);
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el); range.collapse(false);
                sel.removeAllRanges(); sel.addRange(range);
                squelchRef.current = false;
                txt = el.innerText || '';
            }
            const html = el.innerHTML;
            const nextCount = Math.min(txt.length, maxChars);
            setCount(nextCount);
            if (html !== lastHtmlRef.current) {
                lastHtmlRef.current = html;
                onChange(html);
            }
        });
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
                <Typography variant="caption" color={count >= maxChars ? 'error.main' : 'text.secondary'}>
                    {count}/{maxChars}
                </Typography>
            </Box>
            <Box
                ref={ref}
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onCompositionStart={() => (composingRef.current = true)}
                onCompositionEnd={() => { composingRef.current = false; handleInput(); }}
                sx={{ minHeight: 100, p: 1.25, outline: 'none', '&:empty:before': { content: `"${placeholder}"`, color: 'text.disabled' } }}
            />
        </Box>
    );
}

/* ---------- cropper helpers ---------- */
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
    canvas.width = Math.max(1, Math.round(cropPixels.width));
    canvas.height = Math.max(1, Math.round(cropPixels.height));
    ctx.drawImage(image, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, canvas.width, canvas.height);
    if (shape === 'round') {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height)/2, 0, Math.PI*2);
        ctx.closePath(); ctx.fill(); mime = 'image/png';
    }
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, 0.92));
}

function ImageEditorDialog({ open, src, title = 'Adjust Image', aspect = 1, shape = 'rect', suggestedWidth, onCancel, onApply }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
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
                c.width = suggestedWidth; c.height = Math.round(img.height * scale);
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
            <DialogContent sx={{ position: 'relative', height: { xs: 380, sm: 420 }, p: 0 }}>
                <Cropper
                    image={src}
                    crop={crop} zoom={zoom}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    aspect={aspect} cropShape={shape} showGrid={false}
                    restrictPosition={false} zoomWithScroll
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, alignItems: 'center' }}>
                <Box sx={{ mr: 'auto', minWidth: { xs: 160, sm: 200 } }}>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Zoom</Typography>
                    <Slider value={zoom} min={1} max={3} step={0.01} onChange={(_, v) => setZoom(v)} />
                </Box>
                <Button onClick={onCancel}>Cancel</Button>
                <Button variant="contained" onClick={handleApply}>Apply</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ---------- media uploader helpers ---------- */
const thumbStyle = {
    width: 160, height: 120, borderRadius: 8, objectFit: 'cover', display: 'block'
};

export default function AddBusinessModal({ open, onClose, onSubmitted, user, categories = [] }) {
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');

    const [state, dispatch] = useReducer(reducer, undefined, initialState);
    const logoPreview = useObjectUrl(state.logoFile);
    const coverPreview = useObjectUrl(state.coverFile);

    const logoInputRef = useRef(null);
    const coverInputRef = useRef(null);
    const photoInputRef = useRef(null);
    const videoInputRef = useRef(null);

    const [editor, setEditor] = useState({ open: false, type: null, src: '', aspect: 1, shape: 'rect', suggestedWidth: undefined });

    const abortRef = useRef(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        if (open) {
            dispatch({ type: 'bulk', value: initialState() });
            setStep(0); setErrors({}); setSubmitError('');
        }
    }, [open]);

    useEffect(() => {
        if (state.useAccountEmail && user?.email && state.ownerEmail !== user.email) {
            dispatch({ type: 'ownerEmail', value: user.email });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.useAccountEmail, user?.email, state.ownerEmail]);

    useEffect(() => { setErrors({}); setSubmitError(''); }, [step]);

    const openEditor = (type, file) => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        setEditor({ open: true, type, src: url, aspect: type === 'logo' ? 1 : CARD_ASPECT, shape: type === 'logo' ? 'round' : 'rect', suggestedWidth: type === 'logo' ? 512 : 2400 });
    };
    useEffect(() => () => { if (editor.src) URL.revokeObjectURL(editor.src); }, [editor.src]);
    const handleEditorCancel = () => {
        if (editor.src) URL.revokeObjectURL(editor.src);
        setEditor({ open: false, type: null, src: '', aspect: 1, shape: 'rect' });
    };
    const handleEditorApply = async (blob) => {
        if (!blob) return handleEditorCancel();
        const fileName = editor.type === 'logo' ? 'logo.png' : 'cover.jpg';
        const file = new File([blob], fileName, { type: blob.type || (editor.type === 'logo' ? 'image/png' : 'image/jpeg') });
        if (editor.type === 'logo') dispatch({ type: 'logoFile', value: file });
        else dispatch({ type: 'coverFile', value: file });
        handleEditorCancel();
    };

    const handlePick = (kind) => (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        openEditor(kind, f);
    };
    useEffect(() => {
        if (logoPreview) dispatch({ type: 'logoPreviewUrl', value: logoPreview });
        if (coverPreview) dispatch({ type: 'coverPreviewUrl', value: coverPreview });
    }, [logoPreview, coverPreview]);
    const clearLogo = () => { dispatch({ type: 'logoFile', value: null }); dispatch({ type: 'logoPreviewUrl', value: '' }); if (logoInputRef.current) logoInputRef.current.value = ''; };
    const clearCover = () => { dispatch({ type: 'coverFile', value: null }); dispatch({ type: 'coverPreviewUrl', value: '' }); if (coverInputRef.current) coverInputRef.current.value = ''; };

    // add photo(s)
    const handleAddPhotos = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        dispatch({
            type: 'media',
            value: [
                ...state.media,
                ...files.map((file, i) => ({
                    id: `tmp_${Date.now()}_${i}`,
                    file,
                    preview: URL.createObjectURL(file),
                    type: 'photo',
                    caption: '',
                    sort: state.media.length + i,
                })),
            ],
        });
        e.target.value = '';
    };

    // add video (single)
    const handleAddVideo = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // ensure only one video
        if (state.media.some((m) => m.type === 'video')) {
            setErrors((err) => ({ ...err, media: 'Only one video is allowed' }));
            e.target.value = '';
            return;
        }
        dispatch({
            type: 'media',
            value: [
                ...state.media,
                {
                    id: `tmp_${Date.now()}_v`,
                    file,
                    preview: URL.createObjectURL(file),
                    type: 'video',
                    caption: '',
                    sort: state.media.length,
                },
            ],
        });
        e.target.value = '';
    };

    // cleanup object URLs when media list changes/unmounts
    const prevMediaRef = useRef([]);
    useEffect(() => {
        const prev = prevMediaRef.current;
        const removed = prev.filter(p => !state.media.some(n => n.id === p.id));
        removed.forEach(r => r.preview && URL.revokeObjectURL(r.preview));
        prevMediaRef.current = state.media;
        return () => {
            prevMediaRef.current.forEach((m) => m.preview && URL.revokeObjectURL(m.preview));
        };
    }, [state.media]);

    // reorder
    const [dragId, setDragId] = useState(null);
    const onDragStart = (id) => setDragId(id);
    const onDragOver = (e, overId) => { e.preventDefault(); if (dragId === overId) return; };
    const onDrop = (overId) => {
        if (!dragId || dragId === overId) return;
        const items = [...state.media];
        const from = items.findIndex(i => i.id === dragId);
        const to = items.findIndex(i => i.id === overId);
        if (from < 0 || to < 0) return;
        const [m] = items.splice(from, 1);
        items.splice(to, 0, m);
        items.forEach((it, idx) => (it.sort = idx));
        dispatch({ type: 'media', value: items });
        setDragId(null);
    };

    // uploads via signed URL
    async function uploadToGCS(file, folder) {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const sig = await getSignedUrl({ folder, fileName: file.name, contentType: file.type || 'application/octet-stream' });
        const put = await fetch(sig.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
            signal: abortRef.current.signal,
        });
        if (!put.ok) throw new Error('Upload failed');
        return sig.publicUrl;
    }

    // step next (validate and (if street entered) geocode)
    const handleNext = async () => {
        const errs = validateStep(step, state);
        setErrors(errs); if (Object.keys(errs).length) return;

        if (step === 1 && state.street_address.trim()) {
            const geo = await geocodeAddress({
                street: state.street_address.trim(),
                city: state.city.trim(),
                county: state.county.trim(),
            });
            if (!geo) {
                setErrors((e) => ({ ...e, street_address: 'Address not found. Please check it.' }));
                return;
            }
        }
        setStep((s) => s + 1);
    };

    const handleSubmit = async () => {
        const errs = validateStep(2, state);
        setErrors(errs); setSubmitError(''); if (Object.keys(errs).length) return;

        try {
            setSubmitting(true);

            // Resolve coordinates
            let coords;
            if (state.street_address.trim()) {
                const geo = await geocodeAddress({
                    street: state.street_address.trim(),
                    city: state.city.trim(),
                    county: state.county.trim(),
                });
                if (!geo) {
                    setSubmitting(false);
                    setErrors((e) => ({ ...e, street_address: 'Address not found. Correct it or clear the address.' }));
                    return;
                }
                coords = { lat: geo.lat, lng: geo.lng };
            } else {
                coords = centroidFromCityCounty(state.city.trim(), state.county.trim());
            }

            // upload logo/cover if present
            let logoUrl = null, coverUrl = null;
            if (state.logoFile) logoUrl = await uploadToGCS(state.logoFile, 'logo_photos');
            if (state.coverFile) coverUrl = await uploadToGCS(state.coverFile, 'cover_photos');

            // create business
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
                description: state.description.trim(),
                long_description: stripHtmlToText(state.longDescription) ? state.longDescription : null,
                logo_url: logoUrl,
                cover_url: coverUrl,
            };

            const business = await createBusiness(payload);

            // upload media (limit 10 photos + 1 video already validated)
            for (const m of state.media) {
                const url = await uploadToGCS(m.file, 'additional_media');
                await addBusinessMedia(business.id, { type: m.type, url, caption: m.caption, sort_order: m.sort });
            }

            setSubmitting(false);
            onSubmitted?.(business);
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

    const handleDialogClose = (event, reason) => {
        if (reason === 'backdropClick') return;
        onClose?.();
    };

    // UI
    return (
        <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="md" aria-labelledby="add-business-title" scroll="paper">
            <DialogTitle id="add-business-title" sx={{ pr: 6 }}>
                Add a Business
                <IconButton onClick={() => onClose?.()} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="close">
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
                    {/* STEP 0 */}
                    {step === 0 && (
                        <>
                            <StepHeader title="Business Basics" subtitle="How people will see and contact your business." icon={<BusinessIcon />} />

                            <Grid container spacing={2} alignItems="flex-start">
                                <Grid item xs={12} md sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <TextField fullWidth required label="Business Name"
                                               value={state.name}
                                               onChange={(e) => dispatch({ type: 'name', value: e.target.value.slice(0, NAME_MAX) })}
                                               error={!!errors.name} helperText={errors.name || ''} inputProps={{ maxLength: NAME_MAX }} />
                                </Grid>
                                <Grid item xs={12} md="auto">
                                    <Box sx={{ width: { xs: '100%', md: 280 } }}>
                                        <TextField select fullWidth required label="Category" value={state.category}
                                                   onChange={(e) => dispatch({ type: 'category', value: e.target.value })}
                                                   error={!!errors.category} helperText={errors.category || ''}>
                                            <MenuItem value="">Select a category</MenuItem>
                                            {categories.map((c) => (<MenuItem key={c} value={c}>{c}</MenuItem>))}
                                        </TextField>
                                    </Box>
                                </Grid>
                            </Grid>

                            <Grid container spacing={2} sx={{ mt: 2 }} alignItems="flex-start">
                                <Grid item xs={12} md="auto">
                                    {user ? (
                                        <FormControlLabel sx={{ mb: 0.5 }}
                                                          control={<Checkbox checked={!!state.useAccountEmail} onChange={() => dispatch({ type: 'toggle', value: 'useAccountEmail' })} />}
                                                          label={user?.email ? `Use my account email (${user.email})` : 'Use my account email'} />
                                    ) : null}
                                    <Box sx={{ width: { xs: '100%', md: 320 } }}>
                                        <TextField required label="Owner Email" value={state.ownerEmail}
                                                   onChange={(e) => dispatch({ type: 'ownerEmail', value: e.target.value.slice(0, EMAIL_MAX) })}
                                                   error={!!errors.ownerEmail}
                                                   helperText={errors.ownerEmail || 'We will send a verification link to this email.'}
                                                   disabled={!!state.useAccountEmail && !!user?.email} inputProps={{ maxLength: EMAIL_MAX }} />
                                    </Box>
                                </Grid>

                                <Grid item xs={12} md="auto">
                                    <Box sx={{ width: { xs: '100%', md: 220 } }}>
                                        <TextField fullWidth required label="Phone" value={state.phone}
                                                   onChange={(e) => dispatch({ type: 'phone', value: e.target.value.slice(0, PHONE_MAX) })}
                                                   error={!!errors.phone} helperText={errors.phone || ''}
                                                   inputProps={{ maxLength: PHONE_MAX }}
                                                   InputProps={{ startAdornment: (<InputAdornment position="start"><PhoneIphoneIcon /></InputAdornment>) }} />
                                    </Box>
                                </Grid>
                            </Grid>
                        </>
                    )}

                    {/* STEP 1 */}
                    {step === 1 && (
                        <>
                            <StepHeader title="Location" subtitle="Where customers can find you." icon={<PlaceIcon />} />
                            <CityCountySelect
                                city={state.city} setCity={(val) => dispatch({ type: 'city', value: val })}
                                county={state.county} setCounty={(val) => dispatch({ type: 'county', value: val })}
                                cityError={errors.city || ''} countyError={errors.county || ''} />
                            <Box sx={{ mt: 2 }}>
                                <TextField fullWidth label="Street Address (Optional)" value={state.street_address}
                                           onChange={(e) => dispatch({ type: 'street_address', value: e.target.value.slice(0, ADDRESS_MAX) })}
                                           error={!!errors.street_address} helperText={errors.street_address || 'Enter only if you want a precise pin at your door.'}
                                           inputProps={{ maxLength: ADDRESS_MAX }} sx={{ width: '100%', minWidth: 0 }} />
                            </Box>
                        </>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <>
                            <StepHeader title="Branding & Details" subtitle="Upload a logo and cover image (both optional), add your descriptions, and attach media." icon={<UploadFileIcon />} />

                            {/* Branding card */}
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                {/* COVER */}
                                <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handlePick('cover')} />
                                <Box onClick={() => coverInputRef.current?.click()}
                                     sx={{
                                         position: 'relative', border: '1px dashed', borderColor: coverPreview ? 'divider' : 'action.disabled',
                                         bgcolor: coverPreview ? 'transparent' : 'action.hover', borderRadius: 2, cursor: 'pointer', overflow: 'hidden',
                                         width: '100%', maxWidth: COVER_MAX_WIDTH, aspectRatio: `${CARD_ASPECT}`, mx: 'auto',
                                         display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2
                                     }}>
                                    {coverPreview ? (
                                        <>
                                            <Box component="img" src={coverPreview} alt="Cover preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); clearCover(); }}
                                                        sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }} aria-label="Remove cover">
                                                <CloseRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </>
                                    ) : (
                                        <Box sx={{ textAlign: 'center', p: 2 }}>
                                            <ImageIcon sx={{ fontSize: 42, mb: 1, color: 'text.disabled' }} />
                                            <Typography variant="body2" color="text.secondary">Upload a cover photo <em>(optional)</em></Typography>
                                        </Box>
                                    )}
                                </Box>

                                {/* LOGO + WEBSITE */}
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs="auto">
                                        <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handlePick('logo')} />
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <Box onClick={() => logoInputRef.current?.click()}
                                                 sx={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', border: '1px dashed',
                                                     borderColor: logoPreview ? 'transparent' : 'action.disabled', bgcolor: logoPreview ? 'transparent' : 'action.hover',
                                                     cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {logoPreview ? (
                                                    <>
                                                        <Box component="img" src={logoPreview} alt="Logo preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); clearLogo(); }}
                                                                    sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }} aria-label="Remove logo">
                                                            <CloseRoundedIcon fontSize="small" />
                                                        </IconButton>
                                                    </>
                                                ) : (<ImageIcon sx={{ fontSize: 32, color: 'text.disabled' }} />)}
                                            </Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>Upload a logo <em>(optional)</em></Typography>
                                        </Box>
                                    </Grid>

                                    <Grid item xs>
                                        <Typography variant="h6" sx={{ mb: 1 }}>{state.name || 'Business Name'}</Typography>
                                        <Box sx={{ width: '100%', maxWidth: 520 }}>
                                            <TextField fullWidth label="Website" value={state.website}
                                                       onChange={(e) => dispatch({ type: 'website', value: e.target.value.slice(0, WEBSITE_MAX) })}
                                                       error={!!errors.website} helperText={errors.website || 'Website (e.g., example.com or https://example.com)'}
                                                       inputProps={{ maxLength: WEBSITE_MAX }}
                                                       InputProps={{ startAdornment: (<InputAdornment position="start"><LinkIcon /></InputAdornment>) }} />
                                        </Box>
                                    </Grid>
                                </Grid>

                                {/* Descriptions */}
                                <Box sx={{ mt: 2 }}>
                                    {/* Short (plain) */}
                                    <TextField
                                        label="Short description (shown on the card)"
                                        value={stripHtmlToText(state.description)}
                                        onChange={(e) => dispatch({ type: 'description', value: e.target.value.slice(0, DESC_MAX) })}
                                        fullWidth multiline minRows={2} inputProps={{ maxLength: DESC_MAX }}
                                        helperText={`${stripHtmlToText(state.description).length}/${DESC_MAX}`}
                                    />
                                    {errors.description && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{errors.description}</Typography>}

                                    {/* Long (rich) */}
                                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>About (long, formatted)</Typography>
                                    <RichTextEditor
                                        value={state.longDescription}
                                        onChange={(html) => dispatch({ type: 'longDescription', value: html })}
                                        maxChars={LONG_MAX}
                                        placeholder="Tell people about your business…"
                                    />
                                    {errors.longDescription && <Typography variant="caption" color="error">{errors.longDescription}</Typography>}
                                </Box>
                            </Box>

                            {/* Media uploader */}
                            <Box sx={{ mt: 3, border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                                <Typography variant="h6" sx={{ mb: 1 }}>Media</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    Up to <strong>10 photos</strong> and <strong>1 video</strong>. Drag to reorder. Hover to delete. Add captions beneath each photo.
                                </Typography>

                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {state.media.map((m) => (
                                        <Box key={m.id}
                                             draggable
                                             onDragStart={() => onDragStart(m.id)}
                                             onDragOver={(e) => onDragOver(e, m.id)}
                                             onDrop={() => onDrop(m.id)}
                                             sx={{ position: 'relative', width: 160 }}>
                                            <Box sx={{ position: 'relative' }}>
                                                {m.type === 'photo' ? (
                                                    <img src={m.preview} alt="" style={thumbStyle} />
                                                ) : (
                                                    <video src={m.preview} style={{ ...thumbStyle }} controls preload="metadata" />
                                                )}
                                                <IconButton size="small"
                                                            onClick={() => dispatch({ type: 'media', value: state.media.filter(x => x.id !== m.id).map((x, i) => ({ ...x, sort: i })) })}
                                                            sx={{
                                                                position: 'absolute', top: 4, right: 4,
                                                                bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
                                                            }}>
                                                    <CloseRoundedIcon fontSize="small" />
                                                </IconButton>
                                                <DragIndicatorIcon sx={{ position: 'absolute', left: 4, top: 4, color: '#fff' }} fontSize="small" />
                                            </Box>
                                            <TextField
                                                placeholder="Caption"
                                                value={m.caption}
                                                onChange={(e) => {
                                                    const items = state.media.map(x => x.id === m.id ? { ...x, caption: e.target.value.slice(0, 200) } : x);
                                                    dispatch({ type: 'media', value: items });
                                                }}
                                                size="small"
                                                fullWidth
                                                sx={{ mt: 0.5 }}
                                                inputProps={{ maxLength: 200 }}
                                            />
                                        </Box>
                                    ))}

                                    {/* Add Photo */}
                                    <input ref={photoInputRef} type="file" accept="image/*" hidden multiple onChange={handleAddPhotos} />
                                    <Button variant="outlined" onClick={() => photoInputRef.current?.click()} startIcon={<ImageIcon />}>
                                        Add photos
                                    </Button>

                                    {/* Add Video (MP4, WEBM, OGG) */}
                                    <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleAddVideo} />
                                    <Button variant="outlined" onClick={() => videoInputRef.current?.click()} startIcon={<VideoLibraryIcon />}>
                                        Add video
                                    </Button>
                                </Box>

                                {errors.media && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{errors.media}</Typography>}
                            </Box>

                            {/* Terms */}
                            <Box sx={{ mt: 2 }}>
                                <FormControlLabel control={<Checkbox checked={state.agreeTerms} onChange={() => dispatch({ type: 'toggle', value: 'agreeTerms' })} />}
                                                  label="I confirm this business information is accurate and I am authorized to submit it." />
                                {errors.agreeTerms && <Typography variant="caption" color="error">{errors.agreeTerms}</Typography>}
                                {submitError && <Typography variant="caption" color="error" sx={{ display: 'block' }}>{submitError}</Typography>}
                            </Box>
                        </>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Box sx={{ flex: 1, color: 'text.secondary' }}>
                    <Typography variant="caption">By submitting, you agree to our community guidelines. Listings are reviewed for accuracy and quality.</Typography>
                </Box>
                {step > 0 && <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={submitting}>Back</Button>}
                {step < 2 ? (
                    <Button variant="contained" onClick={handleNext} disabled={submitting}>Next</Button>
                ) : (
                    <Button variant="contained" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for Review'}</Button>
                )}
            </DialogActions>

            {editor.open && (
                <ImageEditorDialog
                    open={editor.open}
                    src={editor.src}
                    title={editor.type === 'logo' ? 'Adjust Logo' : 'Adjust Cover Photo'}
                    aspect={editor.aspect} shape={editor.shape}
                    suggestedWidth={editor.suggestedWidth}
                    onCancel={handleEditorCancel} onApply={handleEditorApply}
                />
            )}
        </Dialog>
    );
}
