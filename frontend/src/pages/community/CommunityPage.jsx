// src/pages/community/CommunityPage.jsx
// Fixed, no-window-scroll layout with a tabbed right-hand panel (Trending / Map / Posts),
// UPDATED (Trending):
//   • Right panel now shows category-level trending summaries (counts) based ONLY on the
//     selected location (county/city). Changing location updates Trending; other filters
//     don't affect it.
//   • Clicking a summary clears all filters, applies that category, sets View→Trending,
//     runs the search, and switches to the Posts tab.
// UPDATED (Sorting):
//   • Trending is now a View mode (View → Trending). Feed fetch uses sort=trending internally.
//   • When sort=trending yields no scored posts, the list should be empty (backend enforces score > 0).
//
// UPDATE 2025-12-19:
//   • Scroll the left post list back to top whenever a search/filter action executes,
//     including right-side Trending selection. (driven via scrollResetKey)

import React, {
    useState,
    useMemo,
    useEffect,
    useCallback,
    useReducer,
    useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Box,
    CircularProgress,
    Typography,
    Button,
    Tabs,
    Tab,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import CommunityMap from './CommunityMapView';
import CommunityPanel from './CommunityPanel';
import { PostCard } from './CommunityList';
import useCommunityData from '../../hooks/community/useCommunityData';
import PostDetailModal from './PostDetailModal';
import UserCardPopover from '../../components/UserCardPopover';
import NewPostDialogs from './NewCommunityPosts/NewPostDialogs';

import cityData from '../../data/alabamaCities.json';
import countyData from '../../data/alabamaCounties.json';
import cityCountyMap from '../../data/cityCountyMap.json';

// Trending lantern icon (left of title)
import trendingLantern from '../../assets/trending.png';

const api = process.env.REACT_APP_API_URL || '';

const DEFAULT_CENTER = [32.69, -86.79113];
const DEFAULT_ZOOM = 7.5;

// Trending window used for both summary + trending view alignment
const TRENDING_WINDOW = '48h';
const TRENDING_SUMMARY_LIMIT = 10;
const TRENDING_FALLBACK_LIMIT = 200;
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
    tips: { color: '#A06D4E', label: 'Tips', noun: 'tips' },
    recommendations: { color: '#A06D4E', label: 'Recommendations', noun: 'recommendations' },
    'recommendations-tips': { color: '#A06D4E', label: 'Tips/Recommendations', noun: 'posts' },
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

/* ---------- community page state/cache (return from PostPage without losing place) ---------- */
const COMMUNITY_STATE_KEY = 'll:community:state';
const COMMUNITY_DATA_KEY = 'll:community:data';

function safeParseJson(str) {
    if (!str || typeof str !== 'string') return null;
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function readCommunityState() {
    try {
        const raw = sessionStorage.getItem(COMMUNITY_STATE_KEY);
        const data = safeParseJson(raw);
        if (!data || typeof data !== 'object') return null;

        const filters = data.filters && typeof data.filters === 'object' ? data.filters : null;
        const sanitizedFilters = filters
            ? {
                search: String(filters.search ?? ''),
                appliedSearch: String(filters.appliedSearch ?? ''),
                view: String(filters.view ?? 'all'),
                subtype: String(filters.subtype ?? ''),
                sort: String(filters.sort ?? 'newest'),
                dateRange: String(filters.dateRange ?? 'all'),
                city: String(filters.city ?? ''),
                county: String(filters.county ?? ''),
            }
            : null;

        const center = Array.isArray(data.center) && data.center.length === 2 ? data.center : null;
        const zoomLevel = Number.isFinite(Number(data.zoomLevel)) ? Number(data.zoomLevel) : null;

        return {
            filters: sanitizedFilters,
            activeTab: typeof data.activeTab === 'string' ? data.activeTab : null,
            detailExpanded: Boolean(data.detailExpanded),
            showFilters: data.showFilters == null ? null : Boolean(data.showFilters),
            selectedPost: data.selectedPost && typeof data.selectedPost === 'object' ? data.selectedPost : null,
            openedPopupId: data.openedPopupId ?? null,
            center,
            zoomLevel,
        };
    } catch {
        return null;
    }
}

function writeCommunityState(payload) {
    try {
        sessionStorage.setItem(COMMUNITY_STATE_KEY, JSON.stringify(payload));
    } catch {
        // ignore
    }
}

function readCommunityData() {
    try {
        const raw = sessionStorage.getItem(COMMUNITY_DATA_KEY);
        const data = safeParseJson(raw);
        if (!data || typeof data !== 'object') return null;
        const posts = Array.isArray(data.posts) ? data.posts : null;
        const points = data.points && typeof data.points === 'object' ? data.points : null;
        return posts || points ? { posts: posts || [], points: points || null } : null;
    } catch {
        return null;
    }
}

function writeCommunityData(payload) {
    try {
        sessionStorage.setItem(COMMUNITY_DATA_KEY, JSON.stringify(payload));
    } catch {
        // ignore
    }
}

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
    const detailScrollRef = useRef(null);
    const lastMarkerLatLngByIdRef = useRef({});
    const refetchTimerRef = useRef(null);
    const latestRefetchRef = useRef(null);
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

// Keep Community list in sync with edits/deletes/mark-found from dialogs (profile page or community page).
    useEffect(() => {
        const refresh = () => {
            try {
                scheduleRefetch();
            } catch {
                // ignore
            }
        };

        window.addEventListener('ll:communityPost:updated', refresh);
        window.addEventListener('ll:communityPost:deleted', refresh);
        window.addEventListener('ll:communityPost:markedFound', refresh);

        return () => {
            window.removeEventListener('ll:communityPost:updated', refresh);
            window.removeEventListener('ll:communityPost:deleted', refresh);
            window.removeEventListener('ll:communityPost:markedFound', refresh);
        };
    }, [scheduleRefetch]);



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
    const initialCommunityState = useMemo(() => {
        try {
            if (sessionStorage.getItem('ll:community:forceRefresh') === '1') return null;
        } catch {
            // ignore
        }
        return readCommunityState();
    }, []);
    const initialCommunityData = useMemo(() => {
        try {
            if (sessionStorage.getItem('ll:community:forceRefresh') === '1') return null;
        } catch {
            // ignore
        }
        return readCommunityData();
    }, []);

    useEffect(() => {
        try {
            if (sessionStorage.getItem('ll:community:restore')) {
                sessionStorage.removeItem('ll:community:restore');
            }
        } catch {
            // ignore
        }
    }, []);

    // ✅ If we just deleted a post from PostPage, do a one-time "hard refresh" of Community
    // so we don't restore a stale selectedPost from sessionStorage.
    useEffect(() => {
        let pendingDeleteId = null;
        let force = false;

        try {
            pendingDeleteId = sessionStorage.getItem('ll:community:pendingDeleteId');
            force = sessionStorage.getItem('ll:community:forceRefresh') === '1';
        } catch {
            pendingDeleteId = null;
            force = false;
        }

        if (!pendingDeleteId && !force) return;

        try {
            sessionStorage.removeItem('ll:community:pendingDeleteId');
            sessionStorage.removeItem('ll:community:forceRefresh');
            sessionStorage.removeItem(COMMUNITY_STATE_KEY);
            sessionStorage.removeItem(COMMUNITY_DATA_KEY);
        } catch {
            // ignore
        }

        const deletedIdStr = pendingDeleteId != null ? String(pendingDeleteId) : null;

        // Clear the right-side selected detail and any open map popup.
        setSelectedPost(null);
        setOpenedPopupId(null);

        // Purge cached popup data for that post.
        if (deletedIdStr) {
            setPopupPostCache((prev) => {
                const next = { ...(prev || {}) };
                delete next[deletedIdStr];
                return next;
            });
        }

        // Purge it from cached data + paged rows too (so it can't appear selected from cache).
        if (deletedIdStr) {
            setCachedData((prev) => {
                const oldPosts = Array.isArray(prev?.posts) ? prev.posts : [];
                const nextPosts = oldPosts.filter((p) => String(p?.id ?? '') !== deletedIdStr);
                const nextPoints = prev?.points || null;
                return { posts: nextPosts, points: nextPoints };
            });

            setPagedPosts((prev) => {
                const arr = Array.isArray(prev) ? prev : [];
                return arr.filter((p) => String(p?.id ?? '') !== deletedIdStr);
            });

            setTotalCount((prev) => {
                const n = Number(prev);
                return Number.isFinite(n) && n > 0 ? Math.max(0, n - 1) : prev;
            });
        }

        // Finally, refetch fresh data.
        try {
            scheduleRefetch();
        } catch {
            // ignore
        }
    }, [scheduleRefetch]);

    const [activeTab, setActiveTab] = useState(initialCommunityState?.activeTab || 'trending'); // 'trending' | 'map' | 'posts'
    const activeTabRef = useRef(initialCommunityState?.activeTab || 'trending');
    const setActiveTabSafe = useCallback((nextTab) => {
        activeTabRef.current = nextTab;
        setActiveTab(nextTab);
    }, []);

    const [selectedPost, setSelectedPost] = useState(initialCommunityState?.selectedPost || null);
    const selectedPostId = selectedPost?.id ?? null;

    // ✅ Scroll the right-side post detail pane to TOP whenever a different post is selected
    // This prevents the detail view from staying scrolled down when switching posts.
    useEffect(() => {
        if (activeTabRef.current !== 'posts') return;
        const el = detailScrollRef.current;
        if (el) el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [selectedPostId, activeTab]);


    // Keeping this state so we don't disrupt your existing sizing logic.
    // (The button is repurposed to "View Post Page".)
    const [detailExpanded, setDetailExpanded] = useState(Boolean(initialCommunityState?.detailExpanded));

    const clearSelection = useCallback(() => {
        setSelectedPost(null);
    }, []);

    /* ✅ Show/Hide filters state (so header button works) */
    const [showFilters, setShowFilters] = useState(
        initialCommunityState?.showFilters == null ? true : Boolean(initialCommunityState.showFilters)
    );
    const handleToggleFilters = useCallback(() => {
        setShowFilters((v) => !v);
    }, []);

    /* ---------- filters ---------- */
    const [filters, dispatch] = useReducer(filterReducer, initialCommunityState?.filters || initialFilters);
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

    const [randomSeed, setRandomSeed] = useState('');

    useEffect(() => {
        const mode = String(sort || '').trim().toLowerCase();
        if (mode === 'random') {
            setRandomSeed((prev) => (prev ? prev : String(Date.now())));
        } else {
            setRandomSeed('');
        }
    }, [sort]);

    // ✅ NEW: bump this whenever a search/filter action executes (even if queryKey doesn't change)
    const [scrollToTopSeq, bumpScrollToTopSeq] = useReducer((n) => n + 1, 0);

    const [center, setCenter] = useState(initialCommunityState?.center || DEFAULT_CENTER);
    const [zoomLevel, setZoomLevel] = useState(initialCommunityState?.zoomLevel || DEFAULT_ZOOM);
    const [openedPopupId, setOpenedPopupId] = useState(initialCommunityState?.openedPopupId ?? null);



    // ✅ When the currently-selected post is deleted (from PostPage or list),
    // clear the detail pane and return the right panel back to Trending.
    useEffect(() => {
        const onDeleted = (e) => {
            const delId = e?.detail?.postId ?? e?.detail?.id ?? e?.detail?.post?.id ?? null;
            if (delId == null) return;

            const delStr = String(delId);
            const selectedStr = selectedPost?.id != null ? String(selectedPost.id) : null;
            const openedStr = openedPopupId != null ? String(openedPopupId) : null;

            // If the deleted post is what we're currently showing (or what the map popup has open),
            // clear the selection and go back to Trending.
            if ((selectedStr && delStr === selectedStr) || (openedStr && delStr === openedStr)) {
                setSelectedPost(null);
                setOpenedPopupId(null);
                setDetailExpanded(false);
                setActiveTabSafe('trending');
            }
        };

        window.addEventListener('ll:communityPost:deleted', onDeleted);
        return () => window.removeEventListener('ll:communityPost:deleted', onDeleted);
    }, [selectedPost, openedPopupId, setActiveTabSafe]);
    const [hoveredId, setHoveredId] = useState(null);

    const [popupPostCache, setPopupPostCache] = useState(() => ({}));

    const [cachedData, setCachedData] = useState(() => initialCommunityData || { posts: [], points: null });


    // (event sync) This listener is defined later, after paging state is initialized.
    const popupFetchInFlightRef = useRef(new Set());

    // Persist CommunityPage UI state so returning from PostPage restores the screen
    useEffect(() => {
        writeCommunityState({
            filters,
            activeTab,
            detailExpanded,
            showFilters,
            selectedPost,
            openedPopupId,
            center,
            zoomLevel,
        });
    }, [filters, activeTab, detailExpanded, showFilters, selectedPost, openedPopupId, center, zoomLevel]);

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
    const apiView = view;
    const apiSort = sort;

    const queryKey = useMemo(
        () =>
            JSON.stringify({
                search: appliedSearch,
                view: apiView,
                subtype: normalizeSubtype(subtype),
                sort: apiSort,
                dateRange,
                city: selectedCity,
                county: selectedCounty,
                randomSeed: randomSeed || '',
            }),
        [appliedSearch, apiView, subtype, apiSort, dateRange, selectedCity, selectedCounty, randomSeed]
    );

    // ✅ NEW: this is what triggers CommunityPanel to scroll the list to top
    const scrollResetKey = useMemo(
        () => `${queryKey}|${scrollToTopSeq}`,
        [queryKey, scrollToTopSeq]
    );

    const [totalCount, setTotalCount] = useState(null);
    const [pagedPosts, setPagedPosts] = useState([]);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const lastQueryKeyRef = useRef(queryKey);

    // Keep Community caches + the embedded detail pane in sync immediately after edits/mark-found.
    // This also patches pagedPosts in-place (important when the edited post is beyond page 0).
    useEffect(() => {
        const getPostFromEvent = (e) => {
            const direct = e?.detail?.post;
            if (direct && typeof direct === 'object') return direct;

            const raw = e?.detail?.raw || e?.detail?.data || null;
            if (raw && typeof raw === 'object') return raw;

            if (typeof e?.detail === 'string') {
                try {
                    return JSON.parse(e.detail);
                } catch {
                    return null;
                }
            }
            return null;
        };

        const patchSessionCache = (updated) => {
            try {
                const idStr = updated?.id != null ? String(updated.id) : '';
                if (!idStr) return;

                const raw = sessionStorage.getItem(COMMUNITY_DATA_KEY);
                const data = safeParseJson(raw);
                if (!data || typeof data !== 'object') return;

                if (Array.isArray(data.posts)) {
                    const nextPosts = data.posts.map((p) => (p && String(p.id) === idStr ? { ...p, ...updated } : p));
                    if (nextPosts.some((p) => p && String(p.id) === idStr)) {
                        writeCommunityData({ ...data, posts: nextPosts, ts: Date.now() });
                    }
                }
            } catch {
                // ignore
            }
        };

        const onUpdated = (e) => {
            const updated = getPostFromEvent(e);
            const idStr = updated?.id != null ? String(updated.id) : '';
            if (!idStr) return;

            // Patch paged posts too. Important: when you have loaded additional pages,
            // a normal `refetch()` only refreshes page 0, so posts beyond page 0 can
            // stay stale unless we patch them by id.
            setPagedPosts((prev) => {
                const arr = Array.isArray(prev) ? prev : [];
                if (!arr.length) return prev;
                let changed = false;
                const next = arr.map((p) => {
                    if (!p || p.id == null) return p;
                    if (String(p.id) !== idStr) return p;
                    changed = true;
                    return { ...p, ...updated };
                });
                return changed ? next : prev;
            });

            // Patch cached list payload used on return-to-community.
            patchSessionCache(updated);

            // Patch in-memory cache used as a fallback when the list is empty (avoid showing stale images).
            setCachedData((prev) => {
                const oldPosts = Array.isArray(prev?.posts) ? prev.posts : [];
                const nextPosts = oldPosts.map((p) => (p && String(p.id) === idStr ? { ...p, ...updated } : p));
                const did = nextPosts.some((p) => p && String(p.id) === idStr);
                return did ? { ...(prev || {}), posts: nextPosts } : prev;
            });

            // Patch popup cache + embedded detail post (right panel) if we're currently viewing it.
            setPopupPostCache((prev) => ({
                ...(prev || {}),
                [idStr]: { ...(prev?.[idStr] || {}), ...updated },
            }));

            setSelectedPost((prev) => {
                if (!prev || prev.id == null) return prev;
                return String(prev.id) === idStr ? { ...prev, ...updated } : prev;
            });
        };

        window.addEventListener('ll:communityPost:updated', onUpdated);
        window.addEventListener('ll:communityPost:markedFound', onUpdated);

        return () => {
            window.removeEventListener('ll:communityPost:updated', onUpdated);
            window.removeEventListener('ll:communityPost:markedFound', onUpdated);
        };
    }, []);

    const { posts: communityPosts, points, isLoading, refetch } = useCommunityData({
        randomSeed,
        search: appliedSearch,
        view: apiView,
        subtype: normalizeSubtype(subtype),
        sort: apiSort,
        dateRange,
        city: selectedCity,
        county: selectedCounty,
    });

    // When filters change, reset paging + totals
    useEffect(() => {
        if (lastQueryKeyRef.current !== queryKey) {
            lastQueryKeyRef.current = queryKey;
            setPagedPosts([]);
            setTotalCount(null);
            setIsLoadingMore(false);
        }
    }, [queryKey]);

    // Keep paged posts in sync with the primary fetch (page 0)
    useEffect(() => {
        const live = Array.isArray(communityPosts) ? communityPosts : [];
        setPagedPosts((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return live;
            const next = prev.slice();
            const head = next.slice(0, live.length);
            const headIds = head.map((p) => String(p?.id ?? ''));
            const liveIds = live.map((p) => String(p?.id ?? ''));
            const same = headIds.length === liveIds.length && headIds.every((id, i) => id === liveIds[i]);
            if (same) return prev;
            const appended = next.slice(live.length);
            return [...live, ...appended];
        });
    }, [communityPosts]);

    // Fetch accurate total count via header (includeTotal=1)
    useEffect(() => {
        let alive = true;
        const run = async () => {
            try {
                const params = new URLSearchParams();
                if (appliedSearch) params.set('search', appliedSearch);
                if (apiView) params.set('view', apiView);
                const st = normalizeSubtype(subtype);
                if (st) params.set('subtype', st);
                if (apiSort) params.set('sort', apiSort);
                if (String(apiSort || '').trim().toLowerCase() === 'random' && randomSeed) params.set('randomSeed', randomSeed);
                if (dateRange) params.set('dateRange', dateRange);
                if (selectedCity) params.set('city', selectedCity);
                if (selectedCounty) params.set('county', selectedCounty);

                params.set('limit', '1');
                params.set('offset', '0');
                params.set('includeTotal', '1');

                const res = await fetch(`/api/community?${params.toString()}`, { credentials: 'include' });
                if (!alive) return;
                const headerVal = Number(res.headers.get('x-total-count'));
                if (Number.isFinite(headerVal)) setTotalCount(headerVal);
            } catch {
                if (!alive) return;
                setTotalCount(null);
            }
        };
        run();
        return () => {
            alive = false;
        };
    }, [appliedSearch, apiView, subtype, apiSort, dateRange, selectedCity, selectedCounty, queryKey, randomSeed]);

    const fetchNextPage = useCallback(async () => {
        if (isLoadingMore) return;
        const currentCount = Array.isArray(pagedPosts) ? pagedPosts.length : 0;
        if (Number.isFinite(Number(totalCount)) && currentCount >= Number(totalCount)) return;

        setIsLoadingMore(true);
        try {
            const params = new URLSearchParams();
            if (appliedSearch) params.set('search', appliedSearch);
            if (apiView) params.set('view', apiView);
            const st = normalizeSubtype(subtype);
            if (st) params.set('subtype', st);
            if (apiSort) params.set('sort', apiSort);
            if (dateRange) params.set('dateRange', dateRange);
            if (selectedCity) params.set('city', selectedCity);
            if (selectedCounty) params.set('county', selectedCounty);

            params.set('limit', '50');
            params.set('offset', String(currentCount));
            params.set('includeTotal', '1');

            const res = await fetch(`/api/community?${params.toString()}`, { credentials: 'include' });
            if (!res.ok) return;
            const headerVal = Number(res.headers.get('x-total-count'));
            if (Number.isFinite(headerVal)) setTotalCount(headerVal);

            const next = await res.json();
            const nextArr = Array.isArray(next) ? next : [];

            if (nextArr.length) {
                setPagedPosts((prev) => {
                    const base = Array.isArray(prev) ? prev : [];
                    const existing = new Set(base.map((p) => String(p?.id ?? '')));
                    const merged = base.slice();
                    for (const p of nextArr) {
                        const idStr = String(p?.id ?? '');
                        if (!idStr) continue;
                        if (existing.has(idStr)) continue;
                        existing.add(idStr);
                        merged.push(p);
                    }
                    return merged;
                });
            }
        } finally {
            setIsLoadingMore(false);
        }
    }, [
        isLoadingMore,
        pagedPosts,
        totalCount,
        appliedSearch,
        apiView,
        subtype,
        apiSort,
        dateRange,
        selectedCity,
        selectedCounty,
    ]);

    // Cache the latest results so returning from PostPage can render instantly (no empty list flash)
    // BUT: never use cache for trending view (must reflect only true trending).
    useEffect(() => {
        if (view === 'trending') return;
        const live = Array.isArray(communityPosts) ? communityPosts : null;
        const pts = points && typeof points === 'object' ? points : null;
        if ((live && live.length) || (pts && (pts.features || pts.type))) {
            const payload = { posts: live || [], points: pts || null, ts: Date.now() };
            writeCommunityData(payload);
            setCachedData({ posts: payload.posts, points: payload.points });
        }
    }, [communityPosts, points, view]);

    const postsSource = useMemo(() => {
        const live = Array.isArray(pagedPosts) ? pagedPosts : [];
        if (live.length) return live;

        if (view === 'trending') return [];

        const cached = Array.isArray(cachedData?.posts) ? cachedData.posts : [];
        return cached;
    }, [pagedPosts, cachedData, view]);

    // Build marker GeoJSON from the SAME source used by the post list (pagedPosts / cache).
    // This keeps the map immediately consistent after an edit, even when the edited post
    // is beyond the first fetched page.
    const computedPoints = useMemo(() => {
        const arr = Array.isArray(postsSource) ? postsSource : [];
        const features = arr
            .filter((p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)))
            .map((p) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [Number(p.longitude), Number(p.latitude)],
                },
                properties: {
                    id: p.id,
                    category: p.category || '',
                },
            }));
        return { type: 'FeatureCollection', features };
    }, [postsSource]);

    const pointsSource = useMemo(() => {
        if (computedPoints?.features?.length) return computedPoints;

        // Fallback to hook/cached points if list is empty (ex: initial load, or user cleared filters).
        const liveHas = points && (Array.isArray(points.features) ? points.features.length > 0 : true);
        if (liveHas) return points;
        if (view === 'trending') return points;
        return cachedData?.points || points;
    }, [computedPoints, points, cachedData, view]);

    latestRefetchRef.current = refetch;

    /* ---------- list filter ---------- */
    const filteredPosts = useMemo(() => {
        const term = (appliedSearch || '').trim().toLowerCase();
        return (postsSource || []).filter((post) => {
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
    }, [postsSource, selectedCity, selectedCounty, dateRange, appliedSearch]);

    /* ---------- selection + map helpers ---------- */
    const getPointLatLngById = useCallback(
        (id) => {
            const idStr = id != null ? String(id) : '';
            if (!idStr) return null;
            const feat = pointsSource?.features?.find((f) => String(f?.properties?.id) === idStr);
            const coords = feat?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return null;
            const lng = Number(coords[0]);
            const lat = Number(coords[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return [lat, lng];
        },
        [pointsSource]
    );

    const hasFullPhotoPayload = (p) => {
        if (!p || typeof p !== 'object') return false;

        const photos = p.photos;
        if (Array.isArray(photos) && photos.length > 0) return true;
        if (typeof photos === 'string' && photos.trim() && photos !== 'null') return true;

        if (Array.isArray(p.community_photos) && p.community_photos.length > 0) return true;

        const pj = p.photos_json;
        if (typeof pj === 'string' && pj.trim() && pj !== 'null') return true;

        // Single cover-only fields do NOT count as "full payload"
        return false;
    };

    const ensurePopupPostLoaded = useCallback(
        async (id, { force = false } = {}) => {
            const idStr = id != null ? String(id) : '';
            if (!idStr) return;

            const cached = popupPostCache?.[idStr];
            if (!force && cached && hasFullPhotoPayload(cached)) return;

            if (!force && selectedPost && String(selectedPost.id) === idStr && hasFullPhotoPayload(selectedPost)) return;

            const fromList = (filteredPosts || []).find((p) => String(p?.id) === idStr) || null;
            if (!force && fromList && hasFullPhotoPayload(fromList)) return;

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

                setSelectedPost((prev) => {
                    if (!prev || prev.id == null) return prev;
                    return String(prev.id) === idStr ? data : prev;
                });
            } catch {
                // ignore
            } finally {
                popupFetchInFlightRef.current.delete(idStr);
            }
        },
        [filteredPosts, popupPostCache, selectedPost]
    );

    // ✅ Restore selection when returning from Post Page:
    // If we have a selectedPostId (restored from sessionStorage), ensure we have the latest post
    // even if it is not present in the first page of the left list yet.
    useEffect(() => {
        if (selectedPostId == null) return;
        const idStr = String(selectedPostId);
        if (!idStr) return;
        void ensurePopupPostLoaded(idStr);
    }, [selectedPostId, ensurePopupPostLoaded]);

    useEffect(() => {
        if (activeTab !== 'posts') return;
        if (selectedPostId == null) return;
        const idStr = String(selectedPostId);
        if (!idStr) return;
        void ensurePopupPostLoaded(idStr);
    }, [activeTab, selectedPostId, ensurePopupPostLoaded]);



    const focusMapForPost = useCallback(
        (post, latLngOverride) => {
            const p = post || {};
            const idStr = p?.id != null ? String(p.id) : null;

            const POPUP_LAT_OFFSET = p.street_address ? 0.004 : 0.01;

            if (
                latLngOverride &&
                Number.isFinite(latLngOverride.lat) &&
                Number.isFinite(latLngOverride.lng)
            ) {
                setCenter([latLngOverride.lat + POPUP_LAT_OFFSET, latLngOverride.lng]);
                setZoomLevel(p.street_address ? ZOOM_BY_LEVEL.address : ZOOM_BY_LEVEL.city);
                return;
            }

            if (idStr) {
                const pt = getPointLatLngById(idStr);
                if (pt) {
                    setCenter([pt[0] + POPUP_LAT_OFFSET, pt[1]]);
                    setZoomLevel(p.street_address ? ZOOM_BY_LEVEL.address : ZOOM_BY_LEVEL.city);
                    return;
                }
            }

            const lat = Number(p.latitude ?? p.lat);
            const lng = Number(p.longitude ?? p.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                setCenter([lat + POPUP_LAT_OFFSET, lng]);
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

            if (arg1 && typeof arg1 === 'object' && arg1.id != null) {
                setSelectedPost((prev) => {
                    const prevId = prev?.id;
                    const nextId = arg1.id;
                    return prevId != null && String(prevId) === String(nextId) ? prev : arg1;
                });
            }

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

            if (latLng && Number.isFinite(latLng.lat) && Number.isFinite(latLng.lng)) {
                lastMarkerLatLngByIdRef.current[idStr] = { lat: latLng.lat, lng: latLng.lng };
            }

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

    /* ---------- deep-link: /community?post=:id ---------- */
    const loc = useLocation();
    const navigate = useNavigate();

    /* ---------- user mini card (used by PostCard in the map popup) ---------- */
    const viewerUser = user?.user || user || null;

    const openLoginPopup = useCallback(
        (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            try {
                window.dispatchEvent(new CustomEvent('open-login'));
                window.dispatchEvent(new CustomEvent('open-auth-dialog'));
                window.dispatchEvent(new CustomEvent('open-login-popup'));
            } catch {
                // ignore
            }
            try {
                navigate('/login');
            } catch {
                // ignore
            }
        },
        [navigate]
    );

    const openAuthUI = useCallback(() => {
        openLoginPopup();
    }, [openLoginPopup]);

    const requireAuth = useCallback(
        (cb) => {
            if (viewerUser) return cb?.();
            openAuthUI();
            return undefined;
        },
        [viewerUser, openAuthUI]
    );

    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [serverFollowingSet, setServerFollowingSet] = useState(() => new Set());
    const [locallyFollowed, setLocallyFollowed] = useState(() => new Set());


    // Close the mini user card when clicking anywhere outside of it (click-away behavior).
    const closeUserCard = useCallback(() => {
        setUserAnchor(null);
        setUserForCard(null);
    }, []);

    useEffect(() => {
        if (!userAnchor) return undefined;

        const isNode = (val) => {
            if (!val) return false;
            if (typeof Node === 'undefined') return true;
            return val instanceof Node;
        };

        const isInsideMuiPopover = (target) => {
            try {
                const roots = document.querySelectorAll('.MuiPopover-root, .MuiPopper-root');
                for (const r of roots) {
                    if (r && typeof r.contains === 'function' && r.contains(target)) return true;
                }
            } catch {
                // ignore
            }
            return false;
        };

        const onDocPointer = (e) => {
            const target = e?.target;
            if (!isNode(target)) return;

            // If the click was on the anchor element that opened the card, don't close.
            try {
                if (userAnchor && typeof userAnchor.contains === 'function' && userAnchor.contains(target)) return;
            } catch {
                // ignore
            }

            // If the click is inside any MUI popover/popper (including this mini card), don't close.
            if (isInsideMuiPopover(target)) return;

            closeUserCard();
        };

        const onKeyDown = (e) => {
            if (e?.key === 'Escape') closeUserCard();
        };

        document.addEventListener('mousedown', onDocPointer, true);
        document.addEventListener('touchstart', onDocPointer, true);
        document.addEventListener('keydown', onKeyDown, true);

        return () => {
            document.removeEventListener('mousedown', onDocPointer, true);
            document.removeEventListener('touchstart', onDocPointer, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [userAnchor, closeUserCard]);

    const hydrateTargetFromPublic = useCallback(
        async (target) => {
            if (!target) return null;
            const handleOrId = target.handle || target.id;
            if (!handleOrId) return null;

            const urls = [
                `${api}/users/public/${encodeURIComponent(handleOrId)}`,
                `/users/public/${encodeURIComponent(handleOrId)}`,
                `/api/users/public/${encodeURIComponent(handleOrId)}`,
            ].filter(Boolean);

            for (const u of urls) {
                try {
                    const res = await fetch(u, { credentials: 'include' });
                    if (!res.ok) continue;
                    const data = await res.json();
                    const profile = data?.profile || data?.user || data;
                    if (!profile) continue;

                    // Ensure we have the numeric id
                    setUserForCard((prev) => {
                        if (!prev) return prev;
                        if (!prev.id && profile.id) return { ...prev, id: profile.id };
                        return prev;
                    });

                    // Am *I* in the target's followers?
                    const sjRaw = profile.social_json;
                    let sj = {};
                    if (typeof sjRaw === 'string') {
                        try {
                            sj = JSON.parse(sjRaw || '{}');
                        } catch {
                            sj = {};
                        }
                    } else if (sjRaw && typeof sjRaw === 'object') {
                        sj = sjRaw;
                    }
                    const followers = Array.isArray(sj?.followers) ? sj.followers : [];
                    const isF = !!viewerUser?.id && followers.includes(Number(viewerUser.id));
                    if (profile.id && isF) {
                        setServerFollowingSet((old) => {
                            const next = new Set(old);
                            next.add(Number(profile.id));
                            return next;
                        });
                    }

                    return profile;
                } catch {
                    // try next
                }
            }

            return null;
        },
        [viewerUser?.id]
    );

    const handleOpenUserCard = useCallback(
        (anchorEl, author) => {
            if (!anchorEl) return;

            setUserAnchor(anchorEl);
            setUserForCard({
                id: author?.id, // may be undefined; we'll hydrate from /users/public
                first_name: author?.first_name,
                last_name: author?.last_name,
                handle: author?.handle,
                avatar_url: author?.avatar_url,
            });

            // Fire-and-forget hydration to resolve id + following
            void hydrateTargetFromPublic(author);
        },
        [hydrateTargetFromPublic]
    );

    const handleViewProfile = useCallback((u) => {
        const slug = u?.handle || u?.id;
        if (!slug) return;
        window.location.assign(`/${slug}`);
    }, []);

    const postFollow = useCallback(async (targetId) => {
        const payload = { target_id: targetId, action: 'follow' };
        const urls = [`${api}/users/follow`, '/api/users/follow', '/users/follow'].filter(Boolean);
        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) return true;
            } catch {
                // try next
            }
        }
        return false;
    }, []);

    const handleFollow = useCallback(
        async (targetUser) => {
            const tid0 = Number(targetUser?.id || userForCard?.id);
            const handle0 = targetUser?.handle || userForCard?.handle;
            if (!tid0 && !handle0) return;

            // Don't allow following yourself
            const selfId = Number(viewerUser?.id);
            if (selfId && tid0 && selfId === tid0) return;

            requireAuth(async () => {
                // Ensure numeric id via hydration if needed
                let tid = tid0;
                if (!tid && handle0) {
                    const p = await hydrateTargetFromPublic({ handle: handle0 });
                    if (p?.id) tid = Number(p.id);
                }
                if (!tid) return;

                // Optimistic UI flip
                setLocallyFollowed((prev) => {
                    const next = new Set(prev);
                    next.add(tid);
                    return next;
                });

                const ok = await postFollow(tid);
                if (ok) {
                    setServerFollowingSet((prev) => {
                        const next = new Set(prev);
                        next.add(tid);
                        return next;
                    });
                } else {
                    // rollback optimistic
                    setLocallyFollowed((prev) => {
                        const next = new Set(prev);
                        next.delete(tid);
                        return next;
                    });
                }
            });
        },
        [requireAuth, userForCard?.handle, userForCard?.id, viewerUser?.id, hydrateTargetFromPublic, postFollow]
    );

    const isSelfForCard = useMemo(() => {
        if (!viewerUser || !userForCard) return false;
        const idMatch =
            viewerUser.id != null && userForCard.id != null && Number(viewerUser.id) === Number(userForCard.id);
        const handleMatch =
            viewerUser.handle &&
            userForCard.handle &&
            String(viewerUser.handle).toLowerCase() === String(userForCard.handle).toLowerCase();
        return idMatch || handleMatch;
    }, [viewerUser, userForCard]);

    const isFollowingForCard = useMemo(() => {
        const tid = Number(userForCard?.id);
        if (!tid) return false;
        return serverFollowingSet.has(tid) || locallyFollowed.has(tid);
    }, [userForCard, serverFollowingSet, locallyFollowed]);

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
                    currentView={view}
                    showTopAccent={false}
                    onOpenUserCard={handleOpenUserCard}
                    onLocationClick={handleLocationClick}
                    onCardClick={onCardClick}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    selectable={true}
                    selectedId={openedPopupId != null ? openedPopupId : selectedPostId}
                />
            );
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
    }, [filteredPosts, popupPostCache, user, view, handleOpenUserCard, hoveredId, selectedPostId, openedPopupId, handleLocationClick, onCardClick]);

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




    /* ---------- header navigation reset ---------- */
    // If the user entered (or re-entered) Community by clicking the header "Community" tab,
    // always reset to defaults: nothing selected, default filters, and the right-side tab on Trending.
    const headerResetToken = useMemo(() => {
        const token = loc?.state?.llCommunityReset;
        if (token == null) return null;
        return String(token);
    }, [loc?.state?.llCommunityReset]);

    const lastHeaderResetTokenRef = useRef(null);

    useEffect(() => {
        if (!headerResetToken) return;
        if (lastHeaderResetTokenRef.current === headerResetToken) return;
        lastHeaderResetTokenRef.current = headerResetToken;

        // Clear any saved "restore where I left off" community state/cache.
        try {
            sessionStorage.removeItem(COMMUNITY_STATE_KEY);
            sessionStorage.removeItem(COMMUNITY_DATA_KEY);
            sessionStorage.removeItem('ll:community:url');
            sessionStorage.removeItem('ll:community:scrollTop');
            sessionStorage.removeItem('ll:community:restore');
            sessionStorage.removeItem('ll:community:pendingDeleteId');
            sessionStorage.removeItem('ll:community:forceRefresh');
        } catch {
            // ignore
        }

        // Reset UI
        setSelectedPost(null);
        setOpenedPopupId(null);
        setHoveredId(null);
        setDetailExpanded(false);
        setShowFilters(true);
        setActiveTabSafe('trending');

        // Reset filters
        dispatch({ type: 'search', value: '' });
        dispatch({ type: 'appliedSearch', value: '' });
        dispatch({ type: 'view', value: 'all' });
        dispatch({ type: 'subtype', value: '' });
        dispatch({ type: 'sort', value: 'newest' });
        dispatch({ type: 'dateRange', value: 'all' });
        dispatch({ type: 'city', value: '' });
        dispatch({ type: 'county', value: '' });

        setRandomSeed('');

        // If we were deep-linked with ?post=, remove it so nothing is selected.
        try {
            const s = new URLSearchParams(loc.search);
            if (s.has('post')) {
                s.delete('post');
                const qs = s.toString();
                navigate(qs ? `/community?${qs}` : '/community', {
                    replace: true,
                    state: { ...(loc.state || {}), llCommunityReset: headerResetToken },
                });
            }
        } catch {
            // ignore
        }

        // Scroll lists to top + refetch fresh defaults.
        bumpScrollToTopSeq();
        scheduleRefetch();
    }, [headerResetToken, loc.search, loc.state, navigate, scheduleRefetch, setActiveTabSafe, bumpScrollToTopSeq]);

    const deepPostId = useMemo(() => {
        const s = new URLSearchParams(loc.search);
        const id = s.get('post');
        return id ? String(id) : null;
    }, [loc.search]);

    useEffect(() => {
        if (!deepPostId) return;
        const found = (postsSource || []).find((p) => String(p.id) === deepPostId);
        if (found) {
            setSelectedPost(found);
            setActiveTabSafe('posts');
            setDetailExpanded(false);
        }
    }, [deepPostId, postsSource, setActiveTabSafe]);

    /* ---------- search handler (manual vs auto) ---------- */
    const handleSearchClick = useCallback(
        (mode) => {
            // ✅ always scroll list to top when a search/filter action runs
            bumpScrollToTopSeq();

            clearSelection();
            if (activeTabRef.current === 'posts') {
                setActiveTabSafe('trending');
                setDetailExpanded(false);
            }
            if (mode === 'manual') {
                dispatch({ type: 'appliedSearch', value: search });
            }
            scheduleRefetch();
        },
        [search, clearSelection, scheduleRefetch, setActiveTabSafe]
    );

    /* ---------- Trending SUMMARY (server-side) ---------- */
    const [trendSummary, setTrendSummary] = useState([]);
    const [trendingLoading, setTrendingLoading] = useState(true);

    const fetchTrendingSummary = useCallback(async () => {
        setTrendingLoading(true);

        const buildFallbackSummary = (postsArr) => {
            const arr = Array.isArray(postsArr) ? postsArr : [];
            const counts = new Map();

            for (const p of arr) {
                const cat = String(p?.category || '').trim().toLowerCase();
                if (!cat) continue;
                counts.set(cat, (counts.get(cat) || 0) + 1);
            }

            const out = [];
            counts.forEach((count, category) => {
                const meta = CATEGORY_META[category] || {};
                out.push({
                    category,
                    label: meta.label || category,
                    count,
                    topScore: null,
                });
            });

            out.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
            return out.slice(0, TRENDING_SUMMARY_LIMIT);
        };

        try {
            const params = new URLSearchParams();
            if (selectedCity) params.set('city', selectedCity);
            if (selectedCounty) params.set('county', selectedCounty);

            params.set('limit', String(TRENDING_SUMMARY_LIMIT));
            params.set('window', TRENDING_WINDOW);

            const res = await fetch(`/api/community/trending/summary?${params.toString()}`, { credentials: 'include' });

            if (!res.ok) {
                const fb = new URLSearchParams();
                if (selectedCity) fb.set('city', selectedCity);
                if (selectedCounty) fb.set('county', selectedCounty);
                fb.set('view', 'trending');
                fb.set('sort', 'trending');
                fb.set('window', TRENDING_WINDOW);
                fb.set('limit', String(TRENDING_FALLBACK_LIMIT));
                fb.set('offset', '0');
                fb.set('includeTotal', '1');

                const fbRes = await fetch(`/api/community?${fb.toString()}`, { credentials: 'include' });
                const fbData = fbRes.ok ? await fbRes.json() : [];
                setTrendSummary(buildFallbackSummary(fbData));
                return;
            }

            const data = await res.json();
            const list = Array.isArray(data) ? data : [];

            if (list.length === 0) {
                const fb = new URLSearchParams();
                if (selectedCity) fb.set('city', selectedCity);
                if (selectedCounty) fb.set('county', selectedCounty);
                fb.set('view', 'trending');
                fb.set('sort', 'trending');
                fb.set('window', TRENDING_WINDOW);
                fb.set('limit', String(TRENDING_FALLBACK_LIMIT));
                fb.set('offset', '0');
                fb.set('includeTotal', '1');

                const fbRes = await fetch(`/api/community?${fb.toString()}`, { credentials: 'include' });
                const fbData = fbRes.ok ? await fbRes.json() : [];
                setTrendSummary(buildFallbackSummary(fbData));
                return;
            }

            setTrendSummary(list);
        } catch {
            setTrendSummary([]);
        } finally {
            setTrendingLoading(false);
        }
    }, [selectedCity, selectedCounty]);

    useEffect(() => {
        fetchTrendingSummary();
    }, [fetchTrendingSummary]);

    const handleTrendingSelect = useCallback(
        (categoryId) => {
            // ✅ always scroll list to top when user chooses a trending category
            bumpScrollToTopSeq();

            clearSelection();

            dispatch({ type: 'search', value: '' });
            dispatch({ type: 'appliedSearch', value: '' });
            dispatch({ type: 'view', value: 'trending' });
            dispatch({ type: 'dateRange', value: 'all' });
            dispatch({ type: 'subtype', value: categoryId });

            scheduleRefetch();
            setActiveTabSafe('posts');
            setDetailExpanded(false);
        },
        [clearSelection, scheduleRefetch, setActiveTabSafe]
    );

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
                gap: { xs: 1.25, md: 2 },
                p: { xs: 1.25, md: 2 },
                boxSizing: 'border-box',
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
                    p: 0,
                    transition: (theme) =>
                        theme.transitions.create(['opacity', 'flex-basis', 'width', 'transform'], {
                            duration: 300,
                            easing: theme.transitions.easing.easeInOut,
                        }),
                }}
            >
                <CommunityPanel
                    user={user}
                    showTopAccent={false}
                    posts={filteredPosts}
                    isLoading={isLoading}
                    totalCount={totalCount}
                    hasMoreExternal={Number.isFinite(Number(totalCount)) ? filteredPosts.length < Number(totalCount) : null}
                    onLoadMore={fetchNextPage}
                    isLoadingMore={isLoadingMore}
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
                        // ✅ always scroll list to top on clear
                        bumpScrollToTopSeq();

                        clearSelection();
                        if (activeTabRef.current === 'posts') {
                            setActiveTabSafe('trending');
                            setDetailExpanded(false);
                        }
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
                        { value: 'random', label: 'Random' },
                    ]}
                    onSortChange={(val) => {
                        const nextSort = String(val || 'newest').trim().toLowerCase();
                        dispatch({ type: 'sort', value: nextSort });
                        if (nextSort === 'random') setRandomSeed(String(Date.now()));
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
                    showFilters={showFilters}
                    onToggleFilters={handleToggleFilters}
                    onNewPost={openStepOne}
                    selectedPostId={selectedPostId}
                    selectable={true}
                    // ✅ NEW: triggers scroll-to-top behavior in CommunityPanel
                    scrollResetKey={scrollResetKey}
                />
            </Box>

            {/* Right: tabbed panel */}
            <Box
                sx={{
                    position: 'relative',
                    height: '100%',
                    p: 0,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: (t) => alpha(t.palette.primary.main, 0.12),
                    borderRadius: 3,
                    bgcolor: (t) => alpha(t.palette.common.white, 0.62),
                    backdropFilter: 'saturate(140%) blur(10px)',
                    backgroundImage: 'none',
                    boxShadow: (t) => `0 14px 44px ${alpha(t.palette.common.black, 0.08)}`,
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
                        bgcolor: (t) => alpha(t.palette.common.white, 0.72),
                        backgroundImage: 'none',
                        backdropFilter: 'saturate(140%) blur(8px)',
                        borderBottom: '1px solid',
                        borderColor: (t) => alpha(t.palette.primary.main, 0.12),
                        zIndex: 3,
                    }}
                >
                    <Tabs
                        value={activeTab}
                        onChange={(_e, v) => {
                            setActiveTabSafe(v);
                            if (v !== 'posts') setDetailExpanded(false);

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

                                    const savedLatLng = lastMarkerLatLngByIdRef.current[idStr];

                                    const lat = Number(post?.latitude ?? post?.lat);
                                    const lng = Number(post?.longitude ?? post?.lng);

                                    const latLngForFocus =
                                        savedLatLng && Number.isFinite(savedLatLng.lat) && Number.isFinite(savedLatLng.lng)
                                            ? savedLatLng
                                            : (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);

                                    // Always focus with both center + zoom so the Map tab matches the "clicked post" behavior.
                                    if (latLngForFocus) {
                                        focusMapForPost(post, latLngForFocus);
                                    } else {
                                        focusMapForPost(post);
                                    }
                                }
                            }
                        }}
                        variant="standard"
                        sx={{
                            minHeight: 'unset',
                            '& .MuiTabs-flexContainer': { gap: 0.75 },
                            '& .MuiTab-root': {
                                minHeight: 'unset',
                                px: { xs: 1.25, md: 2 },
                                py: { xs: 0.75, md: 1 },
                                borderRadius: 0, // square tabs (match the underline/indicator)
                                textTransform: 'none',
                                fontWeight: 900,
                                color: 'text.secondary',
                            },
                            '& .MuiTab-root:hover': {
                                bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
                            },
                            '& .MuiTab-root.Mui-selected': {
                                color: 'primary.main',
                                bgcolor: 'transparent',
                            },
                            '& .MuiTabs-indicator': {
                                height: 2,
                                borderRadius: 0,
                                backgroundColor: 'secondary.main',
                            },
                        }}
                    >
                        <Tab label="Trending" value="trending" />
                        <Tab label="Map" value="map" />
                        <Tab label="Posts" value="posts" />
                    </Tabs>

                    {/* ✅ Replace Expand with View Post Page */}
                    {activeTab === 'posts' && (
                        <Box sx={{ ml: 'auto' }}>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<OpenInNewIcon />}
                                disabled={!selectedPost || selectedPost.id == null}
                                onClick={() => {
                                    if (!selectedPost || selectedPost.id == null) return;

                                    try {
                                        sessionStorage.setItem('ll:community:url', window.location.pathname + window.location.search);
                                        const listEl = document.querySelector('[data-community-scroll]');
                                        const top = listEl?.scrollTop || 0;
                                        sessionStorage.setItem('ll:community:scrollTop', String(top));
                                    } catch {}

                                    navigate(`/posts/${selectedPost.id}`, { state: { post: selectedPost, from: 'community' } });
                                }}
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 800,
                                    borderRadius: 999,
                                    whiteSpace: 'nowrap',
                                }}
                                aria-label="View Post Page"
                            >
                                View Post Page
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
                                    Nothing trending in {locationLabel} (last {TRENDING_WINDOW}).
                                </Typography>
                            )}

                            {trendSummary.map((row) => {
                                const slug = String(row.category || '').toLowerCase();
                                const meta = CATEGORY_META[slug] || {
                                    label: row.label || slug,
                                    noun: 'posts',
                                };
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
                                            borderRadius: 1.5,
                                            p: 1,
                                            display: 'flex',
                                            gap: 1,
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            transition: 'background-color 140ms ease, border-color 140ms ease',
                                            borderColor: (t) => alpha(t.palette.primary.main, 0.18),
                                            position: 'relative',
                                            '&:hover': {
                                                bgcolor: (t) => alpha(t.palette.secondary.main, 0.10),
                                                borderColor: (t) => alpha(t.palette.secondary.main, 0.45),
                                            },
                                            '&:hover::before': {
                                                backgroundColor: (t) => t.palette.secondary.main,
                                            },
                                            '&::before': {
                                                content: '""',
                                                position: 'absolute',
                                                left: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: 4,
                                                borderTopLeftRadius: 6,
                                                borderBottomLeftRadius: 6,
                                                backgroundColor: (t) => t.palette.primary.main,
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
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            sx={(t) => ({
                                                fontWeight: 800,
                                                borderRadius: 999,
                                                borderColor: alpha(t.palette.primary.main, 0.22),
                                                color: t.palette.primary.main,
                                                backgroundColor: alpha(t.palette.primary.main, 0.02),
                                                '&:hover': {
                                                    borderColor: alpha(t.palette.secondary.main, 0.55),
                                                    backgroundColor: alpha(t.palette.secondary.main, 0.10),
                                                    color: t.palette.primary.dark,
                                                },
                                            })}
                                        >
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
                            data={pointsSource}
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
                        ref={detailScrollRef}
                        data-post-detail-scroll
                        sx={{
                            position: 'absolute',
                            top: { xs: HEADER_H.xs, md: HEADER_H.md },
                            left: 0,
                            right: 0,
                            bottom: 0,
                            overflowY: 'auto',
                            bgcolor: 'transparent',
                            p: 0,
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

            <UserCardPopover
                anchorEl={userAnchor}
                onClose={closeUserCard}
                user={userForCard}
                isSelf={isSelfForCard}
                following={isFollowingForCard}
                onFollow={handleFollow}
                onViewProfile={handleViewProfile}
            />

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
