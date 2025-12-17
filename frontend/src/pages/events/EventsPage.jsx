// src/pages/events/EventsPage.jsx
// ============================================================================
// Events page: left list + right map (EventMap).
// Markers show for events with coordinates; clicking a list location
// pans/zooms + opens the event popup; hover makes the pin bounce.
// ============================================================================

import React, {
    useState, useMemo, useEffect, useCallback, useReducer, useRef
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, CircularProgress, Card, CardHeader, CardContent, Avatar, Typography
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';

import EventMap from './EventMap';
import EventsPanel from './EventsPanel';

import cityData from '../../data/alabamaCities.json';
import countyData from '../../data/alabamaCounties.json';
import cityCountyMap from '../../data/cityCountyMap.json';

/* ---------- map defaults ---------- */
const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

/* Use the same base URL everywhere */
const API_BASE = process.env.REACT_APP_API_URL || '';

/* ---------- reducer ---------- */
const initialFilters = {
    search: '',
    category: '',
    sort: 'newest',
    dateRange: 'all',
    city: '',
    county: '',
};
function filterReducer(state, { type, value }) {
    return { ...state, [type]: value };
}

/* ---------- date range → [from,to] (UTC ISO) ---------- */
function rangeToISO(dateRange) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (dateRange) {
        case 'today':
            end.setHours(23, 59, 59, 999);
            return { date_from: start.toISOString(), date_to: end.toISOString() };
        case 'tonight':
            start.setHours(17, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { date_from: start.toISOString(), date_to: end.toISOString() };
        case 'weekend': {
            const day = now.getDay();
            const diffToSat = (6 - day + 7) % 7;
            const sat = new Date(now); sat.setDate(now.getDate() + diffToSat); sat.setHours(0, 0, 0, 0);
            const sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(23, 59, 59, 999);
            return { date_from: sat.toISOString(), date_to: sun.toISOString() };
        }
        case 'next7':
            end.setDate(now.getDate() + 7);
            return { date_from: start.toISOString(), date_to: end.toISOString() };
        case 'month':
            end.setMonth(now.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
            return { date_from: start.toISOString(), date_to: end.toISOString() };
        case 'thisyear': {
            const yStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            const yEnd   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            return { date_from: yStart.toISOString(), date_to: yEnd.toISOString() };
        }
        case 'afteryear': {
            const nextJan1 = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
            return { date_from: nextJan1.toISOString() };
        }
        default:
            return {};
    }
}

/* Small, tappable popup card used inside Leaflet Popup */
function EventPopupCard({ ev, onOpen }) {
    const organizer = ev.organizer || {};
    const when = new Date(ev.start_datetime).toLocaleString([], {
        dateStyle: 'medium', timeStyle: 'short',
    });
    const where = [ev.venue_name, ev.address, ev.city, ev.county].filter(Boolean).join(', ');
    return (
        <Card onClick={onOpen} sx={{ borderRadius: 2, cursor: 'pointer', minWidth: 260, maxWidth: 360 }}>
            <CardHeader
                avatar={<Avatar src={organizer.avatar_url || organizer.profile_picture || ''} />}
                title={
                    <Typography variant="subtitle1" fontWeight={600}>
                        {organizer.first_name || ''} {organizer.last_name || ''}
                    </Typography>
                }
                subheader={organizer.handle ? `@${organizer.handle}` : ''}
                sx={{ pb: 0.5 }}
            />
            <CardContent sx={{ pt: 0.5 }}>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{ev.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{when}</Typography>
                {where && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, color: 'text.secondary' }}>
                        <LocationOnIcon fontSize="small" />
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {where}
                        </Typography>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
}

export default function EventsPage() {
    const navigate = useNavigate();
    const mapRef = useRef(null);

    /* user is optional (for “New Event” gating) */
    const [user, setUser] = useState(null);
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;
        fetch(`${API_BASE}/users/profile`, { signal: ac.signal, credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((u) => { if (alive) setUser(u?.user || u || null); })
            .catch(() => { if (alive) setUser(null); });
        return () => { alive = false; ac.abort(); };
    }, []);

    /* UI state */
    const [showFilters, setShowFilters] = useState(true);
    const [hoveredId, setHoveredId] = useState(null);
    const [openedPopupId, setOpenedPopupId] = useState(null);

    /* filters */
    const [filters, dispatch] = useReducer(filterReducer, initialFilters);
    const { search, category, sort, dateRange, city: selectedCity, county: selectedCounty } = filters;

    /* map pan/zoom when city/county filter changes */
    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
    useEffect(() => {
        if (selectedCity) {
            const obj = cityData.find((c) => c.name === selectedCity);
            if (obj) { setCenter(obj.coordinates); setZoomLevel(13); }
        } else if (selectedCounty) {
            const obj = countyData.find((c) => c.name === (selectedCounty.endsWith(' County') ? selectedCounty : `${selectedCounty} County`));
            if (obj) { setCenter(obj.coordinates); setZoomLevel(10); }
        } else {
            setCenter(DEFAULT_CENTER);
            setZoomLevel(DEFAULT_ZOOM);
        }
    }, [selectedCity, selectedCounty]);

    /* city↔county helpers */
    const cityToCounty = useMemo(() => {
        const m = {};
        cityCountyMap.forEach(({ name, county }) => { m[name] = county.replace(/ County$/, ''); });
        return m;
    }, []);
    const availableCities = useMemo(
        () => selectedCounty ? cityData.filter((c) => cityToCounty[c.name] === selectedCounty).map((c) => c.name) : cityData.map((c) => c.name),
        [selectedCounty, cityToCounty]
    );
    const availableCounties = useMemo(() => countyData.map((c) => c.name.replace(/ County$/, '')), []);

    /* fetch events + build GeoJSON */
    const [isLoading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [points, setPoints] = useState({ type: 'FeatureCollection', features: [] });

    const refetch = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search)   params.set('q', search);
            if (category) params.set('category', category);
            if (selectedCounty) params.set('county', selectedCounty);
            if (selectedCity)   params.set('city', selectedCity);
            const { date_from, date_to } = rangeToISO(dateRange);
            if (date_from) params.set('date_from', date_from);
            if (date_to)   params.set('date_to', date_to);

            params.set('sort', sort === 'newest' ? 'new' : 'popular');
            params.set('limit', '400');

            const url = `${API_BASE}/api/events?${params.toString()}`;
            const res = await fetch(url, { credentials: 'include' });
            const j = await res.json();

            const items = Array.isArray(j.items) ? j.items : [];
            setEvents(items);

            const geo = {
                type: 'FeatureCollection',
                features: items
                    .filter((e) => e.lat && e.lng)
                    .map((e) => ({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [Number(e.lng), Number(e.lat)] },
                        properties: { id: `e${e.id}`, category: 'event' } // EventMap uses "event" → discussion pin
                    }))
            };
            setPoints(geo);
        } catch (e) {
            console.error('Events load failed', e);
            setEvents([]);
            setPoints({ type: 'FeatureCollection', features: [] });
        } finally {
            setLoading(false);
        }
    }, [search, category, selectedCounty, selectedCity, dateRange, sort]);

    useEffect(() => { refetch(); }, [refetch]);

    /* popup nodes keyed by e{id} */
    const popupContentById = useMemo(() => {
        const m = {};
        events.forEach((ev) => {
            const id = `e${ev.id}`;
            m[id] = <EventPopupCard ev={ev} onOpen={() => navigate(`/events/${ev.id}`)} />;
        });
        return m;
    }, [events, navigate]);

    /* marker click → pan + open popup */
    const handleMarkerClick = useCallback((id) => {
        const feat = points.features.find((f) => f.properties.id === id);
        if (!feat) return;
        const [lng, lat] = feat.geometry.coordinates;
        setCenter([lat + 0.02, lng]);
        setZoomLevel(14);
        setOpenedPopupId(id);
    }, [points]);

    /* card location click → precise, else city/county center (and open popup if precise) */
    const handleLocationClick = useCallback((lat, lng, eventId, cityName, countyName) => {
        const latNum = Number(lat);
        const lngNum = Number(lng);
        if (!Number.isNaN(latNum) && !Number.isNaN(lngNum) && lat != null && lng != null) {
            setCenter([latNum, lngNum]);
            setZoomLevel(15);
            if (eventId) setOpenedPopupId(`e${eventId}`);
            return;
        }
        if (cityName) {
            const c = cityData.find((x) => x.name === cityName);
            if (c?.coordinates) { setCenter(c.coordinates); setZoomLevel(13); setOpenedPopupId(null); return; }
        }
        if (countyName) {
            const name = countyName.endsWith(' County') ? countyName : `${countyName} County`;
            const k = countyData.find((x) => x.name === name);
            if (k?.coordinates) { setCenter(k.coordinates); setZoomLevel(10); setOpenedPopupId(null); return; }
        }
    }, []);

    const onCardClick = (ev) => navigate(`/events/${ev.id}`);

    return (
        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} height="91vh" overflow="hidden">
            {/* Panel (LEFT on md+, TOP on xs) */}
            <Box width={{ xs: '100%', md: '65%' }} p={2} pb={0} sx={{ overflowY: 'auto' }}>
                <EventsPanel
                    user={user}
                    events={events}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onCardClick={onCardClick}
                    onLocationClick={handleLocationClick}
                    /* filter props */
                    searchTerm={filters.search}
                    onSearchTermChange={(v) => dispatch({ type: 'search', value: v })}
                    onSearchClick={refetch}
                    onClearClick={() => {
                        dispatch({ type: 'search', value: '' });
                        dispatch({ type: 'category', value: '' });
                        dispatch({ type: 'sort', value: 'newest' });
                        dispatch({ type: 'dateRange', value: 'all' });
                        dispatch({ type: 'city', value: '' });
                        dispatch({ type: 'county', value: '' });
                        refetch();
                    }}
                    filteredCities={availableCities}
                    filteredCounties={availableCounties}
                    selectedCity={selectedCity}
                    onCityChange={(val) => {
                        dispatch({ type: 'city', value: val });
                        if (!val) return;
                        const county = (cityToCounty[val] || '').replace(/ County$/, '');
                        if (county) dispatch({ type: 'county', value: county });
                    }}
                    selectedCounty={selectedCounty}
                    onCountyChange={(val) => {
                        dispatch({ type: 'county', value: val });
                        if (!val) dispatch({ type: 'city', value: '' });
                    }}
                    selectedCategory={category}
                    onCategoryChange={(val) => { dispatch({ type: 'category', value: val }); refetch(); }}
                    selectedSort={sort}
                    onSortChange={(val) => { dispatch({ type: 'sort', value: val }); refetch(); }}
                    selectedDateRange={dateRange}
                    onDateRangeChange={(val) => { dispatch({ type: 'dateRange', value: val }); refetch(); }}
                    showFilters={showFilters}
                    onToggleFilters={() => setShowFilters((f) => !f)}
                    onCreated={() => refetch()}
                />
                {isLoading && <CircularProgress size={48} sx={{ position: 'absolute', top: 32, left: 32 }} />}
            </Box>

            {/* Map (RIGHT on md+, BOTTOM on xs) */}
            <Box width={{ xs: '100%', md: '35%' }} mt={{ xs: 0, md: 6 }} p={2} position="relative" minHeight={{ xs: 300, md: 'auto' }}>
                <EventMap
                    data={points}
                    mapRef={mapRef}
                    center={center}
                    zoomLevel={zoomLevel}
                    hoveredId={hoveredId != null ? `e${hoveredId}` : null}   // bounce on card hover
                    onMarkerClick={handleMarkerClick}
                    openedPopupId={openedPopupId}
                    popupContentById={popupContentById}
                    onPopupClose={() => setOpenedPopupId(null)}
                />
            </Box>
        </Box>
    );
}
