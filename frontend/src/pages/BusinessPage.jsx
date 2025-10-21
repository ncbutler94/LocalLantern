// src/pages/BusinessPage.jsx
import React, {
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    useCallback,
} from 'react';
import { Box, CircularProgress, Snackbar, Alert, Fade } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

import BusinessMap from '../components/Map/BusinessMap';
import BusinessPanel from '../components/SidePanel/Business/BusinessPanel';
import BusinessCard from '../components/SidePanel/Business/BusinessCard';
import AddBusinessModal from '../components/SidePanel/Business/AddBusinessModal';
import BusinessProfile from '../components/SidePanel/Business/BusinessProfile';

import useBusinessData from '../hooks/business/useBusinessData';

import cityData from '../data/alabamaCities.json';
import countyData from '../data/alabamaCounties.json';
import cityCountyMap from '../data/cityCountyMap.json';

const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

/* ---------- reducer ---------- */
const initialFilters = {
    search: '',
    category: '',
    sort: 'newest',
    city: '',
    county: '',
};
function filterReducer(state, { type, value }) {
    return { ...state, [type]: value };
}

export default function BusinessPage() {
    const { businessId } = useParams();
    const isProfileOpen = !!businessId;
    const navigate = useNavigate();

    const mapRef = useRef(null);
    const markerRefs = useRef({});
    const openPopupTimeoutRef = useRef(null);

    const [user, setUser] = useState(null);
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;
        fetch('/users/profile', { signal: ac.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((u) => { if (alive) setUser(u); })
            .catch(() => { if (alive) setUser(null); })
            .finally(() => {});
        return () => { alive = false; ac.abort(); };
    }, []);

    const [openedPopupId, setOpenedPopupId] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);
    const [showFilters, setShowFilters] = useState(true);

    const [filters, dispatch] = useReducer(filterReducer, initialFilters);
    const {
        search, category, sort, city: selectedCity, county: selectedCounty,
    } = filters;

    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);

    const cityToCounty = useMemo(() => {
        const m = {};
        cityCountyMap.forEach(({ name, county }) => { m[name] = county.replace(/ County$/, ''); });
        return m;
    }, []);
    const availableCities = useMemo(
        () => (selectedCounty
            ? cityData.filter((c) => cityToCounty[c.name] === selectedCounty).map((c) => c.name)
            : cityData.map((c) => c.name)),
        [selectedCounty, cityToCounty]
    );
    const availableCounties = useMemo(() => countyData.map((c) => c.name), []);

    useEffect(() => {
        if (selectedCity) {
            const obj = cityData.find((c) => c.name === selectedCity);
            if (obj) { setCenter(obj.coordinates); setZoomLevel(13); }
        } else if (selectedCounty) {
            const obj = countyData.find((c) => c.name === selectedCounty);
            if (obj) { setCenter(obj.coordinates); setZoomLevel(10); }
        } else {
            setCenter(DEFAULT_CENTER);
            setZoomLevel(DEFAULT_ZOOM);
        }
    }, [selectedCity, selectedCounty]);

    const handleLocationClick = useCallback((lat, lng, level = 'city') => {
        setCenter([lat, lng]);
        const ZOOM = { address: 17, city: 14, county: 10 };
        setZoomLevel(ZOOM[level] ?? 14);
    }, []);

    const { businesses, points, isLoading, refetch } = useBusinessData({
        search, city: selectedCity, county: selectedCounty, category, sort,
    });

    const filteredBusinesses = useMemo(() => {
        const term = search.trim().toLowerCase();
        return businesses.filter((b) => {
            if (selectedCounty && b.county !== selectedCounty) return false;
            if (selectedCity) {
                if (b.city && b.city !== selectedCity) return false;
                if (!b.city && b.county !== selectedCounty) return false;
            }
            if (category && b.category !== category) return false;
            if (term) {
                const stop = new Set(['the', 'for', 'an', 'a', 'and', 'of', 'to', 'in', 'on']);
                const words = term.split(/\s+/).filter((w) => w && !stop.has(w));
                if (words.length) {
                    const haystack = `${b.name ?? ''} ${b.description ?? ''}`.toLowerCase();
                    if (!words.some((w) => haystack.includes(w))) return false;
                }
            }
            return true;
        });
    }, [businesses, selectedCity, selectedCounty, category, search]);

    const handleCardClick = useCallback((biz) => {
        setOpenedPopupId(null);
        navigate(`/business/${biz.id}`);
    }, [navigate]);

    const popupContentById = useMemo(() => {
        const m = {};
        filteredBusinesses.forEach((biz) => {
            const key = `b${biz.id}`;
            m[key] = (
                <BusinessCard
                    biz={biz}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onLocationClick={() => markerRefs.current[key]?.openPopup()}
                    onCardClick={handleCardClick}
                />
            );
        });
        return m;
    }, [filteredBusinesses, hoveredId, handleCardClick]);

    const handleMarkerClick = useCallback((id) => {
        const feat = points.features.find((f) => f.properties.id === id);
        if (!feat) return;
        const [lng, lat] = feat.geometry.coordinates;
        setCenter([lat + 0.02, lng]);
        setZoomLevel(14);
        setOpenedPopupId(id);
        if (openPopupTimeoutRef.current) clearTimeout(openPopupTimeoutRef.current);
        openPopupTimeoutRef.current = setTimeout(() => {
            markerRefs.current[id]?.openPopup();
        }, 200);
    }, [points]);

    const categoriesList = useMemo(
        () => [
            'Coffee', 'Restaurant', 'Bakery', 'Bar/Nightlife', 'Grocery', 'Retail', 'Auto', 'Gas Station',
            'Home Services', 'Construction', 'HVAC', 'Plumbing', 'Electrical', 'Landscaping', 'Cleaning',
            'Tech/IT Services', 'Marketing/Advertising', 'Photography/Video', 'Salon/Barber', 'Spa & Wellness',
            'Gym', 'Healthcare/Clinic', 'Pharmacy', 'Pet Care', 'Childcare', 'Education/Tutoring', 'Nonprofit',
            'Church/Faith', 'Legal Services', 'Accounting/Tax', 'Real Estate', 'Travel & Tourism', 'Entertainment',
            'Arts & Crafts', 'Manufacturing', 'Agriculture', 'Transportation/Logistics', 'Other',
        ],
        []
    );

    const [addOpen, setAddOpen] = useState(false);
    const [toast, setToast] = useState({ open: false, msg: '' });

    const openAddBusiness = () => setAddOpen(true);
    const closeAddBusiness = () => setAddOpen(false);

    const handleSubmitted = useCallback(async () => {
        setToast({ open: true, msg: 'Business submitted. We’ll verify and publish it soon.' });
        await refetch();
    }, [refetch]);

    useEffect(() => {
        return () => { if (openPopupTimeoutRef.current) clearTimeout(openPopupTimeoutRef.current); };
    }, []);

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                height: '91vh',
                overflow: 'hidden',
            }}
        >
            {/* Side Panel */}
            <Box
                width={{ xs: '100%', sm: '55%', md: '60%', lg: '65%' }}
                p={2}
                pb={0}
                sx={{
                    overflowY: 'auto',
                    opacity: isProfileOpen ? 0 : 1,
                    pointerEvents: isProfileOpen ? 'none' : 'auto',
                    transition: 'opacity 180ms ease',
                }}
                aria-hidden={isProfileOpen ? 'true' : 'false'}
            >
                <BusinessPanel
                    user={user}
                    businesses={filteredBusinesses}
                    loading={isLoading}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onCardClick={handleCardClick}
                    onLocationClick={handleLocationClick}
                    onAddBusiness={openAddBusiness}
                    searchTerm={search}
                    onSearchTermChange={(val) => dispatch({ type: 'search', value: val })}
                    onSearchClick={refetch}
                    onClearClick={() => {
                        dispatch({ type: 'search', value: '' });
                        dispatch({ type: 'category', value: '' });
                        dispatch({ type: 'sort', value: 'newest' });
                        dispatch({ type: 'city', value: '' });
                        dispatch({ type: 'county', value: '' });
                        refetch();
                    }}
                    filteredCities={availableCities}
                    filteredCounties={availableCounties}
                    selectedCity={selectedCity}
                    onCityChange={(val) => {
                        dispatch({ type: 'city', value: val });
                        if (val) dispatch({ type: 'county', value: cityToCounty[val] || '' });
                    }}
                    selectedCounty={selectedCounty}
                    onCountyChange={(val) => {
                        dispatch({ type: 'county', value: val });
                        if (!val) dispatch({ type: 'city', value: '' });
                    }}
                    selectedCategory={category}
                    categories={categoriesList}
                    onCategoryChange={(val) => {
                        dispatch({ type: 'category', value: val });
                        refetch();
                    }}
                    selectedSort={sort}
                    sortOptions={[
                        { value: 'newest', label: 'Newest' },
                        { value: 'popular', label: 'Most Popular' },
                    ]}
                    onSortChange={(val) => {
                        dispatch({ type: 'sort', value: val });
                        refetch();
                    }}
                    showFilters={showFilters}
                    onToggleFilters={() => setShowFilters((f) => !f)}
                />
            </Box>

            {/* Map Pane */}
            <Box
                width={{ xs: '100%', sm: '45%', md: '40%', lg: '35%' }}
                mt={{ xs: 0, md: 6 }}
                p={2}
                position="relative"
                minHeight={{ xs: 300, md: 'auto' }}
                sx={{
                    opacity: isProfileOpen ? 0 : 1,
                    pointerEvents: isProfileOpen ? 'none' : 'auto',
                    transition: 'opacity 180ms ease',
                }}
                aria-hidden={isProfileOpen ? 'true' : 'false'}
            >
                <BusinessMap
                    data={points}
                    mapRef={mapRef}
                    markerRefs={markerRefs}
                    center={center}
                    zoomLevel={zoomLevel}
                    hoveredId={hoveredId}
                    onMarkerClick={handleMarkerClick}
                    openedPopupId={openedPopupId}
                    popupContentById={popupContentById}
                    onPopupClose={() => setOpenedPopupId(null)}
                />
                {isLoading && (
                    <CircularProgress size={48} sx={{ position: 'absolute', top: 32, left: 32 }} />
                )}
            </Box>

            {/* Add Business */}
            <AddBusinessModal
                open={addOpen}
                onClose={closeAddBusiness}
                onSubmitted={handleSubmitted}
                user={user}
                categories={categoriesList}
            />

            {/* Toast */}
            <Snackbar
                open={toast.open}
                autoHideDuration={3000}
                onClose={() => setToast({ open: false, msg: '' })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="success" variant="filled">
                    {toast.msg}
                </Alert>
            </Snackbar>

            {/* ─────────────── Overlay: fade to white, show Business Profile ─────────────── */}
            {!!businessId && (
                <Fade in timeout={220}>
                    <Box
                        sx={{
                            position: 'absolute', inset: 0, zIndex: 50,
                            bgcolor: 'common.white',
                            overflowY: 'auto',
                        }}
                    >
                        <BusinessProfile
                            businessId={businessId}
                            onBack={() => navigate('/business')}
                            user={user}
                        />
                    </Box>
                </Fade>
            )}
        </Box>
    );
}
