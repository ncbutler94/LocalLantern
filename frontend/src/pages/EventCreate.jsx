// src/pages/EventCreate.jsx
import React, { useState } from 'react';
import {
    Box, Paper, Stack, Typography, TextField, Button, FormControlLabel, Switch,
    MenuItem, Divider, Alert, LinearProgress
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import PlaceIcon from '@mui/icons-material/Place';
import EventIcon from '@mui/icons-material/Event';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = [
    'Festival','Concert','Church','Market','Parade',
    'Volunteer','Sports','Class/Workshop','Government/School','Other'
];

export default function EventCreate() {
    const navigate = useNavigate();

    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');

    const [startLocal, setStartLocal] = useState(''); // yyyy-MM-ddTHH:mm
    const [endLocal, setEndLocal] = useState('');

    const [venueName, setVenueName] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [county, setCounty] = useState('');

    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');

    const [isOnline, setIsOnline] = useState(false);
    const [isFree, setIsFree] = useState(false);
    const [priceMin, setPriceMin] = useState('');
    const [priceMax, setPriceMax] = useState('');

    const [imageUrl, setImageUrl] = useState('');
    const [imgUploading, setImgUploading] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');

    const toISOStringUTC = (localValue) => {
        if (!localValue) return '';
        const d = new Date(localValue);
        if (isNaN(+d)) return '';
        return d.toISOString();
    };

    const validate = () => {
        if (!title) return 'Title is required.';
        if (!startLocal) return 'Start date/time is required.';
        if (endLocal) {
            const s = new Date(startLocal);
            const e = new Date(endLocal);
            if (isFinite(+s) && isFinite(+e) && e < s) return 'End must be after Start.';
        }
        if (!isOnline && !city && !address) {
            return 'For in-person events, include at least a City or Address.';
        }
        if (priceMin && Number(priceMin) < 0) return 'Price min cannot be negative.';
        if (priceMax && Number(priceMax) < 0) return 'Price max cannot be negative.';
        if (priceMin && priceMax && Number(priceMax) < Number(priceMin)) return 'Price max cannot be less than min.';
        return '';
    };

    const geocode = async () => {
        try {
            setError('');
            const body = { street: address, city, state: 'AL', country: 'US' };
            const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/geocode`, body);
            setLat(res.data.lat);
            setLng(res.data.lng);
            setOkMsg('Coordinates added from address.');
            setTimeout(() => setOkMsg(''), 2500);
        } catch (err) {
            console.error('Geocode failed', err);
            setError('Could not find coordinates for that address/city.');
        }
    };

    const onPickImage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setOkMsg('');
        setImgUploading(true);
        try {
            const { name, type } = file;
            const r = await axios.post(`${process.env.REACT_APP_API_URL}/api/uploads/signed-url`, {
                folder: 'events',
                fileName: name,
                contentType: type
            });
            const { uploadUrl, publicUrl } = r.data;
            await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
            setImageUrl(publicUrl);
            setOkMsg('Image uploaded.');
            setTimeout(() => setOkMsg(''), 2500);
        } catch (err) {
            console.error('Upload failed', err);
            setError('Image upload failed.');
        } finally {
            setImgUploading(false);
        }
    };

    const onSubmit = async () => {
        const v = validate();
        if (v) { setError(v); return; }
        setError('');
        setOkMsg('');
        setSubmitting(true);
        try {
            const payload = {
                title,
                description,
                category: category || null,
                start_datetime: toISOStringUTC(startLocal),
                end_datetime: endLocal ? toISOStringUTC(endLocal) : null,
                venue_name: venueName || null,
                address: address || null,
                city: city || null,
                county: county || null,
                lat: lat ? Number(lat) : null,
                lng: lng ? Number(lng) : null,
                is_online: !!isOnline,
                is_free: !!isFree,
                price_min: priceMin ? Number(priceMin) : null,
                price_max: priceMax ? Number(priceMax) : null,
                audience_flags: {},
                accessibility_flags: {},
                tags: [],
                image_url: imageUrl || null,
                source: 'user'
            };

            const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/events`, payload);
            const id = res.data?.id;
            if (id) {
                setOkMsg('Event created! Redirecting…');
                setTimeout(() => navigate(`/events/${id}`), 700);
            } else {
                setError('Created, but no ID returned.');
            }
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

    return (
        <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                    Create a New Event
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {okMsg && <Alert severity="success" sx={{ mb: 2 }}>{okMsg}</Alert>}
                {submitting && <LinearProgress sx={{ mb: 2 }} />}

                <Stack spacing={2}>
                    <TextField label="Title *" value={title} onChange={(e)=>setTitle(e.target.value)} inputProps={{ maxLength: 255 }} />

                    <TextField
                        select label="Category" value={category} onChange={(e)=>setCategory(e.target.value)}
                        helperText="Choose the closest match"
                    >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </TextField>

                    <TextField
                        label="Description"
                        value={description}
                        onChange={(e)=>setDescription(e.target.value)}
                        multiline minRows={4}
                    />

                    <Stack direction={{ xs:'column', sm:'row' }} spacing={2}>
                        <TextField
                            type="datetime-local"
                            label="Start (local) *"
                            value={startLocal}
                            onChange={(e)=>setStartLocal(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            helperText="Local time is converted to UTC on save"
                        />
                        <TextField
                            type="datetime-local"
                            label="End (local)"
                            value={endLocal}
                            onChange={(e)=>setEndLocal(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                    </Stack>

                    <Divider />

                    <Stack direction={{ xs:'column', sm:'row' }} spacing={2}>
                        <TextField label="Venue name" value={venueName} onChange={(e)=>setVenueName(e.target.value)} fullWidth />
                        <FormControlLabel control={<Switch checked={isOnline} onChange={(e)=>setIsOnline(e.target.checked)} />} label="Online event" />
                    </Stack>

                    <Stack direction={{ xs:'column', sm:'row' }} spacing={2}>
                        <TextField label="Address" value={address} onChange={(e)=>setAddress(e.target.value)} fullWidth />
                        <TextField label="City" value={city} onChange={(e)=>setCity(e.target.value)} fullWidth />
                        <TextField label="County" value={county} onChange={(e)=>setCounty(e.target.value)} fullWidth />
                    </Stack>

                    <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems="center">
                        <TextField label="Latitude" value={lat} onChange={(e)=>setLat(e.target.value)} fullWidth />
                        <TextField label="Longitude" value={lng} onChange={(e)=>setLng(e.target.value)} fullWidth />
                        <Button startIcon={<PlaceIcon />} variant="outlined" onClick={geocode}>Get Coordinates</Button>
                    </Stack>

                    <Stack direction={{ xs:'column', sm:'row' }} spacing={2}>
                        <FormControlLabel control={<Switch checked={isFree} onChange={(e)=>setIsFree(e.target.checked)} />} label="Free" />
                        <TextField label="Price min" value={priceMin} onChange={(e)=>setPriceMin(e.target.value)} type="number" fullWidth />
                        <TextField label="Price max" value={priceMax} onChange={(e)=>setPriceMax(e.target.value)} type="number" fullWidth />
                    </Stack>

                    <Divider />

                    <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems="center">
                        <Button component="label" startIcon={<AddPhotoAlternateIcon />} variant="outlined" disabled={imgUploading}>
                            {imgUploading ? 'Uploading…' : 'Upload Cover Image'}
                            <input type="file" accept="image/*" hidden onChange={onPickImage} />
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            {imageUrl ? `Image ready: ${imageUrl.split('/').pop()}` : 'Optional'}
                        </Typography>
                    </Stack>

                    <Stack direction="row" spacing={1}>
                        <Button startIcon={<EventIcon />} variant="contained" disabled={submitting} onClick={onSubmit}>Create Event</Button>
                        <Button variant="text" onClick={() => navigate('/events')}>Cancel</Button>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
}
