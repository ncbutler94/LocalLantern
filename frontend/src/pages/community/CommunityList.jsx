// src/pages/community/CommunityList.jsx
//
// Responsive grid (1/2 per row), consistent card height, and category Chip
// in the top-right of each card header. Selected card shows a light gray highlight.
//
// Follow fixes in this version:
// • Follow/Message on the user card are auth‑gated (same as Profile page).
// • POST uses the same URL strategy as Profile page: `${api}/users/follow` ➜ '/api/users/follow' ➜ '/users/follow'.
// • We resolve the target via `/users/public/:handleOrId` (same as Profile page) so we always have the correct numeric `id`.
// • The button flips to disabled gray “Following” immediately (optimistic), and stays that way.
// • Already‑followed users render “Following” immediately because we derive state from the **target’s** followers list,
//   just like the Profile page does (not from the viewer cache).
//
// UPDATED (infinite scroll):
// • PAGE_SIZE = 100
// • Prefetch when the user scrolls past item #90 of the current page
// • Continues loading with no page cap while the server returns full pages
//
// Based on your original file with no truncation.

import React, { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import {
    Box,
    Card,
    CardHeader,
    CardActions,
    Avatar,
    Typography,
    Link,
    CardActionArea,
    Chip,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import ReportIcon from '@mui/icons-material/Report';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PanToolIcon from '@mui/icons-material/PanTool';
import SearchIcon from '@mui/icons-material/Search';

import ActionBar from '../../components/ActionBar';
import UserCardPopover from '../../components/UserCardPopover';
import SharePostDialog from '../../components/SharePostDialog';
import { useAuth } from '../../components/AuthModalContext';

const api = process.env.REACT_APP_API_URL || '';

/* ---------- helpers ---------- */
const formatDate = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};
const formatTime = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};
const dateTimeLabel = (v) => {
    const a = formatDate(v);
    const b = formatTime(v);
    return a && b ? `${a} · ${b}` : a || b || '';
};

/* Currency-ish formatter for rewards (accepts number or string) */
const formatReward = (val) => {
    if (val === null || typeof val === 'undefined') return '';
    const num = typeof val === 'string' ? Number(val.replace(/[^0-9.-]/g, '')) : Number(val);
    if (Number.isFinite(num)) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: num % 1 === 0 ? 0 : 2,
            }).format(num);
        } catch {
            /* fallback */
        }
    }
    return String(val);
};

const BADGE = {
    announcement: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },

    discussion: { label: 'Discussion', color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion': { label: 'Discussion', color: '#2e7d32', Icon: ChatBubbleIcon },

    // Split recommendations & tips
    tips: { label: 'Tip', color: '#fdd835', Icon: LightbulbIcon },
    recommendations: { label: 'Recommendation', color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips': { label: 'Tip/Rec', color: '#fdd835', Icon: LightbulbIcon }, // legacy fallback

    // Split volunteer & help requests
    'help-requests': { label: 'Help Request', color: '#0097a7', Icon: PanToolIcon },
    volunteers: { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests': { label: 'Volunteer/Help', color: '#0097a7', Icon: PanToolIcon }, // legacy fallback

    'lost-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'lost-and-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },

    'public-safety-alerts': { label: 'Safety Alert', color: '#e53935', Icon: ReportIcon },
};

const toHoverKey = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : String(val ?? '');
};

const deriveSplitCategory = (post) => {
    // Normalize to new slugs when legacy category remains
    let cat = String(post?.category || '').toLowerCase();

    if (cat === 'recommendations-tips') {
        const rt = String(post?.rec_type || '').toLowerCase();
        if (rt === 'tip' || rt === 'tips') return 'tips';
        if (rt === 'business' || rt === 'recommendation' || rt === 'recommendations') return 'recommendations';
        return 'recommendations';
    }

    if (cat === 'volunteer-requests' || cat === 'volunteer-help-requests') {
        const kind = String(post?.request_kind || post?.requestKind || '').toLowerCase();
        if (kind === 'volunteer' || kind === 'offer' || kind === 'offering') return 'volunteers';
        if (kind === 'help' || kind === 'request' || kind === 'help-request' || kind === 'help_request') return 'help-requests';
        // Fallback for legacy rows (no request_kind): treat as Help Requests (matches current seed data)
        return 'help-requests';
    }

    return cat;
};

const buildBadgeFor = (post) => {
    if (!post) return null;
    if (post.category === 'public-safety-alerts') {
        return { label: 'Safety Alert', color: '#e53935', Icon: ReportIcon };
    }
    if (post.lost_or_found) {
        return {
            label: post.lost_or_found === 'found' ? 'Found' : 'Lost',
            color: '#fb8c00',
            Icon: SearchIcon,
        };
    }
    const cat = deriveSplitCategory(post);
    return BADGE[cat] || null;
};

const extractPhotos = (post) => {
    if (!post) return [];
    let processed = [];
    const { photos } = post;

    if (Array.isArray(photos)) {
        processed = photos.filter((p) => p && typeof p === 'string' && p !== 'null');
    } else if (typeof photos === 'string' && photos !== 'null' && photos.trim()) {
        try {
            const parsed = JSON.parse(photos);
            if (Array.isArray(parsed)) {
                processed = parsed.filter((p) => p && typeof p === 'string' && p !== 'null');
            }
        } catch {
            processed = [photos];
        }
    }

    if (!processed.length) {
        const oneOffs = [
            post.photo_url,
            post.photo,
            post.image_url,
            post.image,
            post.thumbnail,
            post.main_photo_url,
            post.cover,
            post.cover_url,
        ]
            .filter((u) => typeof u === 'string' && u && u !== 'null')
            .slice(0, 1);
        if (oneOffs.length) processed = oneOffs;
    }
    if (!processed.length && Array.isArray(post.community_photos)) {
        processed = post.community_photos.map((r) => r?.url || r?.photo_url || r?.path || null).filter(Boolean);
    }
    if (!processed.length && typeof post.photos_json === 'string') {
        try {
            const arr = JSON.parse(post.photos_json);
            if (Array.isArray(arr)) processed = arr.filter((u) => typeof u === 'string' && u);
        } catch {
            /* ignore */
        }
    }
    return processed;
};

/* ============================================================================ */
export const PostCard = memo(function PostCard({
                                                   post,
                                                   user,
                                                   hoveredId,
                                                   setHoveredId,
                                                   onLocationClick,
                                                   onCardClick,
                                                   onOpenUserCard,
                                                   onOpenShare,
                                                   selectedId,
                                                   selectable = false,
                                               }) {
    const {
        id,
        first_name,
        last_name,
        handle,
        avatar_url,
        profile_picture,
        date_created,
        posted_at,
        title,
        description,
        city,
        county,
        street_address,
        likesCount,
        likes_count,
        like_count,
        likes,
        viewerLiked,
        viewer_liked,
        liked,
        is_liked,
        commentsCount,
        comments_count,
        comment_count,
        comments,
        repostsCount,
        reposts_count,
        repost_count,
        reposts,
        viewerReposted,
        viewer_reposted,
        reposted,
        is_reposted,
        category,
        lost_or_found,
        help_type,  // for legacy volunteer/help split
        request_kind,
        requestKind,
        rec_type,   // for legacy tips/recommendations split
        reward,     // provided by API
        user_id,    // post author id (preferred)
    } = post;

    const finalLikesCount = Number(likesCount ?? likes_count ?? like_count ?? likes ?? 0);
    const finalViewerLiked = Boolean(viewerLiked ?? viewer_liked ?? liked ?? is_liked ?? false);
    const finalCommentsCount = Number(commentsCount ?? comments_count ?? comment_count ?? comments ?? 0);
    const finalRepostsCount = Number(repostsCount ?? reposts_count ?? repost_count ?? reposts ?? 0);
    const finalViewerReposted = Boolean(viewerReposted ?? viewer_reposted ?? reposted ?? is_reposted ?? false);

    const avatarSrc = avatar_url || profile_picture || '';
    const postDate = date_created || posted_at;

    const [imgError, setImgError] = useState(false);

    const processedPhotos = extractPhotos(post);
    const mainPhoto = processedPhotos[0] || '';
    const showImage = !!mainPhoto && !imgError;

    const countyLabel = county ? (String(county).toLowerCase().includes('county') ? county : `${county} County`) : '';
    const locationStr = [post.city, countyLabel].filter(Boolean).join(', ');

    const safeDesc = typeof description === 'string' ? description : (description ?? '').toString();

    /* Short preview + "more" hint */
    const WORD_LIMIT = 18;
    const words = safeDesc.trim().split(/\s+/);
    const long = words.length > WORD_LIMIT;
    const preview = long ? `${words.slice(0, WORD_LIMIT).join(' ')}...` : safeDesc;

    const badgeMeta = buildBadgeFor({ category, lost_or_found, rec_type, help_type, request_kind, requestKind });
    const actionChip = (() => {
        if (!badgeMeta) return null;
        const IconComp = badgeMeta.Icon;
        return (
            <Chip
                size="small"
                label={badgeMeta.label}
                icon={<IconComp />}
                sx={{
                    bgcolor: badgeMeta.color,
                    color: '#fff',
                    '& .MuiChip-icon': { color: '#fff !important' },
                    '& .MuiChip-label': { fontWeight: 600, color: '#fff' },
                }}
            />
        );
    })();

    const openUserCard = (e) => {
        e.stopPropagation();
        onOpenUserCard(e.currentTarget, {
            id: user_id || undefined, // prefer server-provided author id
            first_name,
            last_name,
            handle,
            avatar_url: avatarSrc,
        });
    };

    const fireLocationClick = (e) => {
        e.stopPropagation();
        onLocationClick?.(post);
    };
    const onLocKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fireLocationClick(e);
        }
    };

    const hoverKey = useMemo(() => toHoverKey(id), [id]);
    const isHovered = String(hoveredId ?? '') === String(hoverKey);
    const isSelected = selectable && String(selectedId ?? '') === String(id);

    const showRewardChip =
        String(lost_or_found).toLowerCase() === 'lost' &&
        reward !== undefined &&
        reward !== null &&
        String(reward).trim() !== '' &&
        String(reward).trim() !== '0';

    return (
        <Card
            data-post-id={id}
            data-selected={isSelected ? 'true' : 'false'}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: 360,
                borderRadius: 2,
                border: 1,
                borderColor: isSelected ? 'divider' : (isHovered ? 'primary.light' : 'divider'),
                bgcolor: isSelected ? 'action.selected' : (isHovered ? 'action.hover' : 'background.paper'),
                overflow: 'hidden',
                boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
                transition: 'background-color 120ms ease, border-color 120ms ease',
                backgroundClip: 'padding-box',
            }}
            onMouseEnter={() => setHoveredId?.(hoverKey)}
            onMouseLeave={() => setHoveredId?.(null)}
        >
            <CardHeader
                action={actionChip}
                avatar={
                    <Avatar src={avatarSrc} sx={{ cursor: 'pointer' }} onClick={openUserCard}>
                        {first_name?.[0]}
                    </Avatar>
                }
                title={
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle1" fontWeight={600} sx={{ cursor: 'pointer' }} onClick={openUserCard}>
                            {first_name} {last_name}
                        </Typography>
                        {!!handle && (
                            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'pointer' }} onClick={openUserCard}>
                                @{handle}
                            </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {dateTimeLabel(postDate)}
                        </Typography>
                    </Box>
                }
                sx={{ pb: 0 }}
            />

            <CardActionArea onClick={() => onCardClick?.(post)} sx={{ flex: 1, px: 2, py: showImage ? 1.5 : 0.5 }}>
                <Box sx={{ display: 'flex', gap: showImage ? 2 : 0 }}>
                    {showImage && (
                        <Box
                            component="img"
                            src={mainPhoto}
                            loading="lazy"
                            onError={() => setImgError(true)}
                            sx={{
                                width: 120,
                                height: 120,
                                objectFit: 'cover',
                                borderRadius: 1,
                                flexShrink: 0,
                            }}
                            alt=""
                        />
                    )}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {title && (
                            <Typography variant="h6" sx={{ mt: 0.5, fontSize: '1.1rem', wordBreak: 'break-word' }}>
                                {title}
                            </Typography>
                        )}
                        {preview && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                    mt: 0.5,
                                    lineHeight: 1.4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {preview}
                                {long && (
                                    <>
                                        {' '}<Link component="span" underline="hover" color="inherit">more</Link>
                                    </>
                                )}
                            </Typography>
                        )}

                        {/* Reward for Lost items */}
                        {showRewardChip && (
                            <Chip
                                size="small"
                                label={`Reward: ${formatReward(reward)}`}
                                sx={{ alignSelf: 'flex-start', mt: 0.75, fontWeight: 600 }}
                            />
                        )}
                    </Box>
                </Box>
            </CardActionArea>

            {(city || county || street_address) && (
                <Box
                    sx={{
                        px: 2,
                        pb: 0.5,
                        mb: 1.25, // extra space between address and the action bar
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontSize: '0.875rem',
                    }}
                >
                    <LocationOnIcon fontSize="small" color="action" />
                    {/* Entire address line is one clickable, underlined element */}
                    <Typography
                        variant="body2"
                        role="button"
                        tabIndex={0}
                        aria-label="View this location on the map"
                        onClick={fireLocationClick}
                        onKeyDown={onLocKey}
                        sx={{
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            color: 'text.secondary',
                            '&:hover': { color: 'primary.main' },
                        }}
                    >
                        {street_address ? (
                            <>
                                {street_address}{locationStr ? ` ${locationStr}` : ''}
                            </>
                        ) : (
                            locationStr
                        )}
                    </Typography>
                </Box>
            )}

            <CardActions sx={{ px: 2, pt: 0, pb: 2, mt: 'auto' }}>
                <ActionBar
                    user={user}
                    postId={id}
                    initialLikes={finalLikesCount}
                    initiallyLiked={!!finalViewerLiked}
                    commentsCount={finalCommentsCount}
                    initialReposts={finalRepostsCount}
                    initiallyReposted={!!finalViewerReposted}
                    onComment={() => onCardClick?.(post)}
                    onShare={() => onOpenShare(post)}
                />
            </CardActions>
        </Card>
    );
});
PostCard.displayName = 'PostCard';

/* Tiny inline loading indicator */
const LoadingDots = () => (
    <Box
        sx={{
            display: 'flex',
            gap: 1,
            '@keyframes b': {
                '0%,80%,100%': { transform: 'scale(0)' },
                '40%': { transform: 'scale(1)' },
            },
        }}
    >
        {[0, 1, 2].map((i) => (
            <Box
                key={i}
                sx={{
                    width: 10,
                    height: 10,
                    bgcolor: 'text.secondary',
                    borderRadius: '50%',
                    animation: 'b 1.4s infinite ease-in-out both',
                    animationDelay: `${i * 0.16}s`,
                }}
            />
        ))}
    </Box>
);

/* --------------------------------------------------------------------------
 * Pagination + virtualized render
 * ------------------------------------------------------------------------ */
const PAGE_SIZE = 100;       // ← load 100 at a time from the API
const PREFETCH_AT = 90;      // ← when scrolled past item #90, prefetch next 100
const LOCAL_CHUNK = 100;     // ← for the controlled (client‑only) list window
const MIN_BOTTOM_LOADER_MS = 250;

export default function CommunityList({
                                          user,
                                          posts,
                                          loading = false,
                                          hoveredId,
                                          setHoveredId,
                                          onLocationClick,
                                          onCardClick,
                                          query = '',
                                          selectedId = null,
                                          selectable = false,
                                      }) {
    const auth = useAuth();

    const controlled = typeof posts !== 'undefined';

    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(0);
    const [uLoading, setULoad] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const sentinelRef = useRef(null);
    const prefetchRef = useRef(null);
    const [deferEmpty, setDeferEmpty] = useState(true);

    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);

    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    // Virtualized rendering for the controlled case
    const [renderCount, setRenderCount] = useState(LOCAL_CHUNK);

    // Bottom loader timing (≥ 250ms)
    const [showBottomLoader, setShowBottomLoader] = useState(false);
    const bottomStartRef = useRef(0);
    const bottomTimerRef = useRef(null);
    const prevULoadingRef = useRef(uLoading);

    // Server‑verified following set keyed by user id (author id)
    const [serverFollowingSet, setServerFollowingSet] = useState(() => new Set());
    // Local optimistic follow flips (within this component lifetime)
    const [locallyFollowed, setLocallyFollowed] = useState(() => new Set());

    useEffect(() => {
        const wasLoading = prevULoadingRef.current;
        const pagingContext = !controlled && rows.length > 0 && hasMore;

        if (!wasLoading && uLoading && pagingContext) {
            bottomStartRef.current = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            setShowBottomLoader(true);
        }

        if (wasLoading && !uLoading && showBottomLoader) {
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsed = now - bottomStartRef.current;
            const remaining = Math.max(0, MIN_BOTTOM_LOADER_MS - elapsed);

            if (bottomTimerRef.current) clearTimeout(bottomTimerRef.current);
            bottomTimerRef.current = setTimeout(() => {
                setShowBottomLoader(false);
                bottomTimerRef.current = null;
            }, remaining || 0);
        }

        prevULoadingRef.current = uLoading;
    }, [uLoading, rows.length, hasMore, controlled, showBottomLoader]);

    useEffect(() => () => { if (bottomTimerRef.current) clearTimeout(bottomTimerRef.current); }, []);

    const hydrateTargetFromPublic = useCallback(async (target) => {
        // Fetch public profile to get the canonical numeric id and followers list,
        // mirroring the logic used on the Profile page.
        if (!target) return null;
        const handleOrId = target.handle || target.id;
        if (!handleOrId) return null;

        const urls = [
            `${api}/users/public/${encodeURIComponent(handleOrId)}`,
            `/users/public/${encodeURIComponent(handleOrId)}`,
            `/api/users/public/${encodeURIComponent(handleOrId)}`
        ].filter(Boolean);

        for (const u of urls) {
            try {
                const res = await axios.get(u, { withCredentials: true });
                const profile = res?.data?.profile;
                if (!profile) continue;

                // Update the card's user object with the numeric id if it was missing
                setUserForCard((prev) => {
                    if (!prev) return prev;
                    if (!prev.id && profile.id) return { ...prev, id: profile.id };
                    return prev;
                });

                // Derive following the SAME WAY the profile page does:
                // am *I* in the target's followers?
                const sj = typeof profile.social_json === 'string'
                    ? JSON.parse(profile.social_json || '{}')
                    : (profile.social_json || {});
                const followers = Array.isArray(sj?.followers) ? sj.followers : [];
                const isF = !!user?.id && followers.includes(Number(user.id));
                if (profile.id && isF) {
                    setServerFollowingSet((old) => {
                        const next = new Set(old);
                        next.add(Number(profile.id));
                        return next;
                    });
                }
                return profile;
            } catch (_e) {
                // try next URL
            }
        }
        return null;
    }, [user?.id]);

    const handleOpenUserCard = (el, author) => {
        setUserAnchor(el);
        setUserForCard({
            id: author?.id, // may be undefined; we'll hydrate from /users/public
            first_name: author?.first_name,
            last_name: author?.last_name,
            handle: author?.handle,
            avatar_url: author?.avatar_url,
        });
        // Fire-and-forget hydration to resolve id + following
        hydrateTargetFromPublic(author);
    };

    const openAuthUI = useCallback(() => {
        if (auth && typeof auth.open === 'function') {
            auth.open(); // same approach as ActionBar
            return;
        }
        try {
            window.dispatchEvent(new CustomEvent('open-auth-modal'));
        } catch {
            /* no-op */
        }
    }, [auth]);

    const requireAuth = useCallback(
        (cb) => {
            if (user) return cb?.();
            openAuthUI();
            return undefined;
        },
        [user, openAuthUI]
    );

    const handleViewProfile = (u) =>
        window.location.assign(`/${u.handle || u.id}`);

    // Message click: auth-gated, then open your message center event
    const handleMessage = (targetUser) => {
        const tid = Number(targetUser?.id || userForCard?.id);
        if (!tid) return;
        requireAuth(() => {
            window.dispatchEvent(
                new CustomEvent('open-message-center', { detail: { userId: tid } })
            );
        });
    };

    const isSelf = useMemo(() => {
        if (!user || !userForCard) return false;
        const idMatch = Number(user.id) === Number(userForCard.id);
        const handleMatch =
            (user.handle && userForCard.handle) &&
            String(user.handle).toLowerCase() === String(userForCard.handle).toLowerCase();
        return idMatch || !!handleMatch;
    }, [user, userForCard]);

    const isFollowingForCard = useMemo(() => {
        const tid = Number(userForCard?.id);
        if (!tid) return false;
        return serverFollowingSet.has(tid) || locallyFollowed.has(tid);
    }, [userForCard, serverFollowingSet, locallyFollowed]);

    // Follow → same URL strategy as the Profile page
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

    // Follow click: auth-gated; on success, mark as locally/serverside followed
    const handleFollow = async (targetUser) => {
        const tid0 = Number(targetUser?.id || userForCard?.id);
        const handle0 = targetUser?.handle || userForCard?.handle;
        if (!tid0 && !handle0) return; // cannot resolve
        if (isSelf) return;

        requireAuth(async () => {
            // Ensure we have the numeric id from /users/public before posting follow
            let tid = tid0;
            if (!tid && handle0) {
                const p = await hydrateTargetFromPublic({ handle: handle0 });
                if (p?.id) tid = Number(p.id);
            }
            if (!tid) return;

            // Optimistic: flip immediately
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
                // Rollback optimistic state if the API failed
                setLocallyFollowed((prev) => {
                    const next = new Set(prev);
                    next.delete(tid);
                    return next;
                });
            }
        });
    };

    const handleOpenShare = (post) => {
        setSharePost(post);
        setShareOpen(true);
    };

    useEffect(() => {
        const t = setTimeout(() => setDeferEmpty(false), 500);
        return () => clearTimeout(t);
    }, []);

    const fetchPage = async (p) => {
        setULoad(true);
        try {
            const res = await fetch(
                `/api/community?limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}${query ? `&${query}` : ''}`
            );
            const j = await res.json();
            setRows((old) => [...old, ...(Array.isArray(j) ? j : [])]);
            setHasMore(Array.isArray(j) && j.length === PAGE_SIZE);
            setPage(p);
        } catch (e) {
            console.error(e);
        } finally {
            setULoad(false);
        }
    };

    useEffect(() => {
        if (controlled) return undefined;
        setRows([]);
        setPage(0);
        setHasMore(true);
        (async () => {
            await fetchPage(0);
        })();
    }, [query, controlled]);

    // Reset render window when the controlled list changes
    useEffect(() => {
        if (controlled) setRenderCount(LOCAL_CHUNK);
    }, [controlled, posts]);

    // ---- Intersection observer: bottom sentinel (safety net) ----
    useEffect(() => {
        if (controlled) return undefined;
        const el = sentinelRef.current;
        if (!el) return undefined;

        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                if (hasMore && !uLoading) fetchPage(page + 1);
            },
            { rootMargin: '1200px' } // large margin to start early
        );

        io.observe(el);
        return () => io.disconnect();
    }, [controlled, hasMore, uLoading, page]);

    // ---- Intersection observer: prefetch sentinel (after item #90) ----
    useEffect(() => {
        if (controlled) return undefined;
        const el = prefetchRef.current;
        if (!el) return undefined;

        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                if (hasMore && !uLoading) fetchPage(page + 1);
            },
            { rootMargin: '800px' }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [controlled, hasMore, uLoading, page, rows.length]);

    const list = controlled ? (Array.isArray(posts) ? posts : []) : rows;
    const visible = controlled ? list.slice(0, renderCount) : list;

    // Extra safety: if parent passes a selectedId that isn’t in the current list, don’t highlight anything.
    let effectiveSelectedId = null;
    if (selectable && selectedId !== null && typeof selectedId !== 'undefined') {
        const sid = String(selectedId);
        if (list.some((p) => String(p?.id ?? '') === sid)) {
            effectiveSelectedId = selectedId;
        }
    }

    // Initial page overlay spinner only if nothing has loaded yet
    const initialLoading = controlled
        ? (loading && visible.length === 0)
        : (uLoading && rows.length === 0);

    // Where to place the prefetch sentinel inside the current page:
    // page starts at 0; after fetching page N, we watch index (N*PAGE_SIZE + (PREFETCH_AT-1))
    const prefetchIndex = !controlled
        ? Math.max(0, (page * PAGE_SIZE) + (PREFETCH_AT - 1))
        : -1;

    const renderedGrid = useMemo(
        () =>
            visible.flatMap((p, idx) => {
                const key = p.key || `${p.category || 'post'}-${p.id}`;
                const nodes = (
                    <Box
                        key={`card-${key}`}
                        sx={{
                            flex: {
                                xs: '0 0 100%',                     // phone: 1 per row
                                sm: '0 0 100%',                     // tablet: 1 per row
                                md: '0 0 calc(50% - 16px)',         // desktop: 2 per row
                                lg: '0 0 calc(50% - 16px)',
                                xl: '0 0 calc(50% - 16px)',
                            },
                            mx: 1,
                            my: 1,
                            minWidth: 0,
                            maxWidth: '100%',
                        }}
                    >
                        <PostCard
                            post={p}
                            user={user}
                            hoveredId={hoveredId}
                            setHoveredId={setHoveredId}
                            onLocationClick={onLocationClick}
                            onCardClick={onCardClick}
                            onOpenUserCard={handleOpenUserCard}
                            onOpenShare={handleOpenShare}
                            selectedId={effectiveSelectedId}
                            selectable={selectable}
                        />
                    </Box>
                );

                // Insert the prefetch sentinel after item #90 of the current page
                const needPrefetchMarker =
                    !controlled &&
                    hasMore &&
                    idx === Math.min(prefetchIndex, visible.length - 1);

                return needPrefetchMarker
                    ? [
                        nodes,
                        <Box key={`prefetch-${key}`} ref={prefetchRef} sx={{ height: 1, width: '100%' }} />,
                    ]
                    : [nodes];
            }),
        [
            visible,
            user,
            hoveredId,
            setHoveredId,
            onLocationClick,
            onCardClick,
            selectable,
            hasMore,
            controlled,
            prefetchIndex,
            effectiveSelectedId,
        ]
    );

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflow: 'hidden' }}>
            {visible.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', width: '100%', overflowX: 'hidden' }}>
                    {renderedGrid}

                    {/* Bottom-of-list inline loader under the last row while fetching (≥ 250ms) */}
                    {showBottomLoader && (
                        <Box sx={{ flex: '0 0 100%', display: 'flex', justifyContent: 'center', py: 2 }}>
                            <LoadingDots />
                        </Box>
                    )}
                </Box>
            )}

            {/* Invisible sentinel to trigger next fetch (bottom) */}
            <Box ref={sentinelRef} sx={{ height: 1 }} />

            {/* Initial full-screen overlay only for the very first load */}
            {initialLoading && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bgcolor: 'background.paper',
                    }}
                >
                    <LoadingDots />
                </Box>
            )}

            {!initialLoading && visible.length === 0 && !deferEmpty && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="body2" color="text.secondary">
                        No posts found.
                    </Typography>
                </Box>
            )}

            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={userForCard}
                isSelf={isSelf}
                following={isFollowingForCard}
                onFollow={handleFollow}
                onMessage={handleMessage}
                onViewProfile={(u) => window.location.assign(`/${u.handle || u.id}`)}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={user} post={sharePost} />
        </Box>
    );
}

CommunityList.propTypes = {
    user: PropTypes.object,
    posts: PropTypes.array,
    loading: PropTypes.bool,
    hoveredId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    setHoveredId: PropTypes.func.isRequired,
    onLocationClick: PropTypes.func.isRequired,
    onCardClick: PropTypes.func,
    query: PropTypes.string,
    selectedId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    selectable: PropTypes.bool,
};
