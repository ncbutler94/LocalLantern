// src/pages/events/EventDetails.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
import {
    Box, Paper, Stack, Typography, Button, Chip, Divider, CircularProgress, Link, Alert, Avatar, Tooltip
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PlaceIcon from '@mui/icons-material/Place';
import ShareIcon from '@mui/icons-material/Share';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import MapIcon from '@mui/icons-material/Map';
import FlagIcon from '@mui/icons-material/Flag';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const fmtRange = (startISO, endISO) => {
    if (!startISO) return '';
    const s = new Date(startISO);
    const e = endISO ? new Date(endISO) : null;
    const datePart = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timePart = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const endPart  = e ? ` – ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
    return `${datePart} • ${timePart}${endPart}`;
};

const statusBanner = (status) => {
    switch ((status || '').toLowerCase()) {
        case 'pending':   return { severity: 'info',     text: 'This event is pending review.' };
        case 'flagged':   return { severity: 'warning',  text: 'This event has been flagged and is under review.' };
        case 'cancelled': return { severity: 'error',    text: 'This event has been cancelled.' };
        default:          return null;
    }
};

export default function EventDetails() {
    const { eventId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [ev, setEv] = useState(null);

    const [interested, setInterested] = useState(false);
    const [interestedCount, setInterestedCount] = useState(0);

    const [going, setGoing] = useState(false);
    const [goingCount, setGoingCount] = useState(0);

    const [reportMsg, setReportMsg] = useState('');

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/events/${eventId}`);
                if (!mounted) return;
                const data = res.data;
                setEv(data);
                setInterestedCount(Number(data?.interested_count || data?.interestedCount || 0));
                setGoingCount(Number(data?.rsvp_count || data?.going_count || 0));
                setInterested(!!data?.viewer_interested);
                setGoing(!!data?.viewer_going);
            } catch (err) {
                console.error('Failed to load event', err);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [eventId]);

    const mapCenter = useMemo(() => {
        if (ev?.lat && ev?.lng) return [ev.lat, ev.lng];
        return [32.806671, -86.79113]; // Alabama center
    }, [ev]);

    const handleAddToCalendar = () => {
        const url = `${process.env.REACT_APP_API_URL}/api/events/${eventId}/ics`;
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const handleShare = async () => {
        const shareUrl = `${window.location.origin}/events/${eventId}`;
        const title = ev?.title || 'Local Lantern Event';
        try {
            if (navigator.share) await navigator.share({ title, url: shareUrl });
            else {
                await navigator.clipboard.writeText(shareUrl);
                alert('Link copied to clipboard');
            }
        } catch { /* user canceled */ }
    };

    const directionsUrl = () => {
        if (ev?.lat && ev?.lng) return `https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}`;
        const parts = [ev?.venue_name, ev?.address, ev?.city, ev?.county].filter(Boolean).join(', ');
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts)}`;
    };

    const toggleInterested = async () => {
        try {
            const url = `${process.env.REACT_APP_API_URL}/api/events/${eventId}/interested`;
            const r = await axios.post(url, {});
            setInterested(!!r.data?.interested);
            setInterestedCount(Number(r.data?.count || 0));
        } catch (err) {
            console.error('Interested toggle failed', err);
        }
    };

    const toggleGoing = async () => {
        try {
            const url = `${process.env.REACT_APP_API_URL}/api/events/${eventId}/going`;
            const r = await axios.post(url, {});
            setGoing(!!r.data?.going);
            setGoingCount(Number(r.data?.count || 0));
        } catch (err) {
            console.error('Going toggle failed', err);
        }
    };

    const reportEvent = async () => {
        try {
            const url = `${process.env.REACT_APP_API_URL}/api/events/${eventId}/report`;
            await axios.post(url, { reason: 'user_report' });
            setEv(prev => prev ? { ...prev, status: 'flagged' } : prev);
            setReportMsg('Thanks for the report — our team will review this listing.');
            setTimeout(() => setReportMsg(''), 4000);
        } catch (err) {
            console.error('Report failed', err);
        }
    };

    if (loading) {
        return (
            <Box sx={{ p: { xs: 1.5, md: 2.5 }, display:'flex', alignItems:'center', justifyContent:'center', minHeight: 300 }}>
                <CircularProgress size={28} />
            </Box>
        );
    }

    if (!ev) {
        return (
            <Box sx={{ p: { xs: 1.5, md: 2.5 }, textAlign:'center', color:'text.secondary' }}>
                Event not found.
                <Box sx={{ mt: 2 }}>
                    <Button variant="outlined" onClick={() => navigate('/events')}>Back to Events</Button>
                </Box>
            </Box>
        );
    }

    const banner = statusBanner(ev.status);
    const org = ev.organizer || {};

    return (
        <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Button component={RouterLink} to="/events" size="small" variant="text">← Back to Events</Button>
            </Stack>

            {banner && (
                <Alert severity={banner.severity} sx={{ mb: 2 }}>
                    {banner.text}
                </Alert>
            )}
            {reportMsg && (
                <Alert severity="success" sx={{ mb: 2 }}>
                    {reportMsg}
                </Alert>
            )}

            {/* Cover image */}
            {ev.image_url && (
                <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden', borderRadius: 2 }}>
                    <Box
                        component="img"
                        src={ev.image_url}
                        alt=""
                        sx={{ width: '100%', height: { xs: 200, sm: 260, md: 320 }, objectFit: 'cover', display: 'block' }}
                        loading="lazy"
                    />
                </Paper>
            )}

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs:'column', md:'row' }} spacing={2} alignItems={{ xs:'flex-start', md:'center' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                        <EventIcon fontSize="small" />
                        <Typography variant="h5" fontWeight={700} noWrap title={ev.title}>{ev.title}</Typography>
                        {ev.category && <Chip size="small" label={ev.category} sx={{ ml: 1 }} />}
                        {ev.is_online && <Chip size="small" color="info" variant="outlined" label="Online Event" sx={{ ml: 0.5 }} />}
                        {ev.is_free && <Chip size="small" color="success" variant="outlined" label="Free" sx={{ ml: 0.5 }} />}
                    </Stack>

                    <Stack direction="row" spacing={1}>
                        <Button size="small" startIcon={<BookmarkBorderIcon />}>Save</Button>
                        <Button size="small" startIcon={<ShareIcon />} onClick={handleShare}>Share</Button>
                        <Button size="small" startIcon={<EventIcon />} variant="contained" onClick={handleAddToCalendar}>
                            Add to Calendar
                        </Button>
                    </Stack>
                </Stack>

                <Divider sx={{ my: 1.5 }} />

                {/* When & where */}
                <Stack direction={{ xs:'column', sm:'row' }} spacing={3} sx={{ color:'text.secondary' }}>
                    <Stack spacing={1} sx={{ minWidth: 260 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <AccessTimeIcon fontSize="small" />
                            <Typography variant="body1">{fmtRange(ev.start_datetime, ev.end_datetime)}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <PlaceIcon fontSize="small" />
                            <Typography variant="body1">
                                {[ev.venue_name, ev.address, ev.city, ev.county].filter(Boolean).join(', ')}
                            </Typography>
                        </Stack>

                        {/* Interested / Going */}
                        <Box sx={{ mt: 1, display:'flex', gap:1, flexWrap:'wrap', alignItems: 'center' }}>
                            <Tooltip title={interested ? 'Unmark Interested' : 'Mark Interested'}>
                                <Button
                                    size="small"
                                    startIcon={interested ? <StarIcon /> : <StarBorderIcon />}
                                    color={interested ? 'primary' : 'inherit'}
                                    variant={interested ? 'contained' : 'outlined'}
                                    onClick={toggleInterested}
                                >
                                    Interested {interestedCount ? `(${interestedCount})` : ''}
                                </Button>
                            </Tooltip>

                            <Tooltip title={going ? 'Mark Not Going' : 'Mark Going'}>
                                <Button
                                    size="small"
                                    startIcon={going ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                                    color={going ? 'primary' : 'inherit'}
                                    variant={going ? 'contained' : 'outlined'}
                                    onClick={toggleGoing}
                                >
                                    Going {goingCount ? `(${goingCount})` : ''}
                                </Button>
                            </Tooltip>

                            <Button startIcon={<MapIcon />} component={Link} href={directionsUrl()} target="_blank" rel="noreferrer">
                                Directions
                            </Button>
                            <Button startIcon={<FlagIcon />} color="warning" onClick={reportEvent}>
                                Report
                            </Button>
                        </Box>
                    </Stack>

                    <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ whiteSpace:'pre-wrap' }}>
                            {ev.description || 'No description provided.'}
                        </Typography>
                    </Box>
                </Stack>

                {/* Posted by */}
                {org?.id && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar
                                src={org.avatar_url || org.profile_picture || ''}
                                alt=""
                                sx={{ width: 36, height: 36 }}
                                component={RouterLink}
                                to={`/${org.handle || org.id}`}
                            />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography
                                    variant="body2"
                                    component={RouterLink}
                                    to={`/${org.handle || org.id}`}
                                    sx={{ color: 'text.primary', textDecoration: 'none', fontWeight: 600 }}
                                >
                                    {org.first_name} {org.last_name}
                                </Typography>
                                {org.handle && (
                                    <Typography variant="caption" color="text.secondary">
                                        @{org.handle}
                                    </Typography>
                                )}
                            </Box>
                        </Stack>
                    </>
                )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 1 }}>
                <Box sx={{ height: 320 }}>
                    <MapContainer center={mapCenter} zoom={ev?.lat ? 14 : 7} style={{ height: '100%', width: '100%' }}>
                        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {ev?.lat && ev?.lng && (
                            <Marker position={[ev.lat, ev.lng]}>
                                <Popup>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{ev.title}</Typography>
                                    <Typography variant="body2" color="text.secondary">{fmtRange(ev.start_datetime, ev.end_datetime)}</Typography>
                                    {ev.venue_name && <Typography variant="body2">{ev.venue_name}</Typography>}
                                </Popup>
                            </Marker>
                        )}
                    </MapContainer>
                </Box>
            </Paper>
        </Box>
    );
}
