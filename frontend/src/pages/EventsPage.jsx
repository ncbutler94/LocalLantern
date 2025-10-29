// src/pages/EventsPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Box, Grid, Paper, Stack, TextField, FormControl, InputLabel, Select, MenuItem,
    Button, Typography, Divider, Chip, CircularProgress, IconButton, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import PlaceIcon from '@mui/icons-material/Place';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShareIcon from '@mui/icons-material/Share';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import MyLocationIcon from '@mui/icons-material/MyLocation';

import axios from 'axios';
import { useAuthModal } from '../contexts/AuthModalContext';
import { useNavigate } from 'react-router-dom';

// Map (Leaflet)
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const EVENT_CATEGORIES = [
    'Festival', 'Concert', 'Church', 'Market', 'Parade',
    'Volunteer', 'Sports', 'Class/Workshop', 'Government/School', 'Other'
];

const DATE_PRESETS = [
    'Today', 'Tonight', 'This Weekend', 'Next 7 Days', 'This Month', 'All time'
];

function formatRange(startISO, endISO) {
    try {
        const s = new Date(startISO);
        const e = endISO ? new Date(endISO) : null;
        const datePart = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const timePart = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const endPart  = e ? ` – ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
        return `${datePart} • ${timePart}${endPart}`;
    } catch {
        return '';
    }
}

function EventCard({ evt, onOpen, onInterested }) {
    const interested = !!evt.__interested;
    const count = Number(evt.interested_count || 0);
    return (
        <Paper
            variant="outlined"
            sx={{ p: 2, cursor:'pointer', '&:hover': { bgcolor:'action.hover' } }}
            onClick={() => onOpen?.(evt)}
        >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <EventIcon fontSize="small" />
                    <Typography variant="subtitle1" fontWeight={600} noWrap title={evt.title}>
                        {evt.title}
                    </Typography>
                    {evt.category && <Chip size="small" label={evt.category} sx={{ ml: 1 }} />}
                    {evt.is_free && <Chip size="small" color="success" variant="outlined" label="Free" sx={{ ml: 0.5 }} />}
                </Stack>
                <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<BookmarkBorderIcon />} onClick={(e) => e.stopPropagation()}>Save</Button>
                    <Button size="small" startIcon={<ShareIcon />} onClick={(e) => e.stopPropagation()}>Share</Button>
                    <Button
                        size="small"
                        startIcon={interested ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                        color={interested ? 'error' : 'primary'}
                        onClick={(e) => { e.stopPropagation(); onInterested?.(evt); }}
                    >
                        Interested {count ? `(${count})` : ''}
                    </Button>
                </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ color: 'text.secondary' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <AccessTimeIcon fontSize="small" />
                    <Typography variant="body2">{formatRange(evt.start_datetime, evt.end_datetime)}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <PlaceIcon fontSize="small" />
                    <Typography variant="body2">
                        {evt.venue_name ? `${evt.venue_name} — ` : ''}
                        {evt.city}{evt.city && evt.county ? ', ' : ''}{evt.county}
                    </Typography>
                </Stack>
            </Stack>
        </Paper>
    );
}

/** Watch map movements and capture a pending bounding box */
function MapAreaWatcher({ onBoundsChange }) {
    useMapEvents({
        moveend: (e) => {
            const map = e.target;
            const b = map.getBounds();
            const pending = {
                minLat: b.getSouth(),
                minLng: b.getWest(),
                maxLat: b.getNorth(),
                maxLng: b.getEast(),
            };
            onBoundsChange(pending);
        }
    });
    return null;
}

const boundsEqual = (a, b) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const eps = 1e-6;
    return (
        Math.abs(a.minLat - b.minLat) < eps &&
        Math.abs(a.minLng - b.minLng) < eps &&
        Math.abs(a.maxLat - b.maxLat) < eps &&
        Math.abs(a.maxLng - b.maxLng) < eps
    );
};

export default function EventsPage({ user }) {
    const { open: openLogin } = useAuthModal();
    const navigate = useNavigate();

    // Filters
    const [q, setQ] = useState('');
    const [category, setCategory] = useState('');
    const [datePreset, setDatePreset] = useState('This Weekend');
    const [county, setCounty] = useState('');
    const [city, setCity] = useState('');

    // Map area filters
    const [mapBounds, setMapBounds] = useState(null);      // applied bbox
    const [pendingBounds, setPendingBounds] = useState(null); // latest moved bbox (not yet applied)

    // Data
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [total, setTotal] = useState(0);

    const appliedChips = useMemo(() => {
        const chips = [];
        if (q) chips.push({ label: `“${q}”`, key: 'q' });
        if (category) chips.push({ label: category, key: 'category' });
        if (datePreset) chips.push({ label: datePreset, key: 'date' });
        if (county) chips.push({ label: county, key: 'county' });
        if (city) chips.push({ label: city, key: 'city' });
        if (mapBounds) chips.push({ label: 'Map area', key: 'bbox' });
        return chips;
    }, [q, category, datePreset, county, city, mapBounds]);

    const clearAll = () => {
        setQ(''); setCategory(''); setDatePreset('This Weekend'); setCounty(''); setCity('');
        setMapBounds(null);
    };

    // Map defaults (Alabama)
    const mapCenter = [32.806671, -86.79113];
    const mapZoom = 7;

    const presetToRange = (preset) => {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);
        switch (preset) {
            case 'Today':
                end.setHours(23,59,59,999);
                return { date_from: start.toISOString(), date_to: end.toISOString() };
            case 'Tonight':
                start.setHours(17,0,0,0);
                end.setHours(23,59,59,999);
                return { date_from: start.toISOString(), date_to: end.toISOString() };
            case 'This Weekend': {
                const day = now.getDay();
                const diffToSat = (6 - day + 7) % 7;
                const saturday = new Date(now); saturday.setDate(now.getDate() + diffToSat); saturday.setHours(0,0,0,0);
                const sunday = new Date(saturday); sunday.setDate(saturday.getDate() + 1); sunday.setHours(23,59,59,999);
                return { date_from: saturday.toISOString(), date_to: sunday.toISOString() };
            }
            case 'Next 7 Days':
                end.setDate(now.getDate() + 7);
                return { date_from: start.toISOString(), date_to: end.toISOString() };
            case 'This Month':
                end.setMonth(now.getMonth() + 1, 0); end.setHours(23,59,59,999);
                return { date_from: start.toISOString(), date_to: end.toISOString() };
            default:
                return {};
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const range = presetToRange(datePreset);
            const params = {
                q: q || undefined,
                category: category || undefined,
                county: county || undefined,
                city: city || undefined,
                ...range,
                sort: 'upcoming',
                limit: 200
            };
            if (mapBounds) {
                const { minLat, minLng, maxLat, maxLng } = mapBounds;
                params.bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
            }
            const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/events`, { params });
            setEvents((res.data.items || []).map(e => ({ ...e })));
            setTotal(res.data.total || 0);
        } catch (err) {
            console.error('Failed to load events', err);
        } finally {
            setLoading(false);
        }
    }, [q, category, county, city, datePreset, mapBounds]);

    useEffect(() => { load(); }, []); // initial load

    const onNewEvent = () => {
        if (!user) return openLogin();
        return navigate('/events/new');
    };

    // Group events by YYYY-MM-DD of start_datetime
    const groups = useMemo(() => {
        const map = new Map();
        for (const e of events) {
            const d = e.start_datetime ? new Date(e.start_datetime) : null;
            const key = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : 'No date';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(e);
        }
        const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
        return entries;
    }, [events]);

    const formatHeader = (key) => {
        if (key === 'No date') return key;
        const [y,m,d] = key.split('-').map(Number);
        const dt = new Date(y, m-1, d);
        return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    };

    const showSearchArea = useMemo(
        () => !!pendingBounds && !boundsEqual(pendingBounds, mapBounds),
        [pendingBounds, mapBounds]
    );

    const applySearchArea = () => {
        setMapBounds(pendingBounds);
        // Trigger fresh load with bbox
        setTimeout(load, 0);
    };

    const clearMapFilter = () => {
        setMapBounds(null);
        setTimeout(load, 0);
    };

    const toggleInterested = async (evt) => {
        if (!user) { openLogin(); return; }
        try {
            const url = `${process.env.REACT_APP_API_URL}/api/events/${evt.id}/interested`;
            const r = await axios.post(url, {});
            const { interested, count } = r.data || {};
            setEvents(prev => prev.map(e => e.id === evt.id ? { ...e, __interested: interested, interested_count: count } : e));
        } catch (err) {
            console.error('Interested toggle failed', err);
        }
    };

    return (
        <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
            {/* Filter bar */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                    <TextField
                        size="small"
                        label="Search events"
                        placeholder="e.g., festival, cleanup, market"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        sx={{ flex: 2 }}
                        onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                    />

                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id="event-category-label">Category</InputLabel>
                        <Select
                            labelId="event-category-label"
                            label="Category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <MenuItem value=""><em>All</em></MenuItem>
                            {EVENT_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id="date-preset-label">Date</InputLabel>
                        <Select
                            labelId="date-preset-label"
                            label="Date"
                            value={datePreset}
                            onChange={(e) => setDatePreset(e.target.value)}
                        >
                            {DATE_PRESETS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                        </Select>
                    </FormControl>

                    <TextField size="small" label="County" value={county} onChange={(e) => setCounty(e.target.value)} sx={{ minWidth: 160 }} />
                    <TextField size="small" label="City"   value={city}   onChange={(e) => setCity(e.target.value)}   sx={{ minWidth: 160 }} />

                    <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
                        <Button startIcon={<SearchIcon />} variant="contained" onClick={load}>Search</Button>
                        <Button startIcon={<ClearIcon />}  variant="outlined" onClick={clearAll}>Clear</Button>
                    </Stack>
                </Stack>

                {!!appliedChips.length && (
                    <>
                        <Divider sx={{ my: 1.5 }} />
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                            {appliedChips.map(ch => (<Chip key={ch.key} label={ch.label} size="small" />))}
                        </Stack>
                    </>
                )}
            </Paper>

            <Grid container spacing={2}>
                {/* Left: Events list + "New Event" */}
                <Grid item xs={12} lg={8}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Events {total ? `(${total})` : ''}
                            </Typography>
                            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={onNewEvent}>
                                New Event
                            </Button>
                        </Stack>

                        {loading ? (
                            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'center', py:6 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : (
                            <Stack spacing={2}>
                                {groups.map(([key, items]) => (
                                    <Box key={key}>
                                        <Box
                                            sx={{
                                                position: 'sticky', top: 0, zIndex: 1,
                                                bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', px: 1, py: 0.5
                                            }}
                                        >
                                            <Typography variant="overline" sx={{ fontWeight: 700 }}>
                                                {formatHeader(key)}
                                            </Typography>
                                        </Box>
                                        <Stack spacing={1.5} sx={{ mt: 1 }}>
                                            {items.map(evt => (
                                                <EventCard key={evt.id} evt={evt} onOpen={() => navigate(`/events/${evt.id}`)} onInterested={toggleInterested} />
                                            ))}
                                        </Stack>
                                    </Box>
                                ))}
                                {!events.length && (
                                    <Box sx={{ color:'text.secondary', py:3, textAlign:'center' }}>
                                        No events match those filters.
                                    </Box>
                                )}
                            </Stack>
                        )}
                    </Paper>
                </Grid>

                {/* Right: Map with "Search this area" overlay */}
                <Grid item xs={12} lg={4}>
                    <Paper variant="outlined" sx={{ position:'relative', p: 1, height: { xs: 360, lg: '100%' }, minHeight: 360 }}>
                        {/* Overlay controls */}
                        <Stack
                            direction="row"
                            spacing={1}
                            sx={{ position:'absolute', top: 8, left: '50%', transform:'translateX(-50%)', zIndex: 10 }}
                        >
                            {showSearchArea && (
                                <Button size="small" variant="contained" onClick={applySearchArea}>
                                    Search this area
                                </Button>
                            )}
                            {mapBounds && (
                                <Button size="small" variant="outlined" onClick={clearMapFilter}>
                                    Clear area filter
                                </Button>
                            )}
                            <Tooltip title="Center on Alabama">
                                <IconButton size="small" onClick={() => setMapBounds(null)}><MyLocationIcon fontSize="small" /></IconButton>
                            </Tooltip>
                        </Stack>

                        <Box sx={{ height: '100%' }}>
                            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
                                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <MapAreaWatcher onBoundsChange={setPendingBounds} />
                                {events.filter(e => e.lat && e.lng).map(e => (
                                    <Marker key={e.id} position={[e.lat, e.lng]}>
                                        <Popup>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{e.title}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {formatRange(e.start_datetime, e.end_datetime)}
                                            </Typography>
                                            {e.venue_name && <Typography variant="body2">{e.venue_name}</Typography>}
                                            <Box sx={{ mt: 1 }}>
                                                <Button size="small" onClick={() => navigate(`/events/${e.id}`)}>View</Button>
                                            </Box>
                                        </Popup>
                                    </Marker>
                                ))}
                            </MapContainer>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
