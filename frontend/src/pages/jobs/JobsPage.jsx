import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Dialog } from '@mui/material';
import JobsPanel from './JobsPanel';
import JobsMap from './JobsMap';
import CreateJobModal from './CreateJobModal';
import { useAuth } from '../../components/AuthModalContext';

const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

function toGeoJSON(list) {
    const rows = Array.isArray(list) ? list : [];
    return {
        type: 'FeatureCollection',
        features: rows
            .filter(r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)))
            .map(r => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude)] },
                properties: { id: r.id, title: r.title },
            })),
    };
}

export default function JobsPage() {
    // auth (like Community)
    const [user, setUser] = useState(null);
    useEffect(() => {
        const ac = new AbortController();
        fetch('/users/profile', { signal: ac.signal })
            .then(r => (r.ok ? r.json() : null))
            .then(setUser)
            .catch(() => setUser(null));
        return () => ac.abort();
    }, []);

    // filters (individual props)
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('newest');
    const [category, setCategory] = useState('');
    const [type, setType] = useState('');
    const [experience, setExperience] = useState('');
    const [payRange, setPayRange] = useState('');
    const [county, setCounty] = useState('');
    const [city, setCity] = useState('');
    const [remote, setRemote] = useState(false);

    // categories
    const [categories, setCategories] = useState([]);
    useEffect(() => {
        const ac = new AbortController();
        fetch('/api/jobs/categories', { signal: ac.signal })
            .then(r => r.json())
            .then(rows => setCategories(Array.isArray(rows) ? rows : []))
            .catch(() => setCategories([]));
        return () => ac.abort();
    }, []);

    // data
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);

    const buildQuery = useCallback(() => {
        const p = new URLSearchParams();
        if (search.trim()) p.set('search', search.trim());
        if (category) p.set('category', category);
        if (type) p.set('type', type);
        if (experience) p.set('experience', experience);

        if (payRange) {
            if (payRange.endsWith('-+')) {
                p.set('minPay', payRange.split('-')[0]);
            } else {
                const [min, max] = payRange.split('-');
                if (min) p.set('minPay', min);
                if (max) p.set('maxPay', max);
            }
        }

        if (remote) p.set('remote', '1'); else {
            if (county) p.set('county', county);
            if (city) p.set('city', city);
        }

        if (sort === 'mine') {
            p.set('view', 'mine');
            p.set('sort', 'newest');
        } else {
            p.set('sort', sort || 'newest');
        }
        p.set('limit', '60');
        return p.toString();
    }, [search, category, type, experience, payRange, county, city, remote, sort]);

    const refetch = useCallback(async () => {
        setLoading(true);
        try {
            const qs = buildQuery();
            const res = await fetch(`/api/jobs?${qs}`, { credentials: 'include' });
            const j = await res.json();
            setJobs(Array.isArray(j) ? j : []);
        } catch {
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [buildQuery]);

    useEffect(() => { refetch(); }, [refetch]);

    // map
    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
    const [openedPopupId, setOpenedPopupId] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);

    const points = useMemo(() => toGeoJSON(jobs), [jobs]);

    const handleLocationClick = useCallback((job) => {
        const lat = Number(job?.latitude);
        const lng = Number(job?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setCenter([lat, lng]);
            setZoomLevel(job?.street_address ? 16 : job?.city ? 14 : 10);
            setOpenedPopupId(job?.id);
        }
    }, []);

    // create modal (popup only)
    const [createOpen, setCreateOpen] = useState(false);
    const { open: openAuth } = useAuth();
    const onNewJob = () => {
        if (!user) return openAuth?.();
        setCreateOpen(true);
    };
    const onPosted = async () => { setCreateOpen(false); await refetch(); };

    // clear
    const onClearClick = () => {
        setSearch(''); setSort('newest'); setCategory(''); setType('');
        setExperience(''); setPayRange(''); setCounty(''); setCity(''); setRemote(false);
        refetch();
    };

    return (
        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} height="91vh" overflow="hidden">
            {/* Left: filters + list */}
            <Box width={{ xs: '100%', md: '60%', lg: '65%' }} p={2} pb={0} sx={{ overflowY: 'auto' }}>
                <JobsPanel
                    user={user}
                    categories={categories}
                    jobs={jobs}
                    loading={loading}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onLocationClick={handleLocationClick}
                    onCardClick={() => {}}
                    onNewJob={onNewJob}
                    /* individual props API */
                    search={search} setSearch={setSearch}
                    sort={sort} setSort={setSort}
                    category={category} setCategory={setCategory}
                    type={type} setType={setType}
                    experience={experience} setExperience={setExperience}
                    payRange={payRange} setPayRange={setPayRange}
                    county={county} setCounty={setCounty}
                    city={city} setCity={setCity}
                    remote={remote} setRemote={setRemote}
                    onSearchClick={refetch}
                    onClearClick={onClearClick}
                />
            </Box>

            {/* Right: map */}
            <Box width={{ xs: '100%', md: '40%', lg: '35%' }} mt={{ xs: 0, md: 6 }} p={2} position="relative" minHeight={{ xs: 300, md: 'auto' }}>
                <JobsMap
                    data={points}
                    center={center}
                    zoomLevel={zoomLevel}
                    openedPopupId={openedPopupId}
                    popupContentById={useMemo(() => new Map(), [])}
                    onMarkerClick={(id) => setOpenedPopupId(id)}
                    onPopupClose={() => setOpenedPopupId(null)}
                />
                {loading && <CircularProgress size={48} sx={{ position: 'absolute', top: 32, left: 32 }} />}
            </Box>

            {/* Create Job – popup only (no outside click close) */}
            <Dialog
                open={createOpen}
                onClose={(_, reason) => {
                    if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') setCreateOpen(false);
                }}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { position: 'relative' } }}
            >
                <CreateJobModal
                    onClose={() => setCreateOpen(false)}
                    onCreated={onPosted}
                    onPosted={onPosted}
                />
            </Dialog>
        </Box>
    );
}
