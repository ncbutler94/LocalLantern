// src/components/SidePanel/Business/BusinessDetail/BusinessDetailModal.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar, Box, Chip, Dialog, DialogContent, IconButton,
    Link, Paper, Typography, Rating, Stack, Button, Snackbar, Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import LanguageIcon from '@mui/icons-material/Language';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon from '@mui/icons-material/Share';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';

import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

import useBusinessDetail from '../../../hooks/business/useBusinessDetail';
import MediaLightbox from './BusinessMediaLightbox';
import ReviewsPanel from './ReviewsPanel';

function ensureHttp(url = '') { return /^https?:\/\//i.test(url) ? url : `https://${url}`; }
function shortUrl(url = '') { try { const u = new URL(ensureHttp(url)); return u.hostname.replace(/^www\./,''); } catch { return url; } }
function pad(n){return String(n).padStart(2,'0');}
function fmt12h(time){
    if(!time) return '';
    let h=0,m=0;
    if(/^\d{2}:\d{2}(:\d{2})?$/.test(time)){const [hh,mm]=time.split(':');h=+hh;m=+mm;}
    else if(/^\d{3,4}$/.test(time)){const s=time.padStart(4,'0');h=+s.slice(0,2);m=+s.slice(2);}
    else return time;
    const ampm=h>=12?'PM':'AM'; const hh=h%12||12; return `${hh}:${pad(m)} ${ampm}`;
}
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function normalizeHours(raw){
    if(!raw) return [];
    let data=raw; if(typeof raw==='string'){try{data=JSON.parse(raw);}catch{return [];}}
    const rows=[];
    const pushRow=(dow,open,close,closed,openFlag)=>{
        const isClosed= typeof closed === 'boolean' ? closed : (openFlag === false);
        rows.push({dow,open:open||null,close:close||null,isClosed:!!isClosed});
    };
    if(Array.isArray(data)){
        data.forEach(r=>{
            if(typeof r!=='object') return;
            let dow=r.day_of_week;
            if(dow==null && r.day!=null){const idx=String(r.day).toLowerCase().slice(0,3); dow=Math.max(0,DAYS.findIndex(d=>d.toLowerCase().startsWith(idx)));}
            if(dow!=null) pushRow(+dow,r.open_time||r.open||r.start,r.close_time||r.close||r.end,r.is_closed,r.is_open);
        });
    } else if(typeof data==='object'){
        DAYS.forEach((d,i)=>{
            const k=d.toLowerCase(); const v=data[k]||data[k.slice(0,3)]||null;
            if(v && typeof v==='object') pushRow(i,v.open_time||v.open,v.close_time||v.close,v.is_closed||v.closed,v.is_open);
        });
    }
    return rows.filter(r=>r.open||r.close||r.isClosed).sort((a,b)=>a.dow-b.dow);
}

// Shared featured height for About/Cover in the modal
const FEATURED_H = { xs: 200, sm: 240, md: 280 };

export default function BusinessDetailModal({ open, businessId, onClose, user, currentUser, initialData = null }) {
    const { data: biz, media } = useBusinessDetail(businessId, { enabled: open, initialData });
    const [mode, setMode] = useState('main');            // 'main' | 'media' | 'reviews'
    const [mediaIndex, setMediaIndex] = useState(0);
    useEffect(() => { if (open) setMode('main'); }, [open, businessId]);

    const ratingValue = useMemo(() => {
        if (typeof biz?.rating === 'number') return Number(biz.rating);
        if (typeof biz?.rating_half_stars === 'number') return Math.round(Number(biz.rating_half_stars)) / 2;
        if (typeof biz?.avg_rating === 'number') return Number(biz.avg_rating);
        return 0;
    }, [biz?.rating, biz?.rating_half_stars, biz?.avg_rating]);

    const mapsUrl = useMemo(() => {
        if (!biz) return '';
        const q = biz.latitude != null && biz.longitude != null
            ? `${biz.latitude},${biz.longitude}`
            : [biz.street_address, biz.city, biz.county].filter(Boolean).join(', ');
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    }, [biz]);

    const hours = useMemo(() => normalizeHours(biz?.hours || biz?.opening_hours || biz?.business_hours || biz?.hours_json), [biz]);
    const hasHours = hours.length > 0;

    // gallery (cover first)
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

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            slotProps={{ backdrop: { sx: { backdropFilter: 'blur(10px)', backgroundColor: 'rgba(4,8,20,0.65)' } } }}
            PaperProps={{
                sx: { overflow: 'hidden', borderRadius: 3, width: { xs: '96vw', md: 920 }, height: { xs: '96vh', md: '92vh' }, display: 'flex', flexDirection: 'column', mx: 'auto' },
            }}
        >
            <DialogContent sx={{ p: 0, position: 'relative', display: 'flex', flex: 1, flexDirection: 'column' }}>
                {/* Sticky top bar */}
                <Box sx={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'flex-end', px: 1, py: 1, bgcolor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(6px)' }}>
                    <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
                </Box>

                {/* Identity header */}
                <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
                    <Avatar src={biz?.logo_url || ''} sx={{ width: 84, height: 84, border: '3px solid', borderColor: 'background.paper' }}>
                        {(biz?.name || 'B').slice(0, 1)}
                    </Avatar>

                    <Typography variant="h6" sx={{ mt: 1, mb: 0.5, fontWeight: 800 }}>{biz?.name || 'Business'}</Typography>

                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
                        {!!biz?.category && <Chip size="small" variant="outlined" label={biz.category} />}
                        <Rating name="read-only" value={ratingValue} precision={0.5} readOnly />
                        <Typography variant="body2" color="text.secondary">
                            {ratingValue.toFixed(1)} · {biz?.review_count || 0} {(biz?.review_count || 0) === 1 ? 'review' : 'reviews'}
                        </Typography>
                        <Button size="small" onClick={openReviews}>Reviews</Button>
                        {!!biz?.website && (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <LanguageIcon fontSize="small" />
                                <Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">{shortUrl(biz.website)}</Link>
                            </Stack>
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title="Send a message (coming soon)"><span><Button variant="contained" startIcon={<ChatBubbleOutlineIcon />} onClick={() => showSnack('Messaging is coming soon')}>Message</Button></span></Tooltip>
                        <Button variant="outlined" startIcon={<ShareIcon />} onClick={onShare}>Share Profile</Button>
                    </Stack>

                    {/* ROW 1 — CSS grid: About / Cover */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'minmax(240px, 42%) 1fr' },
                            gap: 2,
                            alignItems: 'stretch',
                            minHeight: 0,
                        }}
                    >
                        <Box sx={{ minWidth: 0, minHeight: 0 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>About</Typography>
                            <Paper variant="outlined" sx={{ p: 2, height: FEATURED_H, overflowY: 'auto', minHeight: 0 }}>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {biz?.long_description || biz?.short_description || 'No about information yet.'}
                                </Typography>
                            </Paper>
                        </Box>

                        <Box sx={{ minWidth: 0, minHeight: 0 }}>
                            <Paper variant="outlined" sx={{ p: 0, height: FEATURED_H, overflow: 'hidden', minHeight: 0 }}>
                                {biz?.cover_url ? (
                                    <Box component="img" src={biz.cover_url} alt="Cover" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                                        <Stack alignItems="center" spacing={1}><PhotoCameraIcon /><Typography variant="body2">No cover photo yet.</Typography></Stack>
                                    </Box>
                                )}
                            </Paper>
                        </Box>
                    </Box>

                    {/* ROW 2 — adaptive by media presence */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: gallery.length ? 'minmax(240px, 42%) 1fr' : 'minmax(240px, 36%) 1fr' },
                            gap: 2,
                            alignItems: 'start',
                            mt: 2,
                            minHeight: 0,
                        }}
                    >
                        {gallery.length ? (
                            <>
                                {/* Media left (square tiles) */}
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Media</Typography>
                                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: { xs: 'repeat(3,1fr)', sm: 'repeat(4,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' },
                                                gap: 1,
                                            }}
                                        >
                                            {gallery.map((m, idx) => (
                                                <Box
                                                    key={m.id || idx}
                                                    sx={{ position: 'relative', pt: '100%', borderRadius: 1, overflow: 'hidden', cursor: 'pointer' }}
                                                    onClick={() => { setMode('media'); setMediaIndex(idx); }}
                                                >
                                                    <Box component={m.type === 'video' ? 'video' : 'img'} src={m.url} alt="" controls={m.type === 'video'}
                                                         sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </Box>
                                            ))}
                                        </Box>
                                    </Paper>
                                </Box>

                                {/* Right: Contact (+ Hours) over Location */}
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Contact</Typography>
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Stack spacing={1.25}>
                                            {biz?.phone && (<Stack direction="row" spacing={1} alignItems="center"><PhoneIcon fontSize="small" /><Link href={`tel:${biz.phone}`}>{biz.phone}</Link></Stack>)}
                                            {biz?.email && (<Stack direction="row" spacing={1} alignItems="center"><EmailOutlinedIcon fontSize="small" /><Link href={`mailto:${biz.email}`}>{biz.email}</Link></Stack>)}
                                            {biz?.website && (<Stack direction="row" spacing={1} alignItems="center"><LanguageIcon fontSize="small" /><Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">{shortUrl(biz.website)}</Link></Stack>)}
                                        </Stack>
                                    </Paper>

                                    {hasHours && (
                                        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Hours</Typography>
                                            <Stack spacing={0.5}>
                                                {normalizeHours(biz?.hours || biz?.opening_hours || biz?.business_hours || biz?.hours_json).map(h => (
                                                    <Stack key={h.dow} direction="row" spacing={1}>
                                                        <Typography variant="body2" sx={{ width: 120 }}>{DAYS[h.dow]}</Typography>
                                                        <Typography variant="body2">{h.isClosed ? 'Closed' : `${fmt12h(h.open)} – ${fmt12h(h.close)}`}</Typography>
                                                    </Stack>
                                                ))}
                                            </Stack>
                                        </Paper>
                                    )}

                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>Location</Typography>
                                    <Paper variant="outlined" sx={{ p: 0 }}>
                                        <Box sx={{ height: 240, '& .leaflet-control-attribution': { display: 'none !important' } }}>
                                            {(biz?.latitude != null && biz?.longitude != null) ? (
                                                <MapContainer center={[Number(biz.latitude), Number(biz.longitude)]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <Marker position={[Number(biz.latitude), Number(biz.longitude)]} />
                                                </MapContainer>
                                            ) : (
                                                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                                                    <Typography variant="body2">Map not available.</Typography>
                                                </Box>
                                            )}
                                        </Box>

                                        {(biz?.street_address || biz?.city || biz?.county) && (
                                            <Box sx={{ px: 2, py: 1.5 }}>
                                                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                                    <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                                                    <Box>
                                                        <Typography variant="body2">{[biz?.street_address, biz?.city].filter(Boolean).join(', ')}</Typography>
                                                        <Typography variant="body2">{biz?.county}</Typography>
                                                        <Button size="small" component="a" href={mapsUrl} target="_blank" rel="noopener" startIcon={<ArrowOutwardIcon />} sx={{ mt: 0.5 }}>
                                                            Directions
                                                        </Button>
                                                    </Box>
                                                </Stack>
                                            </Box>
                                        )}
                                    </Paper>
                                </Box>
                            </>
                        ) : (
                            // No media → Contact left, Location right (wider)
                            <>
                                <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Contact</Typography>
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Stack spacing={1.25}>
                                            {biz?.phone && (<Stack direction="row" spacing={1} alignItems="center"><PhoneIcon fontSize="small" /><Link href={`tel:${biz.phone}`}>{biz.phone}</Link></Stack>)}
                                            {biz?.email && (<Stack direction="row" spacing={1} alignItems="center"><EmailOutlinedIcon fontSize="small" /><Link href={`mailto:${biz.email}`}>{biz.email}</Link></Stack>)}
                                            {biz?.website && (<Stack direction="row" spacing={1} alignItems="center"><LanguageIcon fontSize="small" /><Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">{shortUrl(biz.website)}</Link></Stack>)}
                                        </Stack>
                                    </Paper>
                                </Box>

                                <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Location</Typography>
                                    <Paper variant="outlined" sx={{ p: 0 }}>
                                        <Box sx={{ height: 300, '& .leaflet-control-attribution': { display: 'none !important' } }}>
                                            {(biz?.latitude != null && biz?.longitude != null) ? (
                                                <MapContainer center={[Number(biz.latitude), Number(biz.longitude)]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <Marker position={[Number(biz.latitude), Number(biz.longitude)]} />
                                                </MapContainer>
                                            ) : (
                                                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                                                    <Typography variant="body2">Map not available.</Typography>
                                                </Box>
                                            )}
                                        </Box>
                                        {(biz?.street_address || biz?.city || biz?.county) && (
                                            <Box sx={{ px: 2, py: 1.5 }}>
                                                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                                    <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                                                    <Box>
                                                        <Typography variant="body2">{[biz?.street_address, biz?.city].filter(Boolean).join(', ')}</Typography>
                                                        <Typography variant="body2">{biz?.county}</Typography>
                                                        <Button size="small" component="a" href={mapsUrl} target="_blank" rel="noopener" startIcon={<ArrowOutwardIcon />} sx={{ mt: 0.5 }}>
                                                            Directions
                                                        </Button>
                                                    </Box>
                                                </Stack>
                                            </Box>
                                        )}
                                    </Paper>
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>

                {/* Overlays */}
                {mode === 'media' && (
                    <MediaLightbox items={gallery} index={mediaIndex} onClose={backToMain} user={user} currentUser={currentUser} />
                )}
                {mode === 'reviews' && (
                    <ReviewsPanel business={biz} onBack={backToMain} onCloseAll={onClose} user={user} currentUser={currentUser} />
                )}
                <Snackbar open={snack.open} autoHideDuration={2500} onClose={() => setSnack({ open: false, msg: '' })} message={snack.msg} />
            </DialogContent>
        </Dialog>
    );
}
