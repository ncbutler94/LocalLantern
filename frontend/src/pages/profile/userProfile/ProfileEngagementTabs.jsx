// src/pages/profile/userProfile/ProfileEngagementTabs.jsx
//
// A single right-rail card with tabs for:
// - Posts (profile owner's posts feed)
// - Likes (posts this user has liked)
// - Reposts (posts this user has reposted)
//
// UPDATE (User Profile: filters + counts + category labels):
// - Filters reduced to ONLY: Category + Sort by.
// - Category dropdown uses the same split-category logic as CommunityFilter:
//     • recommendations -> Tips + Recommendations
//     • Volunteer & Help Requests -> Help Requests + Volunteers
// - Bottom/footer count is FILTER-ACCURATE:
//     “Displaying X of Y posts” where Y is the filtered total (not the user's total).
// - Uses 50-at-a-time rendering (loads more on scroll) to keep the right rail fast.
// - No popups added/changed here.
//
// NOTE: Do not close popovers/dialogs via backdrop click (handled in their own components).

import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { alpha } from '@mui/material/styles';
import {
    Alert,
    Box,
    Button,
    Card,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Tab,
    Tabs,
    Tooltip,
    Typography,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import postsIcon from '../../../assets/posts_icon.png';
import likeIconLit from '../../../assets/actionBar/like_icon_lit.png';
import repostIconLit from '../../../assets/actionBar/repost_lit.png';
import commentIconLit from '../../../assets/actionBar/comment_lit.png';

import { ProfilePostCard } from '../../profile/userProfile/ProfilePostsList';
import UserCardPopover from '../../../components/UserCardPopover';
import SharePostDialog from '../../../components/SharePostDialog';

const api = process.env.REACT_APP_API_URL;

/* ───────── shared category logic (copied from CommunityFilter.jsx approach) ───────── */
const DEFAULT_CATEGORIES = [
    { id: 'announcement', label: 'Announcements' },
    { id: 'general-discussion', label: 'General Discussion' },
    { id: 'lost-and-found', label: 'Lost & Found' },
    { id: 'public-safety-alerts', label: 'Public Safety Alerts' },
    // Split “recommendations”
    { id: 'tips', label: 'Tips' },
    { id: 'recommendations', label: 'Recommendations' },
    // Split “Volunteer & Help Requests”
    { id: 'help-requests', label: 'Help Requests' },
    { id: 'volunteers', label: 'Volunteers' },
];

function normalizeSlug(v) {
    const s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'announcements') return 'announcement';
    if (s === 'discussion') return 'general-discussion';
    if (s === 'lost-found') return 'lost-and-found';
    if (s === 'public-safety') return 'public-safety-alerts';
    return s;
}

/**
 * Derive the "split category" slug used by CommunityFilter + backend applySubtypeFilter:
 * - recommendations-tips -> tips | recommendations (by rec_type)
 * - volunteer-requests / volunteer-help-requests -> help-requests | volunteers (by request_kind)
 */
function deriveSplitCategory(post) {
    const raw = post?.category ?? post?.subtype ?? post?.category_slug ?? post?.category_id ?? '';
    let cat = normalizeSlug(raw);

    if (cat === 'recommendations-tips') {
        const rt = String(post?.rec_type || post?.recType || '').trim().toLowerCase();
        if (rt === 'tip' || rt === 'tips') return 'tips';
        if (rt === 'business' || rt === 'recommendation' || rt === 'recommendations') return 'recommendations';
        return 'recommendations';
    }

    if (
        cat === 'volunteer-requests' ||
        cat === 'volunteer-help-requests' ||
        cat === 'volunteer-help' ||
        cat === 'volunteer-and-help-requests'
    ) {
        const kind = String(post?.request_kind || post?.requestKind || post?.help_type || '').trim().toLowerCase();
        if (kind === 'volunteer' || kind === 'volunteering' || kind === 'offer' || kind === 'offers' || kind === 'offering') {
            return 'volunteers';
        }
        return 'help-requests';
    }

    // Some installs store split categories directly
    if (cat === 'tips' || cat === 'recommendations') return cat;
    if (cat === 'help-requests' || cat === 'volunteers') return cat;

    return cat;
}

function categoryForItem(item) {
    if (!item) return '';
    if (item.post && typeof item.post === 'object') return deriveSplitCategory(item.post);
    return deriveSplitCategory(item);
}

function dateMsForItem(item, activeTab) {
    if (!item) return 0;
    if (activeTab === 1) {
        const raw = item.created_at || item.createdAt || null;
        if (!raw) return 0;
        const d = new Date(raw);
        const ms = d.getTime();
        return Number.isNaN(ms) ? 0 : ms;
    }
    return getDateMs(item);
}

function likesForItem(item) {
    if (!item) return 0;
    const p = item.post && typeof item.post === 'object' ? item.post : item;
    return getLikesCount(p);
}

function buildCategoryOptionsFromPosts(posts) {
    const src = DEFAULT_CATEGORIES;

    // (CommunityFilter logic) split legacy combined categories if server ever sends them
    const out = [];
    src.forEach((c) => {
        const id = normalizeSlug(c.id);
        const label = String(c.label || c.name || c.id || '').trim();

        if (id === 'recommendations-tips') {
            out.push({ id: 'tips', label: 'Tips' });
            out.push({ id: 'recommendations', label: 'Recommendations' });
            return;
        }

        if (
            id === 'volunteer-requests' ||
            id === 'volunteer-help-requests' ||
            /volunteer\s*&\s*help/i.test(label)
        ) {
            out.push({ id: 'help-requests', label: 'Help Requests' });
            out.push({ id: 'volunteers', label: 'Volunteers' });
            return;
        }

        out.push({ id: id || c.id, label: c.label || label || c.id });
    });

    // Also ensure categories present in posts appear, even if unexpected
    const present = new Set();
    (Array.isArray(posts) ? posts : []).forEach((p) => {
        const d = categoryForItem(p);
        if (d) present.add(d);
    });

    const labelById = new Map(out.map((c) => [String(c.id).toLowerCase(), String(c.label || '').trim()]));
    present.forEach((id) => {
        const key = String(id || '').trim().toLowerCase();
        if (!key) return;
        if (!labelById.has(key)) labelById.set(key, key);
    });

    const deduped = [];
    const seen = new Set();
    labelById.forEach((label, id) => {
        const key = String(id || '').trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push({ id: key, label: label || key });
    });

    // Keep the default order first, then extras alphabetical
    const orderIndex = new Map();
    DEFAULT_CATEGORIES.forEach((c, idx) => orderIndex.set(String(c.id).toLowerCase(), idx));
    orderIndex.set('tips', 10);
    orderIndex.set('recommendations', 11);
    orderIndex.set('help-requests', 12);
    orderIndex.set('volunteers', 13);

    deduped.sort((a, b) => {
        const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : 10_000;
        const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : 10_000;
        if (ai !== bi) return ai - bi;
        return String(a.label).localeCompare(String(b.label));
    });

    return deduped;
}

function getLikesCount(p) {
    return Number(p?.likesCount ?? p?.likes_count ?? p?.like_count ?? p?.likes ?? 0) || 0;
}

function getDateMs(p) {
    const raw = p?.posted_at || p?.postedAt || p?.date_created || p?.created_at || p?.updated_at || null;
    if (!raw) return 0;
    const d = new Date(raw);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

function a11yProps(idx) {
    return {
        id: `profile-activity-tab-${idx}`,
        'aria-controls': `profile-activity-tabpanel-${idx}`,
    };
}

function TabImgIcon({ src, alt = '', size = 18, squeezeX = 1 }) {
    const sx = Number(squeezeX) || 1;
    const dim = typeof size === 'number' ? size : size;

    return (
        <Box
            component="img"
            src={src}
            alt={alt}
            draggable={false}
            sx={{
                width: dim,
                height: dim,
                display: 'block',
                objectFit: 'contain',
                // breathing room between icon and label inside the tab
                mr: 0.9,
                transform: sx === 1 ? 'none' : `scaleX(${sx})`,
                transformOrigin: 'center',
                filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.12))',
            }}
        />
    );
}

function TabPanel({ value, index, children }) {
    return (
        <Box
            role="tabpanel"
            hidden={value !== index}
            id={`profile-activity-tabpanel-${index}`}
            aria-labelledby={`profile-activity-tab-${index}`}
            sx={{ minHeight: 0 }}
        >
            {value === index ? children : null}
        </Box>
    );
}

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest' },
    { value: 'popular', label: 'Most Popular' },
];

const PAGE_SIZE = 50;
const STICKY_FOOTER_HEIGHT = 44;

export default function ProfileEngagementTabs({
                                                  me,
                                                  profile,
                                                  posts,
                                                  isScrollBox = false,
                                                  scrollBoxHeight = null,
                                                  isMine,
                                                  privacy,
                                                  canViewSection,
                                                  onOpenPost,
                                                  onOpenComment,
                                                  onExpandPosts,
                                                  disableInitialAutoScroll = true,
                                                  pageScrollOffset = 0,
                                              }) {
    const navigate = useNavigate();
    const rawProfileKey = profile?.handle || profile?.public_id || profile?.id;
    const profileKey = typeof rawProfileKey === 'string' && rawProfileKey.startsWith('@') ? rawProfileKey.slice(1) : rawProfileKey;

    const [tab, setTab] = useState(0); // 0=posts, 1=comments, 2=likes, 3=reposts
    const [category, setCategory] = useState('');
    const [sortBy, setSortBy] = useState('newest');

    // -------------------------------
    // Preserve engagement tab state + scroll position across navigation
    // -------------------------------
    const engagementStateKey = profileKey ? `ll:profileEngagementState:${profileKey}` : null;
    const engagementRestoredRef = useRef(false);
    const scrollerRef = useRef(null);

    const saveEngagementState = useCallback(() => {
        if (!engagementStateKey) return;

        const snapshot = {
            tab: Number.isFinite(tab) ? tab : 0,
            category: category || '',
            sortBy: sortBy || 'newest',
            scrollTop: scrollerRef.current ? scrollerRef.current.scrollTop : 0,
        };

        try {
            sessionStorage.setItem(engagementStateKey, JSON.stringify(snapshot));
        } catch {
            // ignore
        }
    }, [engagementStateKey, tab, category, sortBy]);

    // When navigating away (e.g. clicking a comment -> post page), we need to guarantee
    // the current tab is persisted before unmount (effects may not flush in time).
    const forceSaveEngagementState = useCallback(
        (nextTab) => {
            if (!engagementStateKey) return;

            const snapshot = {
                tab: Number.isFinite(nextTab) ? nextTab : (Number.isFinite(tab) ? tab : 0),
                category: category || '',
                sortBy: sortBy || 'newest',
                scrollTop: scrollerRef.current ? scrollerRef.current.scrollTop : 0,
            };

            try {
                sessionStorage.setItem(engagementStateKey, JSON.stringify(snapshot));
            } catch {
                // ignore
            }
        },
        [engagementStateKey, tab, category]
    );

    useEffect(() => {
        if (!engagementStateKey || engagementRestoredRef.current) return;

        let raw = null;
        try {
            raw = sessionStorage.getItem(engagementStateKey);
        } catch {
            raw = null;
        }
        if (!raw) {
            engagementRestoredRef.current = true;
            return;
        }

        try {
            const s = JSON.parse(raw);
            if (Number.isFinite(s.tab)) setTab(s.tab);
            if (typeof s.category === 'string') setCategory(s.category);

            if (typeof s.sortBy === 'string') setSortBy(s.sortBy);
            requestAnimationFrame(() => {
                if (scrollerRef.current && Number.isFinite(s.scrollTop)) {
                    scrollerRef.current.scrollTop = s.scrollTop;
                }
            });
        } catch {
            // ignore
        } finally {
            engagementRestoredRef.current = true;
        }
    }, [engagementStateKey]);

    useEffect(() => {
        // keep state fresh (also covers browser back)
        saveEngagementState();
    }, [saveEngagementState]);

    useEffect(() => {
        // Ensure the last tab/scroll are persisted even if the user navigates away quickly.
        return () => {
            saveEngagementState();
        };
    }, [saveEngagementState]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el || !engagementStateKey) return;

        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                saveEngagementState();
            });
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            if (raf) cancelAnimationFrame(raf);
            el.removeEventListener('scroll', onScroll);
        };
    }, [engagementStateKey, saveEngagementState]);

    const [engagementLoaded, setEngagementLoaded] = useState(false);
    const [engagementLoading, setEngagementLoading] = useState(false);
    const [engagementError, setEngagementError] = useState('');
    const [likes, setLikes] = useState([]);
    const [reposts, setReposts] = useState([]);
    const [comments, setComments] = useState([]);

    // Prevent the engagement loader effect from aborting itself (and from StrictMode double-run)
    const engagementInFlightRef = useRef(false);

// Live sync for Like/Repost toggles so this tab card stays consistent when switching tabs
    useEffect(() => {
        const findAny = (idNum) => {
            const inArr = (arr) => (Array.isArray(arr) ? arr.find((p) => Number(p?.id) === idNum) : null);
            const fromComments = (arr) => {
                if (!Array.isArray(arr)) return null;
                const hit = arr.find((c) => Number(c?.post?.id) === idNum);
                return hit?.post || null;
            };
            return inArr(posts) || inArr(likes) || inArr(reposts) || fromComments(comments) || null;
        };

        const onLikeEvt = (e) => {
            const d = e?.detail || {};
            const idNum = Number(d.postId);
            if (!Number.isFinite(idNum)) return;

            const liked = Boolean(d.liked);
            const likesCount = Number(d.likes);

            const base = findAny(idNum);

            const patch = (p) => {
                if (!p || Number(p?.id) !== idNum) return p;
                return {
                    ...p,
                    viewerLiked: liked,
                    viewer_liked: liked,
                    liked,
                    is_liked: liked,
                    likesCount: Number.isFinite(likesCount) ? likesCount : Number(p?.likesCount ?? p?.likes_count ?? p?.likes ?? 0),
                    likes_count: Number.isFinite(likesCount) ? likesCount : p?.likes_count,
                };
            };

            setLikes((prev) => {
                const arr = Array.isArray(prev) ? prev.map(patch) : [];
                const exists = arr.some((p) => Number(p?.id) === idNum);

                if (liked && !exists) {
                    const toAdd = base ? patch(base) : { id: idNum, viewerLiked: true, likesCount: Number.isFinite(likesCount) ? likesCount : 0 };
                    return [toAdd, ...arr];
                }
                if (!liked && exists) {
                    return arr.filter((p) => Number(p?.id) !== idNum);
                }
                return arr;
            });
        };

        const onRepostEvt = (e) => {
            const d = e?.detail || {};
            const idNum = Number(d.postId);
            if (!Number.isFinite(idNum)) return;

            const reposted = Boolean(d.reposted);
            const repostsCount = Number(d.reposts);

            const base = findAny(idNum);

            const patch = (p) => {
                if (!p || Number(p?.id) !== idNum) return p;
                return {
                    ...p,
                    viewerReposted: reposted,
                    viewer_reposted: reposted,
                    reposted,
                    is_reposted: reposted,
                    repostsCount: Number.isFinite(repostsCount) ? repostsCount : Number(p?.repostsCount ?? p?.reposts_count ?? p?.reposts ?? 0),
                    reposts_count: Number.isFinite(repostsCount) ? repostsCount : p?.reposts_count,
                };
            };

            setReposts((prev) => {
                const arr = Array.isArray(prev) ? prev.map(patch) : [];
                const exists = arr.some((p) => Number(p?.id) === idNum);

                if (reposted && !exists) {
                    const toAdd = base ? patch(base) : { id: idNum, viewerReposted: true, repostsCount: Number.isFinite(repostsCount) ? repostsCount : 0 };
                    return [toAdd, ...arr];
                }
                if (!reposted && exists) {
                    return arr.filter((p) => Number(p?.id) !== idNum);
                }
                return arr;
            });
        };

        window.addEventListener('ll:post:like-changed', onLikeEvt);
        window.addEventListener('ll:post:repost-changed', onRepostEvt);
        return () => {
            window.removeEventListener('ll:post:like-changed', onLikeEvt);
            window.removeEventListener('ll:post:repost-changed', onRepostEvt);
        };
    }, [posts, likes, reposts, comments]);


    // Filters (ONLY: category + sort)

    // Local helpers used by the post card UI (user popover + share dialog)
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    // Paging / reveal (50 at a time)
    const topRef = useRef(null);
    const suppressAutoScrollRef = useRef(!!disableInitialAutoScroll);
    const lastScrollKeyRef = useRef('');
    const anchorInfoRef = useRef(null);
    const prevIsScrollBoxRef = useRef(isScrollBox);
    const sentinelRef = useRef(null);
    const [renderCount, setRenderCount] = useState(PAGE_SIZE);

    // Sticky header stack (title + tabs + filters):
    // Keep this pinned flush to the top of the viewport (no gap) in both page-scroll mode and scroll-box mode.
    const stickyTop = isScrollBox
        ? 0
        : Number.isFinite(Number(pageScrollOffset))
            ? Math.max(0, Number(pageScrollOffset))
            : 0;

    // Scroll handoff (page -> scroll box):
    // When the right rail switches into internal scroll-box mode, keep the user's reading position continuous.
    useEffect(() => {
        prevIsScrollBoxRef.current = isScrollBox;
    }, [isScrollBox]);

    useEffect(() => {
        if (isScrollBox) return;

        let raf = 0;

        const updateAnchor = () => {
            raf = 0;
            const scrollerEl = scrollerRef.current;
            if (!scrollerEl) return;

            const rect = scrollerEl.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const x = rect.left + rect.width * 0.5;
            const y = Math.min(rect.bottom - 8, Math.max(rect.top + 8, window.innerHeight * 0.35));
            const el = document.elementFromPoint(x, y);
            if (!el) return;

            const cardEl = el.closest('[data-profile-post-id]');
            if (!cardEl) return;

            const id = String(cardEl.getAttribute('data-profile-post-id') || '');
            if (!id) return;

            anchorInfoRef.current = {
                id,
                top: cardEl.getBoundingClientRect().top,
            };
        };

        const onScroll = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(updateAnchor);
        };

        updateAnchor();
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', onScroll);
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [isScrollBox]);

    useLayoutEffect(() => {
        const scrollerEl = scrollerRef.current;
        if (!scrollerEl) return;

        const wasScrollBox = prevIsScrollBoxRef.current;
        if (wasScrollBox || !isScrollBox) return;

        const info = anchorInfoRef.current;
        if (!info || !info.id) return;

        let raf1 = 0;
        let raf2 = 0;

        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                const anchorEl = scrollerEl.querySelector(`[data-profile-post-id="${info.id}"]`);
                if (!anchorEl) return;

                const newTop = anchorEl.getBoundingClientRect().top;
                const delta = newTop - info.top;

                if (Math.abs(delta) < 2) return;

                scrollerEl.scrollTop += delta;
            });
        });

        return () => {
            if (raf1) window.cancelAnimationFrame(raf1);
            if (raf2) window.cancelAnimationFrame(raf2);
        };
    }, [isScrollBox]);

    // Wheel chaining at boundaries to remove trackpad "rubber band" jank.
    useEffect(() => {
        const scrollerEl = scrollerRef.current;
        if (!scrollerEl || !isScrollBox) return;

        const onWheel = (e) => {
            const dy = e.deltaY;
            if (!dy) return;

            const atTop = scrollerEl.scrollTop <= 0;
            const atBottom = scrollerEl.scrollTop + scrollerEl.clientHeight >= scrollerEl.scrollHeight - 1;

            if ((atTop && dy < 0) || (atBottom && dy > 0)) {
                e.preventDefault();
                window.scrollBy({ top: dy, left: 0, behavior: 'auto' });
            }
        };

        scrollerEl.addEventListener('wheel', onWheel, { passive: false });
        return () => scrollerEl.removeEventListener('wheel', onWheel);
    }, [isScrollBox]);


    const safeCanView = useCallback(
        (level) => {
            if (typeof canViewSection === 'function') return !!canViewSection(level);
            return true;
        },
        [canViewSection]
    );

    const canViewPosts = safeCanView(privacy?.posts || 'public');
    const canViewLikes = safeCanView(privacy?.likes || 'public');
    const canViewReposts = safeCanView(privacy?.reposts || 'public');
    const canViewComments = safeCanView(privacy?.comments || 'public');
    const activeCanView = tab === 0 ? canViewPosts : tab === 1 ? canViewComments : tab === 2 ? canViewLikes : canViewReposts;

    const activeList = useMemo(() => {
        if (tab === 0) return Array.isArray(posts) ? posts : [];
        if (tab === 1) return Array.isArray(comments) ? comments : [];
        if (tab === 2) return Array.isArray(likes) ? likes : [];
        return Array.isArray(reposts) ? reposts : [];
    }, [tab, posts, likes, reposts, comments]);

    const categoryOptions = useMemo(() => buildCategoryOptionsFromPosts(activeList), [activeList]);

    // When switching away from Posts, lazily load likes/reposts once
    useEffect(() => {
        if (!profileKey) return;
        if (tab === 0) return;
        if (engagementLoaded) return;
        if (engagementInFlightRef.current) return;

        let alive = true;
        const ctrl = new AbortController();

        (async () => {
            engagementInFlightRef.current = true;
            setEngagementError('');
            setEngagementLoading(true);
            try {
                const key = encodeURIComponent(profileKey);
                const urls = [
                    `${api}/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                    `${api}/api/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                    `/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                    `/api/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                ];

                let data = null;

                for (const u of urls) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        const r = await axios.get(u, { withCredentials: true, signal: ctrl.signal });
                        data = r?.data || null;
                        break;
                    } catch {
                        // try next
                    }
                }

                if (!alive) return;

                setLikes(Array.isArray(data?.likes) ? data.likes : []);
                setReposts(Array.isArray(data?.reposts) ? data.reposts : []);
                setComments(Array.isArray(data?.comments) ? data.comments : []);
                setEngagementLoaded(true);
            } catch (err) {
                if (!alive) return;
                setEngagementError(err?.response?.data?.message || err?.message || 'Could not load likes and reposts.');
            } finally {
                engagementInFlightRef.current = false;
                if (alive) setEngagementLoading(false);
            }
        })();

        return () => {
            alive = false;
            engagementInFlightRef.current = false;
            setEngagementLoading(false);
            ctrl.abort();
        };
    }, [tab, profileKey, engagementLoaded]);

    // Reset when profile changes
    useEffect(() => {
        suppressAutoScrollRef.current = true;
        lastScrollKeyRef.current = '';

        let hasSaved = false;
        if (engagementStateKey) {
            try {
                hasSaved = !!sessionStorage.getItem(engagementStateKey);
            } catch {
                hasSaved = false;
            }
        }

        // If we have a saved snapshot for this profile (e.g., returning from a Post page),
        // DO NOT reset tab/filter state — let the restore effect apply it.
        if (!hasSaved) {
            setTab(0);
            setCategory('');
            setSortBy('newest');
        }

        setEngagementLoaded(false);
        setEngagementLoading(false);
        setEngagementError('');
        setLikes([]);
        setReposts([]);
        setComments([]);

        setUserAnchor(null);
        setUserForCard(null);
        setShareOpen(false);
        setSharePost(null);

        setRenderCount(PAGE_SIZE);
    }, [profileKey, engagementStateKey]);

    // If selected category becomes invalid for the current tab/list, reset to All
    useEffect(() => {
        if (!category) return;
        const ok = categoryOptions.some((c) => c.id === String(category).toLowerCase());
        if (!ok) setCategory('');
    }, [category, categoryOptions]);


    // Apply filters + sort
    const filteredSortedList = useMemo(() => {
        let out = Array.isArray(activeList) ? activeList.slice() : [];

        const cat = String(category || '').trim().toLowerCase();
        if (cat) {
            out = out.filter((p) => categoryForItem(p) === cat);
        }

        const mode = String(sortBy || 'newest').trim().toLowerCase();
        if (mode === 'popular') {
            out.sort((a, b) => likesForItem(b) - likesForItem(a));
        } else {
            out.sort((a, b) => dateMsForItem(b, tab) - dateMsForItem(a, tab));
        }

        return out;
    }, [activeList, category, sortBy, tab]);

    const commentGroups = useMemo(() => {
        if (tab !== 1) return [];
        const arr = Array.isArray(filteredSortedList) ? filteredSortedList : [];
        const map = new Map();
        const groups = [];

        for (const c of arr) {
            const post = c?.post && typeof c.post === 'object' ? c.post : null;
            const pid = Number(post?.id ?? c?.post_id ?? 0);
            if (!Number.isFinite(pid) || pid <= 0) continue;

            if (!map.has(pid)) {
                const g = { post: post || {}, post_id: pid, comments: [] };
                map.set(pid, g);
                groups.push(g);
            }

            map.get(pid).comments.push(c);
        }

        return groups;
    }, [filteredSortedList, tab]);


    // Reset paging + scroll on tab/filter change
    useEffect(() => {
        setRenderCount(PAGE_SIZE);

        const k = `${tab}|${String(category || '')}|${String(sortBy || '')}`;
        const sameKey = lastScrollKeyRef.current === k;
        lastScrollKeyRef.current = k;
        if (sameKey) return;

        // IMPORTANT: do not auto-scroll the user to Community Activity on initial mount / profile load.
        if (suppressAutoScrollRef.current) {
            suppressAutoScrollRef.current = false;
            return;
        }

        // If we're in internal scroll-box mode, keep the scroll changes inside the card instead of moving the page.
        if (isScrollBox) {
            const sc = scrollerRef.current;
            if (sc) {
                try {
                    sc.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                } catch {
                    sc.scrollTop = 0;
                }
            }
            return;
        }

        const el = topRef.current;
        if (!el) return;

        // Scroll the PAGE so the sticky header + filters are visible after changing filters/tabs
        const rect = el.getBoundingClientRect();
        const offset = Number.isFinite(Number(pageScrollOffset)) ? Number(pageScrollOffset) : 8;
        const targetTop = rect.top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: 'smooth' });
    }, [tab, category, sortBy, isScrollBox, pageScrollOffset]);


    // Infinite reveal (within this card) based on scroll container
    const pagingTotal = tab === 1 ? commentGroups.length : filteredSortedList.length;

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return undefined;

        const root = isScrollBox ? scrollerRef.current : null;
        if (isScrollBox && !root) return undefined;

        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting) return;
                setRenderCount((c) => Math.min(c + PAGE_SIZE, pagingTotal));
            },
            { root, rootMargin: '900px', threshold: 0.1 }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [pagingTotal, isScrollBox]);

    const visibleList = useMemo(() => {
        if (tab === 1) return commentGroups.slice(0, Math.min(renderCount, commentGroups.length));
        return filteredSortedList.slice(0, Math.min(renderCount, filteredSortedList.length));
    }, [tab, commentGroups, filteredSortedList, renderCount]);

    const countText = useMemo(() => {
        const total = tab === 1 ? commentGroups.length : filteredSortedList.length;
        const shown = visibleList.length;
        const word = total === 1 ? 'post' : 'posts';
        return `Displaying ${shown} of ${total} ${word}`;
    }, [tab, commentGroups.length, filteredSortedList.length, visibleList.length]);

    // Block location interactions inside profile post cards (location should not be a link on profile pages)
    const blockLocationClicks = (e) => {
        const t = e?.target;
        if (!t || typeof t.closest !== 'function') return;

        // Keyboard: only intercept Enter / Space activations
        if (e?.type === 'keydown') {
            const k = String(e?.key || '');
            if (k !== 'Enter' && k !== ' ') return;
        }

        const interactive = t.closest('a, button, [role="button"]');
        if (!interactive) return;

        const isAnchor = interactive.tagName === 'A';
        const hrefRaw = isAnchor ? String(interactive.getAttribute('href') || '') : '';
        const href = hrefRaw.toLowerCase();
        const label = String(interactive.textContent || '').trim();
        const labelLower = label.toLowerCase();

        const hasLocationLikeClass = (() => {
            const el = t.closest('[data-location], [data-post-location], [data-post-location-link], [class*="location"], [class*="Location"]');
            return !!el;
        })();

        const looksLikeMapHref = isAnchor && (href.includes('maps') || href.includes('google.com/maps') || href.includes('/map'));
        const looksLikeFilteredHref = isAnchor && (/\/(community|posts)\?/.test(href) && /(location|city|county|region)=/.test(href));
        const looksLikeLocationText =
            /\b(county|city|parish|borough|township|village|province|state|region|place|location)\b/.test(labelLower) ||
            /,\s*[a-z]{2}\b/i.test(label) ||
            /\bcounty\b/i.test(label);

        const looksLikeLocation = hasLocationLikeClass || looksLikeMapHref || looksLikeFilteredHref || looksLikeLocationText;
        if (!looksLikeLocation) return;

        e.preventDefault();
        e.stopPropagation();
    };


    const openPostWithState = useCallback(
        (post0) => {
            forceSaveEngagementState(tab);

            onOpenPost?.(post0);
        },
        [forceSaveEngagementState, tab, onOpenPost]
    );

    const renderList = useCallback(
        (items, emptyCfg) => {
            const arr = Array.isArray(items) ? items : [];

            if (!activeCanView) {
                return (
                    <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            This section is private.
                        </Typography>
                    </Box>
                );
            }

            if (engagementLoading && tab !== 0) {
                return (
                    <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            Loading…
                        </Typography>
                    </Box>
                );
            }

            if (engagementError && tab !== 0) {
                return (
                    <Box sx={{ p: 2 }}>
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {engagementError}
                        </Alert>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                                setEngagementLoaded(false);
                                setEngagementError('');
                            }}
                            sx={{ textTransform: 'none' }}
                        >
                            Retry
                        </Button>
                    </Box>
                );
            }

            if (!arr.length) {
                const title = String(emptyCfg?.title || 'Nothing here yet.');
                const body = String(emptyCfg?.body || '');
                const iconNode = emptyCfg?.icon || null;

                return (
                    <Box
                        sx={{
                            px: 2,
                            py: 6,
                            minHeight: isScrollBox ? 360 : 220,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            gap: 1.25,
                        }}
                    >
                        {iconNode ? (
                            <Box
                                sx={{
                                    width: { xs: 92, sm: 104 },
                                    height: { xs: 92, sm: 104 },
                                    borderRadius: '50%',
                                    bgcolor: 'rgba(2,6,23,0.04)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 12px 30px rgba(2,6,23,0.10)',
                                }}
                            >
                                {iconNode}
                            </Box>
                        ) : null}

                        <Typography variant="h6" sx={{ fontWeight: 900 }}>
                            {title}
                        </Typography>

                        {body ? (
                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                                {body}
                            </Typography>
                        ) : null}
                    </Box>
                );
            }

            return (
                <Box
                    onClickCapture={blockLocationClicks}
                    onKeyDownCapture={blockLocationClicks}
                    sx={{
                        display: 'grid',
                        gap: 2,
                        p: { xs: 1.25, sm: 2 },
                        // Ensure content never sits "under" the sticky footer in scroll-box mode
                        pb: isScrollBox ? `calc(${STICKY_FOOTER_HEIGHT}px + 12px)` : undefined,
                    }}
                >
                    {arr.map((p) => (
                        <Box key={`${p.category || 'post'}-${p.id}`} data-profile-post-id={String(p?.id || '')}>
                            <ProfilePostCard
                                post={p}
                                user={me}
                                hoveredId={null}
                                setHoveredId={() => {}}
                                onCardClick={openPostWithState}
                                onEditPost={(post0) => {
                                    if (!isMine) return;
                                    const pid = Number(post0?.id || 0);
                                    if (!pid) return;
                                    window.dispatchEvent(
                                        new CustomEvent('ll:communityPost:requestEdit', { detail: { postId: pid, post: post0 } })
                                    );
                                }}
                                onDeletePost={(post0) => {
                                    if (!isMine) return;
                                    const pid = Number(post0?.id || 0);
                                    if (!pid) return;
                                    window.dispatchEvent(
                                        new CustomEvent('ll:communityPost:requestDelete', { detail: { postId: pid, post: post0 } })
                                    );
                                }}
                                onOpenUserCard={(el, post0) => {
                                    setUserAnchor(el);
                                    setUserForCard({
                                        id: post0.user_id || post0.id,
                                        first_name: post0.first_name,
                                        last_name: post0.last_name,
                                        handle: post0.handle,
                                        avatar_url: post0.avatar_url || post0.profile_picture,
                                    });
                                }}
                                onOpenShare={(post0) => {
                                    setSharePost(post0);
                                    setShareOpen(true);
                                }}
                            />
                        </Box>
                    ))}
                    <Box ref={sentinelRef} sx={{ height: 1 }} />
                </Box>
            );
        },
        [activeCanView, engagementLoading, engagementError, tab, me, openPostWithState, isMine, isScrollBox]
    );


    const renderComments = useCallback(
        (groups) => {
            if (!activeCanView) {
                return (
                    <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            This section is private.
                        </Typography>
                    </Box>
                );
            }

            if (engagementLoading && tab !== 0) {
                return (
                    <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            Loading…
                        </Typography>
                    </Box>
                );
            }

            if (engagementError && tab !== 0) {
                return (
                    <Box sx={{ p: 2 }}>
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {engagementError}
                        </Alert>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                                setEngagementLoaded(false);
                                setEngagementError('');
                            }}
                            sx={{ textTransform: 'none' }}
                        >
                            Retry
                        </Button>
                    </Box>
                );
            }

            const arr = Array.isArray(groups) ? groups : [];
            if (!arr.length) {
                return (
                    <Box
                        sx={{
                            px: 2,
                            py: 6,
                            minHeight: isScrollBox ? 360 : 220,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            gap: 1.25,
                        }}
                    >
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: '50%',
                                bgcolor: 'rgba(2,6,23,0.04)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 10px 22px rgba(2,6,23,0.08)',
                            }}
                        >
                            <TabImgIcon src={commentIconLit} alt="Comments" size={{ xs: 56, sm: 62 }} />
                        </Box>

                        <Typography variant="h6" sx={{ fontWeight: 900 }}>
                            No comments
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                            This user hasn’t commented on any posts yet.
                        </Typography>
                    </Box>
                );
            }

            const timeLabel = (iso) => {
                const d = iso ? new Date(iso) : null;
                if (!d || Number.isNaN(d.valueOf())) return '';
                // No seconds (match the design used elsewhere in profile activity).
                return d.toLocaleString(undefined, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: 'numeric',
                    minute: '2-digit',
                });
            };

            const truncate = (t, n) => {
                const s0 = String(t || '').trim();
                if (!s0) return '';
                return s0.length > n ? `${s0.slice(0, n)}…` : s0;
            };

            const openComment = (c) => {
                if (!c) return;
                // We want the profile to restore to the Comments tab after viewing a post.
                forceSaveEngagementState(1);
                onOpenComment?.(c);
            };

            return (
                <Box
                    sx={{
                        display: 'grid',
                        gap: 2,
                        p: { xs: 1.25, sm: 2 },
                        pb: isScrollBox ? `calc(${STICKY_FOOTER_HEIGHT}px + 12px)` : undefined,
                    }}
                >
                    {arr.map((g) => {
                        const post = g?.post || {};
                        const postTitle = String(post?.title || '').trim() || 'Post';
                        const postHandle = String(post?.handle || '').trim();
                        const comments = Array.isArray(g?.comments) ? g.comments : [];
                        const total = comments.length;
                        const latest = comments[0] || null;
                        const latestTime = latest?.created_at || latest?.createdAt || null;

                        return (
                            <Box
                                key={`comment-group-${Number(g?.post_id || post?.id || 0)}`}
                                onClick={() => openComment(latest)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openComment(latest);
                                    }
                                }}
                                sx={(t) => ({
                                    border: '1px solid',
                                    borderColor: 'rgba(2,6,23,0.10)',
                                    borderRadius: 2,
                                    bgcolor: '#fff',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    boxShadow: '0 10px 26px rgba(2,6,23,0.08)',
                                    '&:hover': { borderColor: t.palette.primary.main },
                                })}
                            >
                                <Box
                                    sx={(t) => ({
                                        px: 1.5,
                                        py: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 1,
                                        background: `linear-gradient(90deg, ${alpha(t.palette.secondary.main, 0.14)} 0%, rgba(255,255,255,0) 75%)`,
                                        borderBottom: '1px solid rgba(2,6,23,0.08)',
                                    })}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 900 }} noWrap title={postTitle}>
                                            {postTitle}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {postHandle ? `@${postHandle} • ` : ''}{latestTime ? timeLabel(latestTime) : ''}
                                        </Typography>
                                    </Box>

                                    <Box
                                        sx={(t) => ({
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            px: 1.1,
                                            py: 0.4,
                                            borderRadius: 999,
                                            border: `1px solid ${alpha(t.palette.primary.main, 0.16)}`,
                                            bgcolor: alpha(t.palette.primary.main, 0.06),
                                        })}
                                    >
                                        <Typography variant="caption" sx={{ fontWeight: 900, color: 'primary.main' }}>
                                            {total === 1 ? '1 comment' : `${total} comments`}
                                        </Typography>
                                    </Box>
                                </Box>

                                <Box sx={{ px: 1.5, py: 1.25, display: 'grid', gap: 1 }}>
                                    {comments.slice(0, 3).map((c) => {
                                        const cText = String(c?.content || '').trim();
                                        const isReply = !!c?.parent_id;
                                        const cTime = c?.created_at || c?.createdAt || null;

                                        return (
                                            <Box
                                                key={`comment-${c?.id || c?.comment_id || ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openComment(c);
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        openComment(c);
                                                    }
                                                }}
                                                sx={(t) => ({
                                                    border: '1px solid',
                                                    borderColor: 'rgba(2,6,23,0.08)',
                                                    borderRadius: 2,
                                                    px: 1.25,
                                                    py: 1,
                                                    bgcolor: alpha(t.palette.primary.main, 0.02),
                                                    '&:hover': { borderColor: alpha(t.palette.primary.main, 0.32) },
                                                })}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>
                                                        {isReply ? 'Reply' : 'Comment'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {cTime ? timeLabel(cTime) : ''}
                                                    </Typography>
                                                </Box>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontWeight: 800,
                                                        color: 'text.primary',
                                                        mt: 0.5,
                                                        whiteSpace: 'pre-wrap',
                                                        overflowWrap: 'anywhere',
                                                    }}
                                                >
                                                    {truncate(cText, 260)}
                                                </Typography>
                                            </Box>
                                        );
                                    })}

                                    {total > 3 ? (
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                                            View all comments on this post
                                        </Typography>
                                    ) : null}
                                </Box>
                            </Box>
                        );
                    })}

                    <Box ref={sentinelRef} sx={{ height: 1 }} />
                </Box>
            );
        },
        [activeCanView, engagementLoading, engagementError, tab, isScrollBox, onOpenComment]
    );

    const tabStyles = {
        minHeight: { xs: 46, sm: 58 },
        '& .MuiTab-root': {
            textTransform: 'none',
            minHeight: { xs: 46, sm: 58 },
            fontWeight: 700,
            py: { xs: 0.75, sm: 1.05 },
            '& .MuiTab-iconWrapper': {
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
            },
        },
    };

    return (
        <Card
            ref={topRef}
            variant="outlined"
            sx={{
                borderRadius: 3,
                overflow: 'hidden', // important: allows bottom sticky bar to follow rounded card corners cleanly
                borderColor: (t) => alpha(t.palette.primary.main, 0.14),
                boxShadow: '0 14px 44px rgba(15, 23, 42, 0.10)',
                bgcolor: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                ...(isScrollBox ? { height: scrollBoxHeight || 680, maxHeight: scrollBoxHeight || 680 } : null),
            }}
        >
            {/* Sticky header stack: title + tabs + filters */}
            <Box
                sx={{
                    position: 'sticky',
                    top: stickyTop,
                    zIndex: 5,
                    bgcolor: '#FFFFFF',
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        background: (t) => `linear-gradient(90deg, ${alpha(t.palette.secondary.main, 0.18)} 0%, ${alpha(t.palette.secondary.main, 0.04)} 60%, rgba(255,255,255,0) 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
                            Community Activity
                        </Typography>
                    </Box>

                    {
                        <Tooltip title={tab === 0 ? 'View all posts' : tab === 1 ? 'View all comments' : tab === 2 ? 'View all liked posts' : 'View all reposts'}>
                            <IconButton
                                size="small"
                                onClick={() => onExpandPosts?.(tab)}
                                aria-label={tab === 0 ? 'View all posts' : tab === 1 ? 'View all comments' : tab === 2 ? 'View all liked posts' : 'View all reposts'}
                            >
                                <OpenInFullIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    }
                </Box>

                {/* Tabs */}
                <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={tabStyles}>
                        <Tab
                            icon={<TabImgIcon src={postsIcon} alt="Posts" size={{ xs: 22, sm: 26 }} />}
                            iconPosition="start"
                            label="Posts"
                            {...a11yProps(0)}
                        />
                        <Tab
                            icon={<TabImgIcon src={commentIconLit} alt="Comments" size={{ xs: 22, sm: 26 }} />}
                            iconPosition="start"
                            label="Comments"
                            {...a11yProps(1)}
                        />
                        <Tab
                            icon={<TabImgIcon src={likeIconLit} alt="Likes" size={{ xs: 24, sm: 30 }} squeezeX={0.80} />}
                            iconPosition="start"
                            label="Likes"
                            {...a11yProps(2)}
                        />
                        <Tab
                            icon={<TabImgIcon src={repostIconLit} alt="Reposts" size={{ xs: 22, sm: 26 }} />}
                            iconPosition="start"
                            label="Reposts"
                            {...a11yProps(3)}
                        />
                    </Tabs>
                </Box>

                {/* Filters (ONLY: Category + Sort) */}
                <Box
                    sx={{
                        p: 1.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
                    }}
                >
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 1,
                            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                            alignItems: 'center',
                        }}
                    >
                        <FormControl size="small" fullWidth>
                            <InputLabel id="profile-activity-category-label" shrink>
                                Category
                            </InputLabel>
                            <Select
                                labelId="profile-activity-category-label"
                                id="profile-activity-category-select"
                                label="Category"
                                value={category}
                                onChange={(e) => setCategory(String(e.target.value || ''))}
                                displayEmpty
                                renderValue={(val) => {
                                    const v = String(val || '').trim().toLowerCase();
                                    if (!v) return 'All Categories';
                                    const found = categoryOptions.find((c) => c.id === v);
                                    return found ? found.label : v;
                                }}
                            >
                                <MenuItem value="">All Categories</MenuItem>
                                {categoryOptions.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" fullWidth>
                            <InputLabel id="profile-activity-sort-label" shrink>Sort by</InputLabel>
                            <Select
                                labelId="profile-activity-sort-label"
                                label="Sort by"
                                value={sortBy}
                                onChange={(e) => setSortBy(String(e.target.value || 'newest'))}
                            >
                                {SORT_OPTIONS.map((o) => (
                                    <MenuItem key={o.value} value={o.value}>
                                        {o.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </Box>
            </Box>

            {/* Body: internal scroll area + pinned footer */}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: isScrollBox ? 1 : 'unset',
                    minHeight: 0,
                }}
            >
                {/* Scroll area (becomes an internal scroll box only after the left rail ends) */}
                <Box
                    ref={scrollerRef}
                    data-profile-posts-scroll
                    className="profile-posts-scroller"
                    onClickCapture={blockLocationClicks}
                    onKeyDownCapture={blockLocationClicks}
                    sx={{
                        flex: isScrollBox ? 1 : 'unset',
                        minHeight: 0,
                        overflowY: isScrollBox ? 'auto' : 'visible',
                        overscrollBehaviorY: isScrollBox ? 'contain' : 'auto',
                    }}
                >
                    {/* Content */}
                    <Box
                        sx={{
                            p: 0,
                            minHeight: isScrollBox ? '100%' : 0,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <TabPanel value={tab} index={0}>
                            {renderList(visibleList, {
                                title: 'No current activity',
                                body: "This user doesn’t have any posts yet.",
                                icon: <TabImgIcon src={postsIcon} alt="Posts" size={{ xs: 56, sm: 62 }} />,
                            })}
                        </TabPanel>

                        <TabPanel value={tab} index={1}>
                            {renderComments(visibleList)}
                        </TabPanel>

                        <TabPanel value={tab} index={2}>
                            {renderList(visibleList, {
                                title: 'No liked posts',
                                body: "This user hasn’t liked any posts yet.",
                                icon: <TabImgIcon src={likeIconLit} alt="Likes" size={{ xs: 58, sm: 64 }} squeezeX={0.80} />,
                            })}
                        </TabPanel>

                        <TabPanel value={tab} index={3}>
                            {renderList(visibleList, {
                                title: 'No reposts',
                                body: "This user hasn’t reposted anything yet.",
                                icon: <TabImgIcon src={repostIconLit} alt="Reposts" size={{ xs: 56, sm: 62 }} />,
                            })}
                        </TabPanel>
                    </Box>
                </Box>

                {/* Footer counts (FILTER-ACCURATE) — always pinned to the bottom of the card in scroll-box mode */}
                <Box
                    sx={{
                        flexShrink: 0,
                        bgcolor: '#FFFFFF',
                        px: 2,
                        py: 1,
                        minHeight: STICKY_FOOTER_HEIGHT,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        borderRadius: '0 0 24px 24px',
                        // iOS safe area friendliness (won't hurt desktop)
                        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
                    }}
                >
                    <Box
                        sx={{
                            px: 2.25,
                            py: 0.6,
                            borderRadius: 999,
                            bgcolor: (t) => alpha(t.palette.secondary.main, 0.10),
                            border: (t) => `1px solid ${alpha(t.palette.secondary.main, 0.22)}`,
                        }}
                    >
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                            {countText}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Helpers */}
            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={userForCard}
                isSelf={!!(me && me.handle === userForCard?.handle)}
                following={false}
                onFollow={() => {}}
                onMessage={() =>
                    window.dispatchEvent(new CustomEvent('open-message-center', { detail: { userId: userForCard?.id } }))
                }
                onViewProfile={(u) => {
                    setUserAnchor(null);
                    navigate(`/${u.handle || u.id}`);
                }}
            />
            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={me} post={sharePost} />
        </Card>
    );
}