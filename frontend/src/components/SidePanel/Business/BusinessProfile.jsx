// src/components/SidePanel/Business/BusinessProfile.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar, Box, Button, Chip, Divider, IconButton, Link, Paper,
    Rating, Stack, Typography, CircularProgress, Snackbar, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LanguageIcon from '@mui/icons-material/Language';
import PlaceIcon from '@mui/icons-material/Place';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import OpenInNewIcon from '@mui/icons-material/ArrowOutward';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon from '@mui/icons-material/Share';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';

import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

import useBusinessDetail from '../../../hooks/business/useBusinessDetail';
import MediaLightbox from './BusinessDetail/BusinessMediaLightbox';
import ReviewsPanel from './BusinessDetail/ReviewsPanel';

// ---------- helpers ----------
function ensureHttp(url = '') { return /^https?:\/\//i.test(url) ? url : `https://${url}`; }
function shortUrl(url = '') { try { const u = new URL(ensureHttp(url)); return u.hostname.replace(/^www\./, ''); } catch { return url; } }
function pad(n) { return String(n).padStart(2, '0'); }
function fmt12h(time) {
    if (!time) return '';
    let h = 0, m = 0;
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(time)) { const [hh, mm] = time.split(':'); h = +hh; m = +mm; }
    else if (/^\d{3,4}$/.test(time)) { const s = time.padStart(4, '0'); h = +s.slice(0, 2); m = +s.slice(2); }
    else return time;
    const ampm = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 || 12; return `${hh}:${pad(m)} ${ampm}`;
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Normalize hours from various backend shapes */
function normalizeHours(raw) {
    if (!raw) return [];
    let data = raw; if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { return []; } }
    const rows = [];
    const pushRow = (dow, open, close, closed, openFlag) => {
        const isClosed = typeof closed === 'boolean' ? closed : (openFlag === false);
        rows.push({ dow, open: open || null, close: close || null, isClosed: !!isClosed });
    };
    if (Array.isArray(data)) {
        data.forEach(r => {
            if (typeof r !== 'object') return;
            let dow = r.day_of_week;
            if (dow == null && r.day != null) {
                const idx = String(r.day).toLowerCase().slice(0, 3);
                dow = Math.max(0, DAYS.findIndex(d => d.toLowerCase().startsWith(idx)));
            }
            if (dow != null) pushRow(+dow, r.open_time || r.open || r.start, r.close_time || r.close || r.end, r.is_closed, r.is_open);
        });
    } else if (typeof data === 'object') {
        DAYS.forEach((d, i) => {
            const k = d.toLowerCase(); const v = data[k] || data[k.slice(0, 3)] || null;
            if (v && typeof v === 'object') pushRow(i, v.open_time || v.open, v.close_time || v.close, v.is_closed || v.closed, v.is_open);
        });
    }
    return rows.filter(r => r.open || r.close || r.isClosed).sort((a, b) => a.dow - b.dow);
}

// Leaflet default marker
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Featured panels (About/Cover) share the same height
const FEATURED_H = { xs: 220, sm: 260, md: 320, lg: 360 };

export default function BusinessProfile({ businessId, onBack, user }) {
    const { data: biz, media, loading, error } = useBusinessDetail(businessId, { enabled: true });

    const [mode, setMode] = useState('main');        // 'main' | 'media' | 'reviews'
    const [mediaIndex, setMediaIndex] = useState(0);

    // Preload important images with cleanup to avoid destroy warnings
    const [assetsReady, setAssetsReady] = useState(false);
    useEffect(() => {
        if (!biz?.id) return;
        let alive = true;
        const urls = [
            ...(biz.cover_url ? [biz.cover_url] : []),
            ...(Array.isArray(media) ? media : []).filter(m => m.type !== 'video').map(m => m.url),
            ...(biz.logo_url ? [biz.logo_url] : []),
        ];
        if (!urls.length) { setAssetsReady(true); return; }
        let remaining = urls.length;
        const done = () => { if (alive && --remaining <= 0) setAssetsReady(true); };
        const images = urls.map(src => { const img = new Image(); img.onload = done; img.onerror = done; img.src = src; return img; });
        return () => { alive = false; images.forEach(i => { i.onload = i.onerror = null; }); };
    }, [biz?.id, biz?.cover_url, biz?.logo_url, media]);

    const mapsUrl = useMemo(() => {
        if (!biz) return '';
        const q = biz.latitude != null && biz.longitude != null
            ? `${biz.latitude},${biz.longitude}`
            : [biz.street_address, biz.city, biz.county].filter(Boolean).join(', ');
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    }, [biz]);

    const ratingValue = useMemo(() => {
        if (typeof biz?.rating === 'number') return Number(biz.rating);
        if (typeof biz?.rating_half_stars === 'number') return Math.round(Number(biz.rating_half_stars)) / 2;
        if (typeof biz?.avg_rating === 'number') return Number(biz.avg_rating);
        return 0;
    }, [biz?.rating, biz?.rating_half_stars, biz?.avg_rating]);

    const hours = useMemo(() => normalizeHours(biz?.hours || biz?.opening_hours || biz?.business_hours || biz?.hours_json), [biz]);
    const hasHours = hours.length > 0;

    // Media: cover first (if present), then additional media
    const gallery = useMemo(() => {
        const arr = [];
        if (biz?.cover_url) arr.push({ id: 'cover', type: 'image', url: biz.cover_url });
        (Array.isArray(media) ? media : []).forEach(m => arr.push(m));
        return arr;
    }, [biz?.cover_url, media]);

    const hasAnyMedia = gallery.length > 0;
    const openMediaAt = (idx) => { setMediaIndex(idx); setMode('media'); };
    const openReviews = () => setMode('reviews');
    const backToMain = () => setMode('main');

    // stub action feedback
    const [snack, setSnack] = useState({ open: false, msg: '' });
    const showSnack = (msg) => setSnack({ open: true, msg });
    const onShare = async () => {
        try {
            const shareData = { title: biz?.name || 'Business', text: biz?.short_description || '', url: window.location.href };
            if (navigator.share) await navigator.share(shareData);
            else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(shareData.url); showSnack('Profile link copied'); return; }
            showSnack('Share dialog opened');
        } catch {/* ignore */}
    };

    /* ---------- Loading / Error / Not found ---------- */
    if (loading) {
        return (
            <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'80vh', p:3 }}>
                <CircularProgress />
                <Typography variant="body2" sx={{ mt: 2 }}>Loading profile…</Typography>
                <Button sx={{ mt: 2 }} startIcon={<ArrowBackIcon />} onClick={onBack}>Back to listings</Button>
            </Box>
        );
    }
    if (error || !biz?.id) {
        return (
            <Box sx={{ p: 3 }}>
                <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Back to listings</Button>
                <Typography variant="h6" sx={{ mt: 2 }}>
                    {error ? 'Unable to load this business at the moment.' : 'Business not found.'}
                </Typography>
            </Box>
        );
    }
    if (!assetsReady) {
        return (
            <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'80vh', p:3 }}>
                <CircularProgress />
                <Typography variant="body2" sx={{ mt: 2 }}>Preparing photos…</Typography>
                <Button sx={{ mt: 2 }} startIcon={<ArrowBackIcon />} onClick={onBack}>Back to listings</Button>
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 6 }}>
            {/* Sticky header */}
            <Box sx={{
                position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.paper',
                borderBottom: '1px solid', borderColor: 'divider', px: 2, py: 1,
                display: 'flex', alignItems: 'center', gap: 1
            }}>
                <IconButton onClick={onBack} aria-label="Back to listings"><ArrowBackIcon /></IconButton>
                <Typography variant="h6">Business Profile</Typography>
            </Box>

            {/* HEADER: avatar + name + meta + website + actions */}
            <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar src={biz.logo_url || ''} sx={{ width: 84, height: 84, border: '3px solid', borderColor: 'background.paper' }}>
                        {(biz.name || 'B').slice(0, 1)}
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1 }}>{biz.name}</Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                            {!!biz.category && <Chip size="small" label={biz.category} />}
                            <Rating size="small" precision={0.5} value={ratingValue} readOnly />
                            <Typography variant="body2" color="text.secondary">{biz.review_count || 0} review{(biz.review_count || 0) === 1 ? '' : 's'}</Typography>
                            <Button size="small" onClick={openReviews}>Reviews</Button>
                            {!!biz.website && (
                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1 }}>
                                    <LanguageIcon fontSize="small" />
                                    <Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">{shortUrl(biz.website)}</Link>
                                </Stack>
                            )}
                        </Stack>
                    </Box>

                    <Stack direction="row" spacing={1}>
                        <Tooltip title="Send a message (coming soon)">
                            <span><Button variant="contained" startIcon={<ChatBubbleOutlineIcon />} onClick={() => showSnack('Messaging is coming soon')}>Message</Button></span>
                        </Tooltip>
                        <Tooltip title="Share this profile">
                            <span><Button variant="outlined" startIcon={<ShareIcon />} onClick={onShare}>Share Profile</Button></span>
                        </Tooltip>
                    </Stack>
                </Stack>
            </Box>

            {/* ROW 1 — CSS grid (prevents wrap even when About text is huge) */}
            <Box sx={{ px: { xs: 2, md: 3 } }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 36%) 1fr' },
                        gap: 2,
                        alignItems: 'stretch',
                        minHeight: 0, // allow children to control their own scroll
                    }}
                >
                    {/* About (left) */}
                    <Box sx={{ minWidth: 0, minHeight: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.25 }}>About</Typography>
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                height: FEATURED_H,
                                overflowY: 'auto',
                                minHeight: 0,
                            }}
                        >
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                {biz.long_description || biz.short_description || 'No description provided yet.'}
                            </Typography>
                        </Paper>
                    </Box>

                    {/* Cover (right) — no label */}
                    <Box sx={{ minWidth: 0, minHeight: 0 }}>
                        <Paper variant="outlined" sx={{ p: 0, height: FEATURED_H, overflow: 'hidden', minHeight: 0 }}>
                            {biz.cover_url ? (
                                <Box component="img" src={biz.cover_url} alt="Cover" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            ) : (
                                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                                    <Stack alignItems="center" spacing={1}>
                                        <PhotoCameraIcon /><Typography variant="body2">No cover photo yet.</Typography>
                                    </Stack>
                                </Box>
                            )}
                        </Paper>
                    </Box>
                </Box>
            </Box>

            {/* ROW 2 — adaptive */}
            <Box sx={{ px: { xs: 2, md: 3 }, mt: 2 }}>
                {hasAnyMedia ? (
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 36%) 1fr' },
                            gap: 2,
                            alignItems: 'start',
                            minHeight: 0,
                        }}
                    >
                        {/* Left: Media tiles */}
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.25 }}>Media</Typography>
                            <Paper variant="outlined" sx={{ p: 1.5 }}>
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
                                        gap: 1,
                                    }}
                                >
                                    {gallery.map((m, idx) => (
                                        <Box
                                            key={m.id || idx}
                                            sx={{ position: 'relative', pt: '100%', borderRadius: 1, overflow: 'hidden', cursor: 'pointer' }}
                                            onClick={() => openMediaAt(idx)}
                                        >
                                            <Box
                                                component={m.type === 'video' ? 'video' : 'img'}
                                                src={m.url}
                                                alt=""
                                                controls={m.type === 'video'}
                                                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        </Box>
                                    ))}
                                </Box>
                            </Paper>
                        </Box>

                        {/* Right: Contact + Hours + Location (stack) */}
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.25 }}>Contact</Typography>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Stack spacing={1.25}>
                                    {biz.phone && (
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <PhoneIcon fontSize="small" />
                                            <Link href={`tel:${biz.phone}`}>{biz.phone}</Link>
                                        </Stack>
                                    )}
                                    {biz.email && (
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <EmailOutlinedIcon fontSize="small" />
                                            <Link href={`mailto:${biz.email}`}>{biz.email}</Link>
                                        </Stack>
                                    )}
                                    {biz.website && (
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <LanguageIcon fontSize="small" />
                                            <Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">
                                                {shortUrl(biz.website)}
                                            </Link>
                                        </Stack>
                                    )}
                                </Stack>
                            </Paper>

                            {hasHours && (
                                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Hours</Typography>
                                    <Stack spacing={0.5}>
                                        {hours.map(h => (
                                            <Stack key={h.dow} direction="row" spacing={1}>
                                                <Typography variant="body2" sx={{ width: 120 }}>{DAYS[h.dow]}</Typography>
                                                <Typography variant="body2" color={h.isClosed ? 'text.secondary' : 'text.primary'}>
                                                    {h.isClosed ? 'Closed' : `${fmt12h(h.open)} – ${fmt12h(h.close)}`}
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Paper>
                            )}

                            <Typography variant="h6" sx={{ fontWeight: 700, mt: 2, mb: 1.25 }}>Location</Typography>
                            <Paper variant="outlined" sx={{ p: 0 }}>
                                <Box sx={{ height: 300, '& .leaflet-control-attribution': { display: 'none !important' } }}>
                                    {(biz.latitude != null && biz.longitude != null) ? (
                                        <MapContainer
                                            center={[Number(biz.latitude), Number(biz.longitude)]}
                                            zoom={14}
                                            style={{ height: '100%', width: '100%' }}
                                            scrollWheelZoom={false}
                                        >
                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                            <Marker position={[Number(biz.latitude), Number(biz.longitude)]} />
                                        </MapContainer>
                                    ) : (
                                        <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                                            <Typography variant="body2">Map not available.</Typography>
                                        </Box>
                                    )}
                                </Box>
                                {(biz.street_address || biz.city || biz.county) && (
                                    <Box sx={{ px: 2, py: 1.5 }}>
                                        <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                            <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                                            <Box>
                                                <Typography variant="body2">{[biz.street_address, biz.city].filter(Boolean).join(', ')}</Typography>
                                                <Typography variant="body2">{biz.county}</Typography>
                                                <Button size="small" component="a" href={mapsUrl} target="_blank" rel="noopener" startIcon={<OpenInNewIcon />} sx={{ mt: 0.5 }}>
                                                    Directions
                                                </Button>
                                            </Box>
                                        </Stack>
                                    </Box>
                                )}
                            </Paper>
                        </Box>
                    </Box>
                ) : (
                    // No media → Contact left (narrow), Location right (wider)
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 36%) 1fr' },
                            gap: 2,
                            alignItems: 'start',
                            minHeight: 0
                        }}
                    >
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.25 }}>Contact</Typography>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Stack spacing={1.25}>
                                    {biz.phone && (<Stack direction="row" spacing={1} alignItems="center"><PhoneIcon fontSize="small" /><Link href={`tel:${biz.phone}`}>{biz.phone}</Link></Stack>)}
                                    {biz.email && (<Stack direction="row" spacing={1} alignItems="center"><EmailOutlinedIcon fontSize="small" /><Link href={`mailto:${biz.email}`}>{biz.email}</Link></Stack>)}
                                    {biz.website && (<Stack direction="row" spacing={1} alignItems="center"><LanguageIcon fontSize="small" /><Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">{shortUrl(biz.website)}</Link></Stack>)}
                                </Stack>
                            </Paper>
                            {hasHours && (
                                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Hours</Typography>
                                    <Stack spacing={0.5}>
                                        {hours.map(h => (
                                            <Stack key={h.dow} direction="row" spacing={1}>
                                                <Typography variant="body2" sx={{ width: 120 }}>{DAYS[h.dow]}</Typography>
                                                <Typography variant="body2" color={h.isClosed ? 'text.secondary' : 'text.primary'}>
                                                    {h.isClosed ? 'Closed' : `${fmt12h(h.open)} – ${fmt12h(h.close)}`}
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Paper>
                            )}
                        </Box>

                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.25 }}>Location</Typography>
                            <Paper variant="outlined" sx={{ p: 0 }}>
                                <Box sx={{ height: 360, '& .leaflet-control-attribution': { display: 'none !important' } }}>
                                    {(biz.latitude != null && biz.longitude != null) ? (
                                        <MapContainer
                                            center={[Number(biz.latitude), Number(biz.longitude)]}
                                            zoom={14}
                                            style={{ height: '100%', width: '100%' }}
                                            scrollWheelZoom={false}
                                        >
                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                            <Marker position={[Number(biz.latitude), Number(biz.longitude)]} />
                                        </MapContainer>
                                    ) : (
                                        <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                                            <Typography variant="body2">Map not available.</Typography>
                                        </Box>
                                    )}
                                </Box>
                                {(biz.street_address || biz.city || biz.county) && (
                                    <Box sx={{ px: 2, py: 1.5 }}>
                                        <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                            <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                                            <Box>
                                                <Typography variant="body2">{[biz.street_address, biz.city].filter(Boolean).join(', ')}</Typography>
                                                <Typography variant="body2">{biz.county}</Typography>
                                                <Button size="small" component="a" href={mapsUrl} target="_blank" rel="noopener" startIcon={<OpenInNewIcon />} sx={{ mt: 0.5 }}>
                                                    Directions
                                                </Button>
                                            </Box>
                                        </Stack>
                                    </Box>
                                )}
                            </Paper>
                        </Box>
                    </Box>
                )}
            </Box>

            {/* overlays */}
            {mode === 'media' && (
                <MediaLightbox items={gallery} index={mediaIndex} onClose={backToMain} user={user} />
            )}
            {mode === 'reviews' && (
                <Box sx={{ position:'fixed', inset:0, zIndex: 1200 }}>
                    <ReviewsPanel business={biz} onBack={backToMain} onCloseAll={onBack} user={user} />
                </Box>
            )}

            <Snackbar
                open={snack.open}
                autoHideDuration={2500}
                onClose={() => setSnack({ open: false, msg: '' })}
                message={snack.msg}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
        </Box>
    );
}
