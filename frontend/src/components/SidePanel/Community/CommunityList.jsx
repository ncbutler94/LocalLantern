// src/components/SidePanel/Community/CommunityList.jsx
import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Card,
    CardHeader,
    CardActions,
    Avatar,
    Typography,
    Link,
    CardActionArea,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import ReportIcon from '@mui/icons-material/Report';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PanToolIcon from '@mui/icons-material/PanTool';
import SearchIcon from '@mui/icons-material/Search';

import ActionBar from '../../ActionBar/ActionBar'; // repo path: src/components/ActionBar/ActionBar.jsx
import UserCardPopover from '../../Common/UserCardPopover';
import SharePostDialog from '../../share/SharePostDialog';

/* ---------- helpers ---------- */
const dateOnly = (d) => {
    const dt = new Date(d);
    return Number.isNaN(dt.valueOf())
        ? ''
        : dt.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
};

/* ---------- badge lookup ---------- */
const BADGE = {
    announcement: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion: { label: 'Discussion', color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion': { label: 'Discussion', color: '#2e7d32', Icon: ChatBubbleIcon },
    recommendation: { label: 'Tip', color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips': { label: 'Tip', color: '#fdd835', Icon: LightbulbIcon },
    'volunteer-requests': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'lost-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'lost-and-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'public-safety-alerts': { label: 'Safety Alert', color: '#e53935', Icon: ReportIcon },
};

const Pill = ({ label, Icon, color }) => (
    <Box
        sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            bgcolor: color,
            color: '#fff',
            borderRadius: 12,
            fontSize: '0.75rem',
            fontWeight: 600,
            width: 'max-content',
        }}
    >
        <Icon sx={{ fontSize: 14 }} /> {label}
    </Box>
);

/* ============================================================================
 * PostCard (used in panel list and map popups)
 * ========================================================================== */
export const PostCard = memo(function PostCard({
                                                   post,
                                                   user,
                                                   hoveredId,
                                                   setHoveredId,
                                                   onLocationClick,
                                                   onCardClick,
                                                   onOpenUserCard,
                                                   onOpenShare,
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
        lost_or_found,
        reward,
        city,
        county,
        street_address,
        latitude,
        longitude,
        photos = [],
        // Support both camelCase and snake_case property names
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
    } = post;

    // Normalize all the engagement data with comprehensive fallbacks
    const finalLikesCount = Number(likesCount ?? likes_count ?? like_count ?? likes ?? 0);
    const finalViewerLiked = Boolean(viewerLiked ?? viewer_liked ?? liked ?? is_liked ?? false);
    const finalCommentsCount = Number(commentsCount ?? comments_count ?? comment_count ?? comments ?? 0);
    const finalRepostsCount = Number(repostsCount ?? reposts_count ?? repost_count ?? reposts ?? 0);
    const finalViewerReposted = Boolean(viewerReposted ?? viewer_reposted ?? reposted ?? is_reposted ?? false);

    // Support multiple avatar field names
    const avatarSrc = avatar_url || profile_picture || '';
    const postDate = date_created || posted_at;

    const [imgError, setImgError] = useState(false);

    // Handle photos array - filter out null values and parse JSON if needed
    let processedPhotos = [];
    if (Array.isArray(photos)) {
        processedPhotos = photos.filter(p => p && typeof p === 'string' && p !== 'null');
    } else if (typeof photos === 'string' && photos !== 'null' && photos.trim()) {
        try {
            const parsed = JSON.parse(photos);
            if (Array.isArray(parsed)) {
                processedPhotos = parsed.filter(p => p && typeof p === 'string' && p !== 'null');
            }
        } catch {
            processedPhotos = [photos];
        }
    }

    const mainPhoto = processedPhotos[0] || '';
    const showImage = !!mainPhoto && !imgError;

    const countyLabel = county
        ? String(county).toLowerCase().includes('county')
            ? county
            : `${county} County`
        : '';
    const locationStr = [city, countyLabel].filter(Boolean).join(', ');

    const safeDesc =
        typeof description === 'string' ? description : (description ?? '').toString();
    const hasAddress = Boolean(street_address && String(street_address).trim());
    const words = safeDesc.trim().split(/\s+/);
    const long = words.length > 24;
    const preview = long ? words.slice(0, 24).join(' ') : safeDesc;

    const renderBadge = () => {
        if (category === 'public-safety-alerts') {
            return <Pill label="Public Safety" Icon={ReportIcon} color="#e53935" />;
        }
        if (lost_or_found) {
            return (
                <Pill
                    label={lost_or_found === 'found' ? 'Found' : 'Lost'}
                    Icon={SearchIcon}
                    color="#fb8c00"
                />
            );
        }
        const meta = BADGE[category];
        return meta ? <Pill {...meta} /> : null;
    };

    const openUserCard = (e) => {
        e.stopPropagation();
        onOpenUserCard(e.currentTarget, post);
    };

    return (
        <Card
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                minHeight: 320,
                borderRadius: 2,
                border: 1,
                borderColor: hoveredId === id ? 'primary.main' : 'divider',
                overflow: 'hidden',
                boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={() => setHoveredId?.(id)}
            onMouseLeave={() => setHoveredId?.(null)}
        >
            <CardHeader
                avatar={
                    <Avatar src={avatarSrc} sx={{ cursor: 'pointer' }} onClick={openUserCard}>
                        {first_name?.[0]}
                    </Avatar>
                }
                title={
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography
                            variant="subtitle1"
                            fontWeight={600}
                            sx={{ cursor: 'pointer' }}
                            onClick={openUserCard}
                        >
                            {first_name} {last_name}
                        </Typography>
                        {!!handle && (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ cursor: 'pointer' }}
                                onClick={openUserCard}
                            >
                                @{handle}
                            </Typography>
                        )}
                    </Box>
                }
                subheader={
                    <Typography variant="caption" color="text.secondary">
                        {dateOnly(postDate)}
                    </Typography>
                }
                sx={{ pb: 0 }}
            />

            <CardActionArea onClick={() => onCardClick(post)} sx={{ flex: 1, px: 2, py: showImage ? 1.5 : 0.5 }}>
                <Box sx={{ display: 'flex', gap: showImage ? 2 : 0 }}>
                    {showImage && (
                        <Box
                            component="img"
                            src={mainPhoto}
                            loading="lazy"
                            onError={() => setImgError(true)}
                            sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                            alt=""
                        />
                    )}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {renderBadge()}
                            {lost_or_found === 'lost' && reward > 0 && (
                                <Typography variant="subtitle2" sx={{ fontSize: '0.75rem' }}>
                                    💰 ${reward} Reward
                                </Typography>
                            )}
                        </Box>

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
                                        {' '}
                                        <Link component="span" underline="hover" color="inherit">
                                            more
                                        </Link>
                                    </>
                                )}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </CardActionArea>

            {/* location row */}
            {(city || county || street_address) && (
                <Box
                    sx={{
                        px: 2,
                        pb: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontSize: '0.875rem',
                    }}
                >
                    <LocationOnIcon fontSize="small" color="action" />
                    {hasAddress ? (
                        <>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLocationClick?.(post);
                                }}
                                sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                            >
                                {street_address}
                            </Typography>
                            {locationStr && (
                                <Typography variant="body2" color="text.secondary">
                                    {' '}
                                    {locationStr}
                                </Typography>
                            )}
                        </>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            {locationStr}
                        </Typography>
                    )}
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
                    onComment={() => onCardClick(post)}
                    onShare={() => onOpenShare(post)}
                />
            </CardActions>
        </Card>
    );
});
PostCard.displayName = 'PostCard';

/* ---------- tiny loader ---------- */
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

/* ============================================================================
 * Main list (controlled with `posts` or self-fetching with infinite scroll)
 * ========================================================================== */
const PAGE_SIZE = 30;

export default function CommunityList({
                                          user,
                                          posts, // presence ⇒ controlled mode
                                          loading = false, // parent flag in controlled mode
                                          hoveredId,
                                          setHoveredId,
                                          onLocationClick,
                                          onCardClick,
                                          query = '', // uncontrolled mode filter string (e.g. "city=.&county=.")
                                          columns = 'auto', // "auto" | "one"
                                      }) {
    const controlled = typeof posts !== 'undefined';

    // uncontrolled state
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(0);
    const [uLoading, setULoad] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const sentinelRef = useRef(null);

    const [deferEmpty, setDeferEmpty] = useState(true);

    // popovers/dialogs
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    const handleOpenUserCard = (el, post) => {
        setUserAnchor(el);
        setUserForCard({
            id: post.user_id || post.id,
            first_name: post.first_name,
            last_name: post.last_name,
            handle: post.handle,
            avatar_url: post.avatar_url || post.profile_picture,
        });
    };
    const handleViewProfile = (u) => window.location.assign(`/${u.handle || u.id}`);
    const handleMessage = () =>
        window.dispatchEvent(new CustomEvent('open-message-center', { detail: { userId: userForCard?.id } }));

    const handleOpenShare = (post) => { setSharePost(post); setShareOpen(true); };

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

    // first page (uncontrolled)
    useEffect(() => {
        if (controlled) return undefined;
        let alive = true;
        setRows([]);
        setPage(0);
        setHasMore(true);
        (async () => {
            await fetchPage(0);
        })();
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, controlled]);

    // infinite scroll (uncontrolled)
    useEffect(() => {
        if (controlled || !hasMore || uLoading) return undefined;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) fetchPage(page + 1);
            },
            { rootMargin: '600px' }
        );
        const el = sentinelRef.current;
        if (el) io.observe(el);
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controlled, hasMore, uLoading, page]);

    const list = controlled ? (Array.isArray(posts) ? posts : []) : rows;
    const busy = controlled ? loading || (deferEmpty && list.length === 0) : uLoading;

    const renderedGrid = useMemo(
        () =>
            list.map((p) => {
                const key = p.key || `${p.category || 'post'}-${p.id}`;
                return (
                    <Box
                        key={key}
                        sx={{
                            // For single column, use full width with no flex-basis issues
                            width: columns === 'one' ? '100%' : undefined,
                            flex:
                                columns === 'one'
                                    ? undefined
                                    : {
                                        xs: '0 0 100%',
                                        sm: '0 0 calc(50% - 16px)',
                                        lg: '0 0 calc(33.333% - 16px)',
                                    },
                            mx: columns === 'one' ? 0 : 1,
                            my: 1,
                            // Prevent overflow issues
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
                        />
                    </Box>
                );
            }),
        [list, user, hoveredId, setHoveredId, onLocationClick, onCardClick, columns]
    );

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflow: 'hidden' }}>
            {list.length > 0 && (
                <Box sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    width: '100%',
                    // Prevent horizontal overflow
                    overflowX: 'hidden',
                }}>
                    {renderedGrid}
                </Box>
            )}
            {!controlled && <Box ref={sentinelRef} sx={{ height: 1 }} />}

            {busy && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bgcolor: list.length ? 'transparent' : 'background.paper',
                        pointerEvents: 'none',
                    }}
                >
                    <LoadingDots />
                </Box>
            )}

            {!busy && list.length === 0 && !deferEmpty && (
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
                isSelf={user && user.handle === userForCard?.handle}
                following={false}
                onFollow={() => {}}
                onMessage={handleMessage}
                onViewProfile={handleViewProfile}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={user} post={sharePost} />
        </Box>
    );
}

CommunityList.propTypes = {
    user: PropTypes.object,
    posts: PropTypes.array,
    loading: PropTypes.bool,
    hoveredId: PropTypes.number,
    setHoveredId: PropTypes.func.isRequired,
    onLocationClick: PropTypes.func.isRequired,
    onCardClick: PropTypes.func.isRequired,
    query: PropTypes.string,
    columns: PropTypes.oneOf(['auto', 'one']),
};