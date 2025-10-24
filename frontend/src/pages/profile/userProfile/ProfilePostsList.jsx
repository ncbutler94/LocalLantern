// src/pages/profile/userProfile/ProfilePostsList.jsx
// Profile feed list + card, aligned with the Community page's PostCard logic.
// - Robust photos parsing
// - Engagement count + viewer flags normalization
// - Feeds ActionBar with the same props the Community page uses

import React, { memo, useMemo, useState } from 'react';
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

import ActionBar from '../../../components/ActionBar/ActionBar';
import UserCardPopover from '../../../components/Common/UserCardPopover';
import SharePostDialog from '../../../components/share/SharePostDialog';

/* ---------- helpers ---------- */
const dateOnly = (d) => {
    const dt = new Date(d);
    return Number.isNaN(dt.valueOf())
        ? ''
        : dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

/* ========================================================================
 * ProfilePostCard (mirrors components/SidePanel/Community/CommunityList.jsx)
 * ====================================================================== */
export const ProfilePostCard = memo(function ProfilePostCard({
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

        // engagement (support camelCase + snake_case)
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

    // Normalize engagement counts + viewer flags
    const finalLikesCount = Number(likesCount ?? likes_count ?? like_count ?? likes ?? 0);
    const finalViewerLiked = Boolean(viewerLiked ?? viewer_liked ?? liked ?? is_liked ?? false);
    const finalCommentsCount = Number(commentsCount ?? comments_count ?? comment_count ?? comments ?? 0);
    const finalRepostsCount = Number(repostsCount ?? reposts_count ?? repost_count ?? reposts ?? 0);
    const finalViewerReposted = Boolean(
        viewerReposted ?? viewer_reposted ?? reposted ?? is_reposted ?? false
    );

    // Avatars (either field)
    const avatarSrc = avatar_url || profile_picture || '';

    // Photos: array | JSON string | single URL; filter out nulls
    const [imgError, setImgError] = useState(false);
    let processedPhotos = [];
    if (Array.isArray(photos)) {
        processedPhotos = photos.filter((p) => p && typeof p === 'string' && p !== 'null');
    } else if (typeof photos === 'string' && photos !== 'null' && photos.trim()) {
        try {
            const parsed = JSON.parse(photos);
            if (Array.isArray(parsed)) {
                processedPhotos = parsed.filter((p) => p && typeof p === 'string' && p !== 'null');
            }
        } catch {
            processedPhotos = [photos];
        }
    }
    const mainPhoto = processedPhotos[0] || '';
    const showImage = !!mainPhoto && !imgError;

    const postDate = date_created || posted_at;

    const countyLabel = county
        ? String(county).toLowerCase().includes('county')
            ? county
            : `${county} County`
        : '';
    const locationStr = [city, countyLabel].filter(Boolean).join(', ');

    const safeDesc = typeof description === 'string' ? description : (description ?? '').toString();
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
            data-post-id={id}
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
                subheader={<Typography variant="caption" color="text.secondary">{dateOnly(postDate)}</Typography>}
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
                    onComment={() => onCardClick?.(post)}
                    onShare={() => onOpenShare?.(post)}
                />
            </CardActions>
        </Card>
    );
});
ProfilePostCard.displayName = 'ProfilePostCard';

/* ========================================================================
 * ProfilePostsList (controlled list)
 * ====================================================================== */
export default function ProfilePostsList({
                                             user,
                                             posts = [],
                                             loading = false,
                                             hoveredId,
                                             setHoveredId,
                                             onLocationClick,
                                             onCardClick,
                                         }) {
    const list = Array.isArray(posts) ? posts : [];
    const busy = !!loading;

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

    const rendered = useMemo(
        () =>
            list.map((p) => {
                const key = p.key || `${p.category || 'post'}-${p.id}`;
                return (
                    <Box
                        key={key}
                        sx={{
                            width: '100%',
                            my: 1,
                            minWidth: 0,
                            maxWidth: '100%',
                        }}
                    >
                        <ProfilePostCard
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
        [list, user, hoveredId, setHoveredId, onLocationClick, onCardClick]
    );

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflowX: 'hidden' }}>
            {list.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
                    {rendered}
                </Box>
            )}

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
                    <Typography variant="body2" color="text.secondary">Loading…</Typography>
                </Box>
            )}

            {!busy && list.length === 0 && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="body2" color="text.secondary">No posts found.</Typography>
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

ProfilePostsList.propTypes = {
    user: PropTypes.object,
    posts: PropTypes.array,
    loading: PropTypes.bool,
    hoveredId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    setHoveredId: PropTypes.func,
    onLocationClick: PropTypes.func,
    onCardClick: PropTypes.func,
};
