// src/pages/CommunityPage.jsx
// ============================================================================
// Community main page with deep-link support: /community?post=:id
// - Auto-opens the matched post in the detail modal
// - Auto-scrolls the side list to the corresponding card
// - Resets filters once if needed to ensure the post is visible
// - Safe effects (AbortController + timeouts cleanup)
// ============================================================================

import React, {
    useState,
    useMemo,
    useEffect,
    useCallback,
    useReducer,
    useRef,
} from 'react';
import { useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import MapView from '../components/Map/MapView';
import CommunityPanel from '../components/SidePanel/Community/CommunityPanel';
import NewPostDialogs from '../components/SidePanel/Community/NewCommunityPosts/NewPostDialogs';
import { PostCard } from '../components/SidePanel/Community/CommunityList';
import PostDetailModal from '../components/SidePanel/Community/PostDetailModal';

import useCommunityData from '../hooks/community/useCommunityData';

import cityData from '../data/alabamaCities.json';
import countyData from '../data/alabamaCounties.json';
import cityCountyMap from '../data/cityCountyMap.json';

/* ---------- map defaults ---------- */
const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

/* ---------- slug helpers ---------- */
const SLUG_MAP = {
    announcements: 'announcement',
    'recommendations-tips': 'recommendation',
    'volunteer-help': 'volunteer-requests',
    'volunteer-help-requests': 'volunteer-requests',
    volunteer: 'volunteer-requests',
    'help-requests': 'volunteer-requests',
};
const normalizeSubtype = (s) => SLUG_MAP[s] ?? s;

/* ---------- reducer ---------- */
const initialFilters = {
    search: '',
    view: 'all',
    subtype: '',
    sort: 'newest',
    dateRange: 'all',
    city: '',
    county: '',
};
function filterReducer(state, { type, value }) {
    return { ...state, [type]: value };
}

export default function CommunityPage() {
    /* ---------- refs ---------- */
    const mapRef = useRef(null);
    const markerRefs = useRef({});
    const openPopupTimeoutRef = useRef(null);
    const deepLinkTimeoutRef = useRef(null);
    const deepLinkScrolledRef = useRef(false);
    const deepLinkResetOnceRef = useRef(false);

    /* ---------- user ---------- */
    const [user, setUser] = useState(null);
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;
        fetch('/users/profile', { signal: ac.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((u) => {
                if (alive) setUser(u);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError' && alive) setUser(null);
            });
        return () => {
            alive = false;
            ac.abort();
        };
    }, []);

    /* ---------- UI state ---------- */
    const [openedPopupId, setOpenedPopupId] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);
    const [showFilters, setShowFilters] = useState(true);
    const [stepOneOpen, setStepOneOpen] = useState(false);
    const [stepTwoOpen, setStepTwoOpen] = useState(false);
    const [stepOneData, setStepOneData] = useState(null);
    const [selectedPost, setSelectedPost] = useState(null);

    /* ---------- filters ---------- */
    const [filters, dispatch] = useReducer(filterReducer, initialFilters);
    const {
        search,
        view,
        subtype,
        sort,
        dateRange,
        city: selectedCity,
        county: selectedCounty,
    } = filters;

    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);

    /* ---------- city⇄county helpers ---------- */
    const cityToCounty = useMemo(() => {
        const m = {};
        cityCountyMap.forEach(({ name, county }) => {
            m[name] = county.replace(/ County$/, '');
        });
        return m;
    }, []);

    const availableCities = useMemo(
        () =>
            selectedCounty
                ? cityData
                    .filter((c) => cityToCounty[c.name] === selectedCounty)
                    .map((c) => c.name)
                : cityData.map((c) => c.name),
        [selectedCounty, cityToCounty]
    );
    const availableCounties = useMemo(
        () => countyData.map((c) => c.name),
        []
    );

    /* ---------- map pan/zoom on city/county change ---------- */
    useEffect(() => {
        if (selectedCity) {
            const obj = cityData.find((c) => c.name === selectedCity);
            if (obj) {
                setCenter(obj.coordinates);
                setZoomLevel(13);
            }
        } else if (selectedCounty) {
            const obj = countyData.find((c) => c.name === selectedCounty);
            if (obj) {
                setCenter(obj.coordinates);
                setZoomLevel(10);
            }
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

    /* ---------- fetch posts & marker geojson ---------- */
    const { posts: communityPosts, points, isLoading, refetch } = useCommunityData({
        search,
        view,
        subtype: normalizeSubtype(subtype),
        sort,
        dateRange,
        city: selectedCity,
        county: selectedCounty,
    });

    /* ---------- client-side list filter ---------- */
    const filteredPosts = useMemo(() => {
        const term = search.trim().toLowerCase();

        return communityPosts.filter((post) => {
            if (selectedCounty && post.county !== selectedCounty) return false;
            if (selectedCity) {
                if (post.city && post.city !== selectedCity) return false;
                if (!post.city && post.county !== selectedCounty) return false;
            }
            if (term) {
                const stop = new Set(['the', 'for', 'an', 'a', 'and', 'of', 'to', 'in', 'on']);
                const words = term
                    .split(/\s+/)
                    .filter((w) => w && !stop.has(w));
                if (words.length) {
                    const haystack = (
                        `${post.title ?? ''} ${post.description ?? ''} ${post.body ?? ''}`
                    ).toLowerCase();
                    if (!words.some((w) => haystack.includes(w))) return false;
                }
            }
            if (dateRange !== 'all') {
                const then = new Date(post.posted_at || post.date_created).getTime();
                if (!then) return false;
                const delta = Date.now() - then;
                if (dateRange === '24h') return delta <= 86_400_000;
                if (dateRange === '7d') return delta <= 604_800_000;
                if (dateRange === '30d') return delta <= 2_592_000_000;
            }
            return true;
        });
    }, [communityPosts, selectedCity, selectedCounty, dateRange, search]);

    /* ---------- card click (modal opener) ---------- */
    const handleCardClick = useCallback((post) => {
        setSelectedPost(post);
        setOpenedPopupId(null); // hide any open map popup
    }, []);

    /* ---------- popup content ---------- */
    const popupContentById = useMemo(() => {
        const m = {};
        filteredPosts.forEach((post) => {
            const key = `c${post.id}`;
            m[key] = (
                <PostCard
                    post={post}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onLocationClick={() => markerRefs.current[key]?.openPopup()}
                    onCardClick={handleCardClick}
                />
            );
        });
        return m;
    }, [filteredPosts, hoveredId, handleCardClick]);

    /* ---------- marker click ---------- */
    const handleMarkerClick = useCallback(
        (id) => {
            const feat = points.features.find((f) => f.properties.id === id);
            if (!feat) return;
            const [lng, lat] = feat.geometry.coordinates;
            setCenter([lat + 0.02, lng]); // bump slightly so popup isn't under cursor
            setZoomLevel(14);
            setOpenedPopupId(id);
            if (openPopupTimeoutRef.current) clearTimeout(openPopupTimeoutRef.current);
            openPopupTimeoutRef.current = setTimeout(() => {
                markerRefs.current[id]?.openPopup();
            }, 200);
        },
        [points]
    );

    /* ---------- new-post flow ---------- */
    const openStepOne = () => setStepOneOpen(true);
    const handleCategoryChosen = (d) => {
        setStepOneData(d);
        setStepOneOpen(false);
        setStepTwoOpen(true);
    };
    const handlePostSubmit = async () => {
        await refetch();
        setStepTwoOpen(false);
    };

    /* ---------- categories ---------- */
    const [categories, setCategories] = useState([]);
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;
        fetch('/api/community/categories', { signal: ac.signal })
            .then((r) => r.json())
            .then((data) => {
                if (alive) setCategories(data);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError') console.error(err);
            });
        return () => {
            alive = false;
            ac.abort();
        };
    }, []);

    /* ---------- DEEP-LINK support: /community?post=:id ---------- */
    const location = useLocation();
    const deepPostId = useMemo(() => {
        const s = new URLSearchParams(location.search);
        const id = s.get('post');
        return id ? String(id) : null;
    }, [location.search]);

    // scroll helper
    const tryScrollToCard = useCallback((id) => {
        if (!id || deepLinkScrolledRef.current) return;
        const selectors = [
            `[data-post-id="${id}"]`,
            `#post-${id}`,
            `[data-id="${id}"]`,
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                deepLinkScrolledRef.current = true;
                break;
            }
        }
    }, []);

    // open detail when the deep link is present
    useEffect(() => {
        if (!deepPostId) return;
        // If the post is already open to that id, bail
        if (selectedPost && String(selectedPost.id) === deepPostId) return;

        // 1) if post is already in current data, open it
        const found = communityPosts.find((p) => String(p.id) === deepPostId);
        if (found) {
            setSelectedPost(found);
            if (deepLinkTimeoutRef.current) clearTimeout(deepLinkTimeoutRef.current);
            deepLinkTimeoutRef.current = setTimeout(() => tryScrollToCard(deepPostId), 250);
            return;
        }

        // 2) If not found and we’re not loading, reset filters once to broaden results and refetch
        if (!isLoading && !deepLinkResetOnceRef.current) {
            deepLinkResetOnceRef.current = true;
            dispatch({ type: 'search', value: '' });
            dispatch({ type: 'view', value: 'all' });
            dispatch({ type: 'subtype', value: '' });
            dispatch({ type: 'sort', value: 'newest' });
            dispatch({ type: 'dateRange', value: 'all' });
            dispatch({ type: 'city', value: '' });
            dispatch({ type: 'county', value: '' });
            // give state a tick to settle, then refetch
            setTimeout(() => {
                refetch();
            }, 0);
        }
    }, [
        deepPostId,
        communityPosts,
        isLoading,
        selectedPost,
        refetch,
        tryScrollToCard,
    ]);

    /* ---------- cleanup: pending timers ---------- */
    useEffect(() => {
        return () => {
            if (openPopupTimeoutRef.current) clearTimeout(openPopupTimeoutRef.current);
            if (deepLinkTimeoutRef.current) clearTimeout(deepLinkTimeoutRef.current);
        };
    }, []);

    /* ---------- render ---------- */
    return (
        <>
            <Box
                display="flex"
                flexDirection={{ xs: 'column', md: 'row' }}
                height="91vh"
                overflow="hidden"
            >
                {/* Side Panel (LEFT on md+, TOP on xs) */}
                <Box
                    width={{ xs: '100%', sm: '55%', md: '60%', lg: '65%' }}
                    p={2}
                    pb={0}
                    sx={{ overflowY: 'auto' }}
                >
                    <CommunityPanel
                        user={user}
                        posts={filteredPosts}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onCardClick={handleCardClick}
                        onLocationClick={handleLocationClick}
                        /* View & top filters */
                        selectedView={view}
                        onViewChange={(val) => {
                            dispatch({ type: 'view', value: val });
                            refetch();
                        }}
                        searchTerm={search}
                        onSearchTermChange={(val) =>
                            dispatch({ type: 'search', value: val })
                        }
                        onSearchClick={refetch}
                        onClearClick={() => {
                            dispatch({ type: 'search', value: '' });
                            dispatch({ type: 'view', value: 'all' });
                            dispatch({ type: 'subtype', value: '' });
                            dispatch({ type: 'sort', value: 'newest' });
                            dispatch({ type: 'dateRange', value: 'all' });
                            dispatch({ type: 'city', value: '' });
                            dispatch({ type: 'county', value: '' });
                            refetch();
                        }}
                        /* City/County filtering */
                        filteredCities={availableCities}
                        filteredCounties={availableCounties}
                        tempCity={selectedCity}
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
                        /* Categories/Subtype */
                        selectedSubtype={subtype}
                        subtypes={categories}
                        onSubtypeChange={(val) => {
                            dispatch({ type: 'subtype', value: val });
                            refetch();
                        }}
                        /* Sort & Date range */
                        selectedSort={sort}
                        sortOptions={[
                            { value: 'newest', label: 'Newest' },
                            { value: 'popular', label: 'Most Popular' },
                        ]}
                        onSortChange={(val) => {
                            dispatch({ type: 'sort', value: val });
                            refetch();
                        }}
                        selectedDateRange={dateRange}
                        dateRangeOptions={[
                            { value: 'all', label: 'All time' },
                            { value: '24h', label: 'Past 24h' },
                            { value: '7d', label: 'Past week' },
                            { value: '30d', label: 'Past month' },
                        ]}
                        onDateRangeChange={(val) => {
                            dispatch({ type: 'dateRange', value: val });
                            refetch();
                        }}
                        /* Filters pane visibility */
                        showFilters={showFilters}
                        onToggleFilters={() => setShowFilters((f) => !f)}
                        /* New post flow */
                        onNewPost={openStepOne}
                    />
                </Box>

                {/* Map Pane (RIGHT on md+, BOTTOM on xs) */}
                <Box
                    width={{ xs: '100%', sm: '45%', md: '40%', lg: '35%' }}
                    mt={{ xs: 0, md: 6 }}
                    p={2}
                    position="relative"
                    minHeight={{ xs: 300, md: 'auto' }}
                >
                    <MapView
                        data={points}
                        mapRef={mapRef}
                        markerRefs={markerRefs}
                        center={center}
                        zoomLevel={zoomLevel}
                        onMarkerClick={handleMarkerClick}
                        openedPopupId={openedPopupId}
                        popupContentById={popupContentById}
                        onPopupClose={() => setOpenedPopupId(null)}
                    />
                    {isLoading && (
                        <CircularProgress
                            size={48}
                            sx={{ position: 'absolute', top: 32, left: 32 }}
                        />
                    )}
                </Box>

                {/* new-post dialog flow */}
                <NewPostDialogs
                    stepOneOpen={stepOneOpen}
                    stepTwoOpen={stepTwoOpen}
                    stepOneData={stepOneData}
                    onClose1={() => setStepOneOpen(false)}
                    onClose2={() => setStepTwoOpen(false)}
                    onCategoryChosen={handleCategoryChosen}
                    onSubmit={handlePostSubmit}
                />
            </Box>

            {/* full-detail modal */}
            <PostDetailModal
                open={Boolean(selectedPost)}
                post={selectedPost}
                onClose={() => setSelectedPost(null)}
                currentUser={user}
            />
        </>
    );
}
