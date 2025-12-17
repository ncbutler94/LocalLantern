import React, {
    useEffect,
    useMemo,
    useState,
    useRef,
    useCallback,
} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    IconButton,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';

import JobsList from './JobsList';
import JobsMap from './JobsMap';
import JobsFilter from './JobsFilter';
import CreateJobModal from './CreateJobModal';
import { useAuth } from '../../components/AuthModalContext';

const DEFAULT_CENTER = [32.806671, -86.79113]; // Alabama
const DEFAULT_ZOOM = 7.5;

function toPoints(jobs = []) {
    return {
        type: 'FeatureCollection',
        features: jobs
            .filter(
                (j) =>
                    j &&
                    j.latitude != null &&
                    j.longitude != null &&
                    !Number.isNaN(Number(j.latitude)) &&
                    !Number.isNaN(Number(j.longitude))
            )
            .map((j) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [Number(j.longitude), Number(j.latitude)],
                },
                properties: {
                    id: j.id,
                    title: j.title,
                },
            })),
    };
}

export default function JobsPage() {
    /* ───────────────── state ───────────────── */
    const mapRef = useRef(null);

    const [user, setUser] = useState(null);
    const [loadingUser, setLoadingUser] = useState(true);

    const [filters, setFilters] = useState({
        search: '',
        sort: 'newest',
        category: '',
        type: '',
        experience: '',
        pay: '',
        county: '',
        city: '',
        remote: false,
        view: 'all',
    });

    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);

    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
    const [hoveredId, setHoveredId] = useState(null);
    const [openedPopupId, setOpenedPopupId] = useState(null);

    const [createOpen, setCreateOpen] = useState(false);

    const { open: openAuthModal } = useAuth();

    /* ───────────────── user (same approach we use on Community) ───────────────── */
    useEffect(() => {
        const ac = new AbortController();
        fetch('/users/profile', { signal: ac.signal })
            .then((r) => (r.ok ? r.json() : null))
            .then((u) => setUser(u))
            .catch(() => setUser(null))
            .finally(() => setLoadingUser(false));
        return () => ac.abort();
    }, []);

    /* ───────────────── query string helper ───────────────── */
    const qs = useMemo(() => {
        const p = new URLSearchParams();
        if (filters.search) p.set('search', filters.search);
        if (filters.sort) p.set('sort', filters.sort);
        if (filters.category) p.set('category', filters.category);
        if (filters.type) p.set('type', filters.type);
        if (filters.experience) p.set('experience', filters.experience);
        if (filters.pay) {
            // backend still accepts min/max; single pay maps to min only for filtering
            p.set('minPay', String(filters.pay));
        }
        if (filters.county) p.set('county', filters.county);
        if (filters.city) p.set('city', filters.city);
        if (filters.remote) p.set('remote', '1');
        if (filters.view) p.set('view', filters.view);
        return p.toString();
    }, [filters]);

    /* ───────────────── fetch jobs ───────────────── */
    const refetch = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/jobs?${qs}`);
            const j = await res.json();
            setJobs(Array.isArray(j) ? j : []);
        } catch {
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [qs]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    /* ───────────────── map helpers ───────────────── */
    const points = useMemo(() => toPoints(jobs), [jobs]);

    const popupContentById = useMemo(() => {
        const m = new Map();
        (jobs || []).forEach((job) => {
            const node = (
                <Box sx={{ p: 1, maxWidth: 260 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {job.title}
                    </Typography>
                    {!!job.employer && (
                        <Typography variant="body2" color="text.secondary">
                            {job.employer}
                        </Typography>
                    )}
                    {!!job.city || !!job.county ? (
                        <Typography variant="caption" color="text.secondary">
                            {[job.city, job.county && /\bcounty\b/i.test(job.county) ? job.county : job.county ? `${job.county} County` : '']
                                .filter(Boolean)
                                .join(', ')}
                        </Typography>
                    ) : null}
                </Box>
            );
            m.set(String(job.id), node);
            m.set(job.id, node);
        });
        return m;
    }, [jobs]);

    const handleMarkerClick = useCallback((id) => {
        setOpenedPopupId(id);
    }, []);

    const handleLocationClick = useCallback((job) => {
        const lat = Number(job.latitude);
        const lng = Number(job.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setCenter([lat + 0.02, lng]); // nudge so popup doesn’t cover marker
            setZoomLevel(14);
            setOpenedPopupId(job.id);
            return;
        }
        // fallback: center to city/county was already handled elsewhere; keep defaults here
    }, []);

    /* ───────────────── new job: gated like Community ───────────────── */
    const openCreate = () => {
        if (loadingUser) return; // wait until we know
        if (!user) {
            openAuthModal?.(); // prompt sign‑in
            return;
        }
        setCreateOpen(true);
    };

    const handleCreated = async () => {
        setCreateOpen(false);
        await refetch();
    };

    /* ───────────────── render ───────────────── */
    return (
        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} height="91vh" overflow="hidden">
            {/* Left: filters + list */}
            <Box width={{ xs: '100%', sm: '55%', md: '60%', lg: '65%' }} p={2} pb={0} sx={{ overflowY: 'auto' }}>
                <JobsFilter
                    values={filters}
                    onChange={(patch) => setFilters((s) => ({ ...s, ...patch }))}
                    onSearch={refetch}
                    onClear={() =>
                        setFilters({
                            search: '',
                            sort: 'newest',
                            category: '',
                            type: '',
                            experience: '',
                            pay: '',
                            county: '',
                            city: '',
                            remote: false,
                            view: 'all',
                        })
                    }
                />

                <Box
                    sx={{
                        mt: 1.5,
                        mb: 1,
                        px: 2,
                        py: 1,
                        borderRadius: 1,
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 'auto' }}>
                        Job Openings
                    </Typography>
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
                        New Job
                    </Button>
                </Box>

                <JobsList
                    jobs={jobs}
                    loading={loading}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onLocationClick={handleLocationClick}
                    onCardClick={() => {}}
                />
            </Box>

            {/* Right: map */}
            <Box
                width={{ xs: '100%', sm: '45%', md: '40%', lg: '35%' }}
                mt={{ xs: 0, md: 6 }}
                p={2}
                position="relative"
                minHeight={{ xs: 300, md: 'auto' }}
            >
                <JobsMap
                    data={points}
                    center={center}
                    zoomLevel={zoomLevel}
                    openedPopupId={openedPopupId}
                    popupContentById={popupContentById}
                    onMarkerClick={handleMarkerClick}
                    onPopupClose={() => setOpenedPopupId(null)}
                />
                {(loading || loadingUser) && (
                    <CircularProgress size={48} sx={{ position: 'absolute', top: 32, left: 32 }} />
                )}
            </Box>

            {/* Create Job – keep this as a true modal (no outside click close) */}
            <Dialog
                open={createOpen}
                onClose={(_, reason) => {
                    if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
                    setCreateOpen(false);
                }}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { position: 'relative' } }}
            >
                {/* You said this dialog has a Cancel button, so we keep the X hidden.
            If you ever want the X, just uncomment the IconButton below. */}
                {/* <IconButton
          onClick={() => setCreateOpen(false)}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
          aria-label="Close"
        >
          <CloseIcon />
        </IconButton> */}
                <CreateJobModal onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
            </Dialog>
        </Box>
    );
}
