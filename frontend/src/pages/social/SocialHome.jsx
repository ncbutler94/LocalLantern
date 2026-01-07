// src/pages/social/SocialHome.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    IconButton,
    InputAdornment,
    Paper,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import axios from 'axios';

import CityCountySelect from '../../components/CityCountySelect';
import { useAuth } from '../../components/AuthModalContext';
import UserCardPopover from '../../components/UserCardPopover';

const api = process.env.REACT_APP_API_URL;
const PAGE_BG = '#EEF2F7';

// --- helpers ---
const toName = (u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
const toHandle = (u) => (u?.handle ? `@${u.handle}` : u?.username ? `@${u.username}` : '');

// --- Card ---
function UserCard({ user, onOpenUserCard }) {
    const goProfile = () => {
        const slug = user.handle || user.public_id || user.id;
        if (slug) window.location.assign(`/${encodeURIComponent(slug)}`);
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 1.5,
                borderRadius: 2,
                width: '100%',
                transition: 'box-shadow .15s ease',
                '&:hover': { boxShadow: 2 },
            }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 1.25,
                    alignItems: 'center',
                }}
            >
                <Avatar
                    src={user.profile_picture || user.avatar_url || ''}
                    alt={toName(user)}
                    variant="square"
                    sx={{ bgcolor: 'grey.600', width: 96, height: 96, borderRadius: 1, cursor: 'pointer' }}
                    onClick={goProfile}
                />
                <Box sx={{ minWidth: 0 }}>
                    <Typography
                        variant="subtitle1"
                        noWrap
                        sx={{ cursor: 'pointer' }}
                        onClick={goProfile}
                        title={toName(user)}
                    >
                        {toName(user) || '(name hidden)'}
                    </Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        title={toHandle(user)}
                        sx={{ cursor: 'pointer' }}
                        onClick={goProfile}
                    >
                        {toHandle(user)}
                    </Typography>
                </Box>

                <Box sx={{ justifySelf: 'end' }}>
                    <IconButton size="small" onClick={(e) => onOpenUserCard(e.currentTarget, user)}>
                        <MoreHorizIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>
        </Paper>
    );
}

// --- Page ---
export default function SocialHome({ me }) {
    const auth = useAuth?.() || { open: () => {} };

    // ---- Viewport-fit layout ----
    // This page lives under the site header, so using `minHeight: 100vh` makes the document
    // taller than the viewport (header + 100vh), which creates an "empty" body scroll.
    // We measure how far from the top of the viewport this component starts, then size it to
    // exactly fill the remaining viewport height and keep scrolling inside the results panel.
    const pageRef = useRef(null);
    const [availableHeight, setAvailableHeight] = useState(null);

    const measureAvailableHeight = useCallback(() => {
        if (!pageRef.current) return;
        const rect = pageRef.current.getBoundingClientRect();
        const h = Math.max(0, window.innerHeight - rect.top);
        setAvailableHeight(h);
    }, []);

    useLayoutEffect(() => {
        measureAvailableHeight();
        // One extra frame helps when the header height settles after hydration/layout.
        const raf = window.requestAnimationFrame(measureAvailableHeight);
        return () => window.cancelAnimationFrame(raf);
    }, [measureAvailableHeight]);

    useEffect(() => {
        window.addEventListener('resize', measureAvailableHeight);
        return () => window.removeEventListener('resize', measureAvailableHeight);
    }, [measureAvailableHeight]);

    // If `me` isn't provided, fetch the viewer like CommunityPage.
    const [meLocal, setMeLocal] = useState(null);
    useEffect(() => {
        if (me) return;
        let alive = true;
        fetch('/users/profile', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (alive) setMeLocal(j?.user || null); })
            .catch(() => { if (alive) setMeLocal(null); });
        return () => { alive = false; };
    }, [me]);
    const viewer = me || meLocal;

    const [tab, setTab] = useState(0);
    const [search, setSearch] = useState('');
    const [place, setPlace] = useState({ county: '', city: '' });

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);

    const counts = useMemo(
        () => ({ following: following.length, followers: followers.length }),
        [following, followers]
    );

    // ---------- POPUP STATE + LOGIC (same as CommunityList) ----------
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);

    // Server‑verified following set keyed by user id (target user id)
    const [serverFollowingSet, setServerFollowingSet] = useState(() => new Set());
    // Local optimistic flips
    const [locallyFollowed, setLocallyFollowed] = useState(() => new Set());

    const openAuthUI = useCallback(() => {
        if (auth && typeof auth.open === 'function') {
            auth.open();
            return;
        }
        try { window.dispatchEvent(new CustomEvent('open-auth-modal')); } catch { /* no-op */ }
    }, [auth]);

    const requireAuth = useCallback(
        (cb) => {
            if (viewer) return cb?.();
            openAuthUI();
            return undefined;
        },
        [viewer, openAuthUI]
    );

    // Hydrate target from /users/public/:handleOrId to resolve numeric id and current follow state
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
                    const res = await axios.get(u, { withCredentials: true });
                    const profile = res?.data?.profile;
                    if (!profile) continue;

                    setUserForCard((prev) => {
                        if (!prev) return prev;
                        if (!prev.id && profile.id) return { ...prev, id: profile.id };
                        return prev;
                    });

                    // Am I in THEIR followers? (same derivation as profile/community)
                    const sj =
                        typeof profile.social_json === 'string'
                            ? JSON.parse(profile.social_json || '{}')
                            : profile.social_json || {};
                    const theirFollowers = Array.isArray(sj?.followers) ? sj.followers : [];
                    const isF = !!viewer?.id && theirFollowers.includes(Number(viewer.id));
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
        [viewer?.id]
    );

    const handleOpenUserCard = (el, user) => {
        setUserAnchor(el);
        setUserForCard({
            id: user?.id, // may be undefined; hydrate will fill
            first_name: user?.first_name,
            last_name: user?.last_name,
            handle: user?.handle,
            avatar_url: user?.avatar_url || user?.profile_picture,
            profile_picture: user?.profile_picture,
        });
        hydrateTargetFromPublic(user); // fire-and-forget
    };

    const isSelf = useMemo(() => {
        if (!viewer || !userForCard) return false;
        const idMatch = Number(viewer.id) === Number(userForCard.id);
        const handleMatch =
            (viewer.handle && userForCard.handle) &&
            String(viewer.handle).toLowerCase() === String(userForCard.handle).toLowerCase();
        return idMatch || !!handleMatch;
    }, [viewer, userForCard]);

    const isFollowingForCard = useMemo(() => {
        const tid = Number(userForCard?.id);
        if (!tid) return false;
        return serverFollowingSet.has(tid) || locallyFollowed.has(tid);
    }, [userForCard, serverFollowingSet, locallyFollowed]);

    const postFollow = async (targetId) => {
        const payload = { target_id: targetId, action: 'follow' };
        const urls = [`${api}/users/follow`, '/api/users/follow', '/users/follow'].filter(Boolean);
        for (const url of urls) {
            try {
                await axios.post(url, payload, { withCredentials: true });
                return true;
            } catch {
                /* try next */
            }
        }
        return false;
    };

    const handleFollow = async (targetUser) => {
        const tid0 = Number(targetUser?.id || userForCard?.id);
        const handle0 = targetUser?.handle || userForCard?.handle;
        if (!tid0 && !handle0) return;
        if (isSelf) return;

        requireAuth(async () => {
            // Ensure numeric id
            let tid = tid0;
            if (!tid && handle0) {
                const p = await hydrateTargetFromPublic({ handle: handle0 });
                if (p?.id) tid = Number(p.id);
            }
            if (!tid) return;

            // Optimistic flip
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
                // rollback
                setLocallyFollowed((prev) => {
                    const next = new Set(prev);
                    next.delete(tid);
                    return next;
                });
            }
        });
    };

    const handleMessage = (targetUser) => {
        const tid = Number(targetUser?.id || userForCard?.id);
        if (!tid) return;
        requireAuth(() => {
            window.dispatchEvent(
                new CustomEvent('open-message-center', { detail: { userId: tid } })
            );
        });
    };

    const handleViewProfile = (u) => {
        setUserAnchor(null);
        const slug = u.handle || u.id;
        if (slug) window.location.assign(`/${slug}`);
    };
    // -------------------------------------------------------------------------

    // --- data fetch (All search) ---
    const fetchAll = async (overrides = {}) => {
        setLoading(true);
        try {
            const effectiveSearch = overrides.search !== undefined ? overrides.search : search;
            const effectivePlace  = overrides.place  !== undefined ? overrides.place  : place;

            const qs = new URLSearchParams();
            const q = (effectiveSearch || '').trim();
            if (q) qs.set('q', q);
            if (effectivePlace?.county) qs.set('county', effectivePlace.county);
            if (effectivePlace?.city)   qs.set('city',   effectivePlace.city);

            const r = await fetch(`${api}/users/search?${qs.toString()}`, { credentials: 'include' });
            const j = await r.json();
            const arr = Array.isArray(j) ? j : Array.isArray(j?.users) ? j.users : [];
            setRows(arr);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    // --- data fetch (Followers/Following like profile FollowsSection) ---
    const fetchSocial = useCallback(async () => {
        try {
            if (!viewer) { setFollowing([]); setFollowers([]); setServerFollowingSet(new Set()); return; }
            // Prefer numeric id or public_id, then handle — same as FollowsSection/Community
            const who = viewer?.public_id || viewer?.id || viewer?.handle;
            const r = await axios.get(
                `${api}/users/social/${encodeURIComponent(who)}`,
                { withCredentials: true }
            );
            const data = r?.data || {};
            const followingArr = Array.isArray(data?.following) ? data.following : [];
            const followersArr = Array.isArray(data?.followers) ? data.followers : [];
            setFollowing(followingArr);
            setFollowers(followersArr);

            // 🔑 Seed "already following" immediately so the popover shows disabled gray “Following”
            // for anyone you already follow — exactly how Community works.
            const ids = followingArr.map((u) => Number(u?.id)).filter(Boolean);
            setServerFollowingSet(new Set(ids));
        } catch {
            setFollowing([]); setFollowers([]); setServerFollowingSet(new Set());
        }
    }, [viewer]);

    useEffect(() => { fetchSocial(); }, [fetchSocial]);
    useEffect(() => { fetchAll(); }, []); // initial

    const onSearch = () => fetchAll();
    const onClear  = () => {
        const clearedPlace = { county: '', city: '' };
        setSearch(''); setPlace(clearedPlace);
        fetchAll({ search: '', place: clearedPlace });
    };

    const list = tab === 0 ? rows : tab === 1 ? following : followers;

    // --- layout constants ---
    const CARD_W = 450;                // width of each card (px)
    const GAP_U  = 5;                  // MUI spacing units; 5 => 40px between columns

    // Single card should align LEFT; two-per-row otherwise
    const isSingleRow = list.length <= 1;

    return (
        <Box
            ref={pageRef}
            sx={{
                bgcolor: PAGE_BG,
                // Fit the remaining viewport height so the browser page itself doesn't scroll.
                // The results panel below will scroll internally.
                height: availableHeight ? `${availableHeight}px` : '100dvh',
                overflow: 'hidden',
                boxSizing: 'border-box',
            }}
        >
            <Box
                sx={{
                    maxWidth: 1100,
                    mx: 'auto',
                    px: 2,
                    pt: 4,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    minHeight: 0,
                }}
            >
                {/* Filters */}
                <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                        <Tab label="All" />
                        <Tab label={`Following (${counts.following})`} />
                        <Tab label={`Followers (${counts.followers})`} />
                    </Tabs>

                    {/* Put County/City to the RIGHT of the search box (same row on md+). */}
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 1,
                            alignItems: 'center',
                            gridTemplateColumns: {
                                xs: '1fr',
                                md: 'minmax(260px, 1fr) minmax(320px, 420px) auto auto',
                            },
                        }}
                    >
                        <TextField
                            label="Name or @username"
                            size="small"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            sx={{ minWidth: 0 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <CityCountySelect
                            city={place.city}
                            setCity={(v) => setPlace((p) => ({ ...p, city: v }))}
                            county={place.county}
                            setCounty={(v) => setPlace((p) => ({ ...p, county: v }))}
                            sx={{ m: 0, width: '100%' }}
                            selectSx={{ '& .MuiFormLabel-asterisk': { display: 'none' } }}
                        />

                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<SearchIcon />}
                            onClick={onSearch}
                            disabled={loading}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            Search
                        </Button>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ClearIcon />}
                            onClick={onClear}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            Clear
                        </Button>
                    </Box>
                </Paper>

                {/* Results: fills remaining height; scrolls internally (no page scroll) */}
                <Paper
                    variant="outlined"
                    sx={{
                        p: 2,
                        borderRadius: 2,
                        flex: 1,
                        minHeight: 320,
                        overflow: 'hidden', // child below is the scroll area
                    }}
                >
                    {loading ? (
                        <Typography sx={{ p: 2 }} color="text.secondary">
                            Loading…
                        </Typography>
                    ) : list.length === 0 ? (
                        <Typography sx={{ p: 2 }} color="text.secondary">
                            No users found.
                        </Typography>
                    ) : (
                        // SCROLL REGION
                        <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                            {/* Grid: 2 fixed-width columns on md+, 1 column on xs; center the group,
                                BUT if there’s only one item, left-align the grid. */}
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                        xs: '1fr',
                                        md: isSingleRow ? '1fr' : `repeat(2, ${CARD_W}px)`,
                                    },
                                    justifyContent: { md: isSingleRow ? 'flex-start' : 'center' },
                                    columnGap: GAP_U,
                                    rowGap: GAP_U,
                                }}
                            >
                                {list.map((u) => (
                                    <Box key={u.id} sx={{ width: '100%' }}>
                                        <UserCard user={u} onOpenUserCard={handleOpenUserCard} />
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}
                </Paper>
            </Box>

            {/* User popover (3‑dots) */}
            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={userForCard}
                isSelf={isSelf}
                following={isFollowingForCard}
                onFollow={handleFollow}
                onMessage={handleMessage}
                onViewProfile={handleViewProfile}
            />
        </Box>
    );
}
