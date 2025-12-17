// src/pages/community/CommunityPage.jsx
// Fixed, no-window-scroll layout with a tabbed right-hand panel (Trending / Map / Posts),
// UPDATED (Trending):
//   • Right panel now shows category-level trending summaries (counts) based ONLY on the
//     selected location (county/city). Changing location updates Trending; other filters
//     don't affect it.
//   • Clicking a summary clears all filters, applies that category, sets Sort→Trending,
//     runs the search, and switches to the Posts tab.
// UPDATED (Sorting):
//   • "Sort by" includes a new "Trending" option; backend honors sort=trending.

import React, {
    useState,
    useMemo,
    useEffect,
    useCallback,
    useReducer,
    useRef,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
    Box,
    CircularProgress,
    Typography,
    Button,
    Tabs,
    Tab,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';

import CommunityMap from './CommunityMapView';
import CommunityPanel from './CommunityPanel';
import { PostCard } from './CommunityList';
import useCommunityData from '../../hooks/community/useCommunityData';
import PostDetailModal from './PostDetailModal';
import NewPostDialogs from './NewCommunityPosts/NewPostDialogs';

import cityData from '../../data/alabamaCities.json';
import countyData from '../../data/alabamaCounties.json';
import cityCountyMap from '../../data/cityCountyMap.json';

// Trending lantern icon (left of title)
import trendingLantern from '../../assets/trending.png';

const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

/** Right panel width (normal vs expanded on Posts tab) */
const RIGHT_WIDTH = { xs: '100%', sm: '45%', md: '40%', lg: '35%' };
const RIGHT_WIDTH_EXPANDED = { xs: '100%', sm: '52%', md: '48%', lg: '44%' };

const BOTTOM_GUTTER_PX = 0;
const APP_BACKGROUND = 'background.default';

const HEADER_H = { xs: 50, md: 56 };

const ZOOM_BY_LEVEL = { address: 16, city: 14, county: 10 };

/* ---------- slug helpers ---------- */
const SLUG_MAP = {
    announcements: 'announcement',
    'volunteer-help': 'volunteer-requests',
    'volunteer-help-requests': 'volunteer-requests',
    recommendation: 'recommendations-tips',
};
const normalizeSubtype = (s) => SLUG_MAP[s] ?? s;

/* ---------- reducer ---------- */
const initialFilters = {
    search: '',
    appliedSearch: '',
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

/* ---------- category colors/labels ---------- */
const CATEGORY_META = {
    announcement: { color: '#1e88e5', label: 'Announcements', noun: 'announcements' },
    announcements: { color: '#1e88e5', label: 'Announcements', noun: 'announcements' },
    discussion: { color: '#2e7d32', label: 'Discussions', noun: 'discussions' },
    'general-discussion': { color: '#2e7d32', label: 'Discussions', noun: 'discussions' },
    tips: { color: '#fdd835', label: 'Tips', noun: 'tips' },
    recommendations: { color: '#fdd835', label: 'Recommendations', noun: 'recommendations' },
    'recommendations-tips': { color: '#fdd835', label: 'Tips/Recommendations', noun: 'posts' },
    'help-requests': { color: '#0097a7', label: 'Help Requests', noun: 'requests' },
    volunteers: { color: '#0097a7', label: 'Volunteers', noun: 'volunteers' },
    'volunteer-requests': { color: '#0097a7', label: 'Volunteer/Help', noun: 'posts' },
    'lost-found': { color: '#fb8c00', label: 'Lost & Found', noun: 'items' },
    'lost-and-found': { color: '#fb8c00', label: 'Lost & Found', noun: 'items' },
    'public-safety-alerts': { color: '#e53935', label: 'Safety Alerts', noun: 'alerts' },
};

const deriveSplitCategory = (post) => {
    let cat = String(post?.category || '').toLowerCase();
    if (cat === 'recommendations-tips') {
        const rt = String(post?.rec_type || '').toLowerCase();
        if (rt === 'tip' || rt === 'tips') return 'tips';
        if (rt === 'recommendation' || rt === 'recommendations' || rt === 'business') return 'recommendations';
        return 'recommendations';
    }
    if (cat === 'volunteer-requests' || cat === 'volunteer-help-requests') {
        const kind = String(post?.request_kind || post?.requestKind || post?.help_type || '').toLowerCase();
        if (['help', 'request', 'help-request', 'help_request', 'need', 'ask'].includes(kind)) return 'help-requests';
        if (['volunteer', 'volunteering', 'offer', 'offers'].includes(kind)) return 'volunteers';
        return 'help-requests';
    }
    return cat || 'announcement';
};
const categoryColorOf = (post) => CATEGORY_META[deriveSplitCategory(post)]?.color || '#CBD5E1';

const getNum = (v) => Number(v ?? 0);
const pickCount = (...xs) => getNum(xs.find((x) => typeof x !== 'undefined'));

export default function CommunityPage() {
    /* ---------- window/body scroll lock + header measurement ---------- */
    const [chromeTop, setChromeTop] = useState(0);
    useEffect(() => {
        const prevHtml = document.documentElement.style.overflow;
        const prevBody = document.body.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        const measure = () => {
            const header =
                document.querySelector('header.MuiAppBar-root') ||
                document.querySelector('header') ||
                document.querySelector('.site-header') ||
                document.getElementById('header') ||
                null;
            const h = header ? header.getBoundingClientRect().bottom : 0;
            setChromeTop(h);
        };
        measure();
        window.addEventListener('resize', measure);
        const t = setTimeout(measure, 50);

        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', measure);
            document.documentElement.style.overflow = prevHtml;
            document.body.style.overflow = prevBody;
        };
    }, []);

    /* ---------- refs ---------- */
    const mapRef = useRef(null);

    // Fix: schedule refetch AFTER state commits (prevents “select twice”)
    const refetchTimerRef = useRef(null);
    const latestRefetchRef = useRef(null);

    // Used to force a popup re-open when switching tabs (Map tab should always show the selected post popup)
    const reopenPopupTimerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (refetchTimerRef.current) {
                clearTimeout(refetchTimerRef.current);
                refetchTimerRef.current = null;
            }
            if (reopenPopupTimerRef.current) {
                clearTimeout(reopenPopupTimerRef.current);
                reopenPopupTimerRef.current = null;
            }
        };
    }, []);

    const scheduleRefetch = useCallback(() => {
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => {
            refetchTimerRef.current = null;
            if (typeof latestRefetchRef.current === 'function') {
                latestRefetchRef.current();
            }
        }, 0);
    }, []);

    /* ---------- user ---------- */
    const [user, setUser] = useState(null);
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;
        fetch('/users/profile', { signal: ac.signal, credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((u) => {
                if (alive) setUser(u?.user || null);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError' && alive) setUser(null);
            });
        return () => {
            alive = false;
            ac.abort();
        };
    }, []);

    /* ---------- UI: active tab + selection ---------- */
    const [activeTab, setActiveTab] = useState('trending'); // 'trending' | 'map' | 'posts'
    const activeTabRef = useRef('trending');
    const setActiveTabSafe = useCallback((nextTab) => {
        activeTabRef.current = nextTab;
        setActiveTab(nextTab);
    }, []);

    const [selectedPost, setSelectedPost] = useState(null);
    const selectedPostId = selectedPost?.id ?? null;
    const [detailExpanded, setDetailExpanded] = useState(false);

    const clearSelection = useCallback(() => {
        setSelectedPost(null);
    }, []);

    /* ---------- filters ---------- */
    const [filters, dispatch] = useReducer(filterReducer, initialFilters);
    const {
        search,
        appliedSearch,
        view,
        subtype,
        sort,
        dateRange,
        city: selectedCity,
        county: selectedCounty,
    } = filters;

    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
    const [openedPopupId, setOpenedPopupId] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);

    // Cache for map popups when a marker exists but the corresponding post
    // isn't present in the current left feed result set.
    const [popupPostCache, setPopupPostCache] = useState(() => ({}));
    const popupFetchInFlightRef = useRef(new Set());

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
                ? cityData.filter((c) => cityToCounty[c.name] === selectedCounty).map((c) => c.name)
                : cityData.map((c) => c.name),
        [selectedCounty, cityToCounty]
    );
    const availableCounties = useMemo(() => countyData.map((c) => c.name), []);

    /* ---------- pan/zoom when city/county filters change ---------- */
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

    /* ---------- fetch posts & marker geojson ---------- */
    const { posts: communityPosts, points, isLoading, refetch } = useCommunityData({
        search: appliedSearch,
        view,
        subtype: normalizeSubtype(subtype),
        sort,
        dateRange,
        city: selectedCity,
        county: selectedCounty,
    });

    latestRefetchRef.current = refetch;

    /* ---------- list filter ---------- */
    const filteredPosts = useMemo(() => {
        const term = (appliedSearch || '').trim().toLowerCase();
        return (communityPosts || []).filter((post) => {
            if (selectedCounty && post.county !== selectedCounty) return false;
            if (selectedCity) {
                if (post.city && post.city !== selectedCity) return false;
                if (!post.city && post.county !== selectedCounty) return false;
            }
            if (term) {
                const stop = new Set(['the', 'for', 'an', 'a', 'and', 'of', 'to', 'in', 'on']);
                const words = term.split(/\s+/).filter((w) => w && !stop.has(w));
                if (words.length) {
                    const haystack = (`${post.title ?? ''} ${post.description ?? ''} ${post.body ?? ''}`).toLowerCase();
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
    }, [communityPosts, selectedCity, selectedCounty, dateRange, appliedSearch]);

    /* ---------- selection + map helpers ---------- */
    const getPointLatLngById = useCallback(
        (id) => {
            const idStr = id != null ? String(id) : '';
            if (!idStr) return null;
            const feat = points?.features?.find((f) => String(f?.properties?.id) === idStr);
            const coords = feat?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return null;
            const lng = Number(coords[0]);
            const lat = Number(coords[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return [lat, lng];
        },
        [points]
    );

    const ensurePopupPostLoaded = useCallback(
        async (id) => {
            const idStr = id != null ? String(id) : '';
            if (!idStr) return;

            // Already in current list or cache
            if ((filteredPosts || []).some((p) => String(p?.id) === idStr)) return;
            if (popupPostCache?.[idStr]) return;
            if (popupFetchInFlightRef.current.has(idStr)) return;

            popupFetchInFlightRef.current.add(idStr);
            try {
                const res = await fetch(`/api/community/${encodeURIComponent(idStr)}`, {
                    credentials: 'include',
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!data || data.id == null) return;

                setPopupPostCache((prev) => {
                    const next = { ...(prev || {}) };
                    next[idStr] = data;
                    return next;
                });

                // If the user is currently focused on this post, upgrade the selected post with full data.
                setSelectedPost((prev) => {
                    if (prev?.id == null) return prev;
                    return String(prev.id) === idStr ? data : prev;
                });
            } catch {
                // swallow (we'll keep showing the lightweight loading state)
            } finally {
                popupFetchInFlightRef.current.delete(idStr);
            }
        },
        [filteredPosts, popupPostCache]
    );

    const focusMapForPost = useCallback(
        (post, latLngOverride) => {
            const p = post || {};
            const idStr = p?.id != null ? String(p.id) : null;

            // Prefer the exact marker click latLng if provided (accounts for de-stacked markers)
            if (latLngOverride && Number.isFinite(latLngOverride.lat) && Number.isFinite(latLngOverride.lng)) {
                const POPUP_LAT_OFFSET = 0.01; // try 0.01 first, then 0.02 if needed
                setCenter([latLngOverride.lat + POPUP_LAT_OFFSET, latLngOverride.lng]);
                setZoomLevel(ZOOM_BY_LEVEL.city);
                return;
            }

            // If we can get lat/lng from the points geojson (best for consistency)
            if (idStr) {
                const pt = getPointLatLngById(idStr);
                if (pt) {
                    setCenter(pt);
                    setZoomLevel(ZOOM_BY_LEVEL.city);
                    return;
                }
            }

            // Otherwise fall back to the post itself (direct lat/lng), then city/county coords.
            const lat = Number(p.latitude ?? p.lat);
            const lng = Number(p.longitude ?? p.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                setCenter([lat, lng]);
                setZoomLevel(p.street_address ? ZOOM_BY_LEVEL.address : ZOOM_BY_LEVEL.city);
                return;
            }

            if (p.city) {
                const cityObj = cityData.find((c) => c.name === p.city);
                if (cityObj?.coordinates) {
                    setCenter(cityObj.coordinates);
                    setZoomLevel(ZOOM_BY_LEVEL.city);
                    return;
                }
            }

            if (p.county) {
                const countyName = String(p.county).replace(/ County$/i, '');
                const countyObj = countyData.find((c) => c.name === countyName);
                if (countyObj?.coordinates) {
                    setCenter(countyObj.coordinates);
                    setZoomLevel(ZOOM_BY_LEVEL.county);
                }
            }
        },
        [getPointLatLngById]
    );

    const handleLocationClick = useCallback(
        (arg1, arg2, levelArg) => {
            setActiveTabSafe('map');
            setDetailExpanded(false);

            // Keep the clicked post "selected" even when switching to Map,
            // so returning to the Posts tab still shows the same details.
            if (arg1 && typeof arg1 === 'object' && arg1.id != null) {
                setSelectedPost((prev) => {
                    const prevId = prev?.id;
                    const nextId = arg1.id;
                    return prevId != null && String(prevId) === String(nextId) ? prev : arg1;
                });
            }

            // numeric signature: (lat, lng, level)
            if (typeof arg1 === 'number' && typeof arg2 === 'number') {
                const level = levelArg || 'city';
                setCenter([arg1, arg2]);
                setZoomLevel(ZOOM_BY_LEVEL[level] ?? ZOOM_BY_LEVEL.city);
                setOpenedPopupId(null);
                return;
            }

            const post = arg1 || {};
            const idStr = post?.id != null ? String(post.id) : null;
            if (idStr) void ensurePopupPostLoaded(idStr);
            focusMapForPost(post);
            setOpenedPopupId(idStr);
        },
        [ensurePopupPostLoaded, focusMapForPost, setActiveTabSafe]
    );

    const onCardClick = useCallback(
        (post) => {
            if (!post) return;

            setSelectedPost(post);
            setActiveTabSafe('posts');
            setDetailExpanded(false);

            const idStr = post?.id != null ? String(post.id) : null;
            setOpenedPopupId(idStr);
            if (idStr) void ensurePopupPostLoaded(idStr);
            focusMapForPost(post);
        },
        [ensurePopupPostLoaded, focusMapForPost, setActiveTabSafe]
    );

    const handleMarkerClick = useCallback(
        (id, latLng) => {
            const idStr = id != null ? String(id) : null;
            if (!idStr) return;

            const fromList = (filteredPosts || []).find((p) => String(p?.id) === idStr) || null;
            const fromCache = popupPostCache?.[idStr] || null;
            const post = fromList || fromCache || { id: idStr };
            if (fromList || fromCache) setSelectedPost(post);

            setOpenedPopupId(idStr);
            void ensurePopupPostLoaded(idStr);
            focusMapForPost(post, latLng);
        },
        [filteredPosts, popupPostCache, ensurePopupPostLoaded, focusMapForPost]
    );

    const popupContentById = useMemo(() => {
        const map = new Map();

        const addPost = (post) => {
            if (!post || post.id == null) return;
            const idStr = String(post.id);
            const node = (
                <PostCard
                    key={`popup-${idStr}`}
                    post={post}
                    user={user}
                    onLocationClick={handleLocationClick}
                    onCardClick={onCardClick}
                    onHover={() => setHoveredId(post.id)}
                    onUnhover={() => setHoveredId(null)}
                    isHovered={hoveredId != null && String(hoveredId) === idStr}
                    isSelected={selectedPostId != null && String(selectedPostId) === idStr}
                />
            );

            // Support both string and numeric ids (and a few legacy key patterns)
            map.set(idStr, node);
            map.set(post.id, node);
            const idNum = Number(idStr);
            if (Number.isFinite(idNum)) map.set(idNum, node);
            map.set(`post-${idStr}`, node);
            map.set(`p${idStr}`, node);
            map.set(`c${idStr}`, node);
        };

        (filteredPosts || []).forEach(addPost);
        Object.values(popupPostCache || {}).forEach(addPost);

        return map;
    }, [filteredPosts, popupPostCache, user, hoveredId, selectedPostId, handleLocationClick, onCardClick]);

    /* ---------- new-post flow ---------- */
    const [stepOneOpen, setStepOneOpen] = useState(false);
    const [stepTwoOpen, setStepTwoOpen] = useState(false);
    const [stepOneData, setStepOneData] = useState(null);
    const openStepOne = () => setStepOneOpen(true);
    const handleCategoryChosen = (d) => {
        setStepOneData(d);
        setStepOneOpen(false);
        setStepTwoOpen(true);
    };

    /* ---------- server categories ---------- */
    const [categories, setCategories] = useState([]);
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;
        fetch('/api/community/categories', { signal: ac.signal })
            .then((r) => r.json())
            .then((data) => {
                if (alive) setCategories(data);
            })
            .catch(() => {});
        return () => {
            alive = false;
            ac.abort();
        };
    }, []);

    /* ---------- deep-link: /community?post=:id ---------- */
    const loc = useLocation();
    const deepPostId = useMemo(() => {
        const s = new URLSearchParams(loc.search);
        const id = s.get('post');
        return id ? String(id) : null;
    }, [loc.search]);

    useEffect(() => {
        if (!deepPostId) return;
        const found = (communityPosts || []).find((p) => String(p.id) === deepPostId);
        if (found) {
            setSelectedPost(found);
            setActiveTabSafe('posts');
            setDetailExpanded(false);
            return;
        }
    }, [deepPostId, communityPosts, setActiveTabSafe]);

    /* ---------- search handler (manual vs auto) ---------- */
    const handleSearchClick = useCallback(
        (mode) => {
            clearSelection();

            if (mode === 'manual') {
                dispatch({ type: 'appliedSearch', value: search });
            }

            scheduleRefetch();
        },
        [search, clearSelection, scheduleRefetch]
    );

    /* ---------- Trending SUMMARY (server-side) ---------- */
    const [trendSummary, setTrendSummary] = useState([]);
    const [trendingLoading, setTrendingLoading] = useState(true);

    const fetchTrendingSummary = useCallback(async () => {
        setTrendingLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedCity) params.set('city', selectedCity);
            if (selectedCounty) params.set('county', selectedCounty);
            params.set('limit', '10');

            const res = await fetch(`/api/community/trending/summary?${params.toString()}`, { credentials: 'include' });
            const data = await res.json();
            setTrendSummary(Array.isArray(data) ? data : []);
        } catch {
            setTrendSummary([]);
        } finally {
            setTrendingLoading(false);
        }
    }, [selectedCity, selectedCounty]);

    useEffect(() => {
        fetchTrendingSummary();
    }, [fetchTrendingSummary]);

    /* ---------- when clicking a Trending summary ---------- */
    const handleTrendingSelect = useCallback(
        (categoryId) => {
            clearSelection();

            dispatch({ type: 'search', value: '' });
            dispatch({ type: 'appliedSearch', value: '' });
            dispatch({ type: 'view', value: 'all' });
            dispatch({ type: 'dateRange', value: 'all' });
            dispatch({ type: 'subtype', value: categoryId });
            dispatch({ type: 'sort', value: 'trending' });

            scheduleRefetch();
            setActiveTabSafe('posts');
            setDetailExpanded(false);
        },
        [clearSelection, scheduleRefetch, setActiveTabSafe]
    );

    /* ---------- UI helpers ---------- */
    const locationLabel = useMemo(() => {
        if (selectedCity) return selectedCity;
        if (selectedCounty) return `${selectedCounty} County`.replace(/ County County$/, ' County');
        return 'Alabama';
    }, [selectedCity, selectedCounty]);

    const rightWidth = activeTab === 'posts' && detailExpanded ? RIGHT_WIDTH_EXPANDED : RIGHT_WIDTH;

    return (
        <Box
            sx={{
                position: 'fixed',
                top: `${chromeTop}px`,
                left: 0,
                right: 0,
                bottom: `${BOTTOM_GUTTER_PX}px`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                bgcolor: APP_BACKGROUND,
            }}
        >
            {/* Left: filters + list */}
            <Box
                sx={{
                    flex: 1,
                    minWidth: 0,
                    height: '100%',
                    overflow: 'hidden',
                    p: 2,
                    pb: 0,
                    transition: (theme) =>
                        theme.transitions.create(['opacity', 'flex-basis', 'width', 'transform'], {
                            duration: 300,
                            easing: theme.transitions.easing.easeInOut,
                        }),
                }}
            >
                <CommunityPanel
                    user={user}
                    posts={filteredPosts}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onLocationClick={handleLocationClick}
                    onCardClick={onCardClick}
                    selectedView={view}
                    onViewChange={(val) => {
                        dispatch({ type: 'view', value: val });
                        handleSearchClick('auto');
                    }}
                    searchTerm={search}
                    onSearchTermChange={(val) => dispatch({ type: 'search', value: val })}
                    onSearchClick={handleSearchClick}
                    onClearClick={() => {
                        clearSelection();
                        dispatch({ type: 'search', value: '' });
                        dispatch({ type: 'appliedSearch', value: '' });
                        dispatch({ type: 'view', value: 'all' });
                        dispatch({ type: 'subtype', value: '' });
                        dispatch({ type: 'sort', value: 'newest' });
                        dispatch({ type: 'dateRange', value: 'all' });
                        dispatch({ type: 'city', value: '' });
                        dispatch({ type: 'county', value: '' });
                        scheduleRefetch();
                        fetchTrendingSummary();
                    }}
                    filteredCities={availableCities}
                    filteredCounties={availableCounties}
                    tempCity={selectedCity}
                    selectedCity={selectedCity}
                    onCityChange={(val) => {
                        dispatch({ type: 'city', value: val });
                        if (val) dispatch({ type: 'county', value: cityToCounty[val] || '' });
                        handleSearchClick('auto');
                        fetchTrendingSummary();
                    }}
                    selectedCounty={selectedCounty}
                    onCountyChange={(val) => {
                        dispatch({ type: 'county', value: val });
                        if (!val) dispatch({ type: 'city', value: '' });
                        handleSearchClick('auto');
                        fetchTrendingSummary();
                    }}
                    selectedSubtype={subtype}
                    subtypes={categories}
                    onSubtypeChange={(val) => {
                        dispatch({ type: 'subtype', value: val });
                        handleSearchClick('auto');
                    }}
                    selectedSort={sort}
                    sortOptions={[
                        { value: 'newest', label: 'Newest' },
                        { value: 'popular', label: 'Most Popular' },
                        { value: 'trending', label: 'Trending' },
                    ]}
                    onSortChange={(val) => {
                        dispatch({ type: 'sort', value: val });
                        handleSearchClick('auto');
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
                        handleSearchClick('auto');
                    }}
                    showFilters={true}
                    onToggleFilters={() => {}}
                    onNewPost={openStepOne}
                    selectedPostId={selectedPostId}
                    selectable={true}
                />
            </Box>

            {/* Right: tabbed panel */}
            <Box
                sx={{
                    position: 'relative',
                    mt: 2,
                    height: 'calc(100% - 30px)',
                    p: 0,
                    borderLeft: { md: 2 },
                    borderRight: { md: 2 },
                    borderBottom: { md: 2 },
                    borderTop: { md: 2 },
                    borderColor: 'divider',
                    overflow: 'hidden',
                    bgcolor: 'background.paper',
                    borderRadius: { md: 2 },
                    boxShadow: { md: '0 4px 18px rgba(2,6,23,0.06)' },
                    transition: (theme) =>
                        theme.transitions.create(['width', 'flex-basis', 'margin', 'transform'], {
                            duration: 300,
                            easing: theme.transitions.easing.easeInOut,
                        }),
                    width: rightWidth,
                    flex: '0 0 auto',
                }}
            >
                {/* TABS header */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: { xs: HEADER_H.xs, md: HEADER_H.md },
                        display: 'flex',
                        alignItems: 'center',
                        px: 1,
                        bgcolor: 'background.paper',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        zIndex: 3,
                    }}
                >
                    <Tabs
                        value={activeTab}
                        onChange={(_e, v) => {
                            setActiveTabSafe(v);
                            if (v !== 'posts') setDetailExpanded(false);

                            // When switching to the Map tab, always show the selected post popup (like clicking its marker).
                            if (v === 'map') {
                                const idStr =
                                    selectedPost?.id != null
                                        ? String(selectedPost.id)
                                        : openedPopupId != null
                                            ? String(openedPopupId)
                                            : null;

                                if (idStr) {
                                    if (reopenPopupTimerRef.current) {
                                        clearTimeout(reopenPopupTimerRef.current);
                                        reopenPopupTimerRef.current = null;
                                    }

                                    // Force a true state transition so Leaflet reliably opens the popup on mount.
                                    setOpenedPopupId(null);
                                    reopenPopupTimerRef.current = setTimeout(() => {
                                        reopenPopupTimerRef.current = null;
                                        setOpenedPopupId(idStr);
                                    }, 0);

                                    void ensurePopupPostLoaded(idStr);

                                    const post =
                                        selectedPost ||
                                        popupPostCache?.[idStr] ||
                                        (filteredPosts || []).find((p) => String(p?.id) === idStr) ||
                                        { id: idStr };

                                    focusMapForPost(post);
                                }
                            }
                        }}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ minHeight: 'unset', '& .MuiTab-root': { minHeight: 'unset' } }}
                    >
                        <Tab label="Trending" value="trending" />
                        <Tab label="Map" value="map" />
                        <Tab label="Posts" value="posts" />
                    </Tabs>

                    {activeTab === 'posts' && (
                        <Box sx={{ ml: 'auto' }}>
                            <Button
                                size="small"
                                color="inherit"
                                onClick={() => setDetailExpanded((v) => !v)}
                                startIcon={detailExpanded ? <CloseFullscreenIcon /> : <OpenInFullIcon />}
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    bgcolor: 'rgba(0,0,0,0.05)',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                                    borderRadius: 999,
                                }}
                                aria-label={detailExpanded ? 'Collapse details' : 'Expand details'}
                            >
                                {detailExpanded ? 'Collapse' : 'Expand'}
                            </Button>
                        </Box>
                    )}
                </Box>

                {/* Trending SUMMARY */}
                {activeTab === 'trending' && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            top: { xs: HEADER_H.xs, md: HEADER_H.md },
                            overflowY: 'auto',
                            p: { xs: 1, md: 1.5 },
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <Box component="img" src={trendingLantern} alt="Trending" sx={{ width: 50, height: 50 }} />
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Trending
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {trendingLoading && (
                                <Typography color="text.secondary" sx={{ mt: 1 }}>
                                    Loading…
                                </Typography>
                            )}

                            {!trendingLoading && trendSummary.length === 0 && (
                                <Typography color="text.secondary" sx={{ mt: 1 }}>
                                    Nothing trending in {locationLabel}.
                                </Typography>
                            )}

                            {trendSummary.map((row) => {
                                const slug = String(row.category || '').toLowerCase();
                                const meta = CATEGORY_META[slug] || {
                                    color: 'divider',
                                    label: row.label || slug,
                                    noun: 'posts',
                                };
                                const color = meta.color;
                                const noun = meta.noun || 'posts';
                                const count = Number(row.count || 0);
                                const display = `${count} ${noun} in ${locationLabel}`;

                                return (
                                    <Box
                                        key={`trend-summary-${slug}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleTrendingSelect(slug)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') handleTrendingSelect(slug);
                                        }}
                                        sx={{
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderRadius: 1.5,
                                            p: 1,
                                            display: 'flex',
                                            gap: 1,
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            transition: 'background-color 120ms ease',
                                            '&:hover': { bgcolor: 'action.hover' },
                                            position: 'relative',
                                            '&::before': {
                                                content: '""',
                                                position: 'absolute',
                                                left: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: 4,
                                                borderTopLeftRadius: 6,
                                                borderBottomLeftRadius: 6,
                                                backgroundColor: color,
                                            },
                                        }}
                                    >
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                                                {meta.label}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {display}
                                            </Typography>
                                        </Box>
                                        <Button variant="outlined" size="small" sx={{ fontWeight: 700 }}>
                                            View
                                        </Button>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                )}

                {/* Map */}
                {activeTab === 'map' && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            top: { xs: HEADER_H.xs, md: HEADER_H.md },
                        }}
                    >
                        <CommunityMap
                            data={points}
                            mapRef={mapRef}
                            center={center}
                            zoomLevel={zoomLevel}
                            onMarkerClick={handleMarkerClick}
                            hoveredId={hoveredId}
                            openedPopupId={openedPopupId}
                            popupContentById={popupContentById}
                            onPopupClose={(closingId) => {
                                setOpenedPopupId((current) => {
                                    if (activeTabRef.current !== 'map') return current;
                                    if (current == null) return null;
                                    if (closingId == null) return current;
                                    return String(current) === String(closingId) ? null : current;
                                });
                            }}
                        />
                        {isLoading && (
                            <CircularProgress size={48} sx={{ position: 'absolute', top: 24, left: 24 }} />
                        )}
                    </Box>
                )}

                {/* Posts (detail) */}
                {activeTab === 'posts' && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: { xs: HEADER_H.xs, md: HEADER_H.md },
                            left: 0,
                            right: 0,
                            bottom: 0,
                            overflowY: 'auto',
                            p: { xs: 1, md: 1.5 },
                        }}
                    >
                        {selectedPost ? (
                            <PostDetailModal user={user} embedded post={selectedPost} />
                        ) : (
                            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography color="text.secondary">Select a post to see details here.</Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </Box>

            <NewPostDialogs
                stepOneOpen={stepOneOpen}
                stepTwoOpen={stepTwoOpen}
                stepOneData={stepOneData}
                onClose1={() => setStepOneOpen(false)}
                onClose2={() => {
                    setStepTwoOpen(false);
                    setStepOneData(null);
                }}
                onCategoryChosen={handleCategoryChosen}
                onRefresh={refetch}
                subtypes={categories}
            />
        </Box>
    );
}
