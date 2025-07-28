// src/components/SidePanel/Community/CommunityList.jsx
// -----------------------------------------------------------------------------
// Supports badges for:
//   • Public-Safety Alerts (info / caution / danger, no extra emojis)
//   • Announcements (blue)
//   • General Discussion (purple)
//   • Lost / Found (green / red)
//   • Recommendations & Tips (yellow)
//   • Volunteer & Help Requests (teal)
// -----------------------------------------------------------------------------

import React, { useMemo, memo } from 'react';
import {
    Box,
    Card,
    CardHeader,
    CardContent,
    CardActions,
    Avatar,
    Typography,
    Link,
    CardActionArea,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CampaignIcon   from '@mui/icons-material/Campaign';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import InfoIcon       from '@mui/icons-material/Info';
import WarningIcon    from '@mui/icons-material/Warning';
import ReportIcon     from '@mui/icons-material/Report';
import LightbulbIcon  from '@mui/icons-material/Lightbulb';
import PanToolIcon    from '@mui/icons-material/PanTool';
import ActionBar      from '../../ActionBar/ActionBar';

/* simple “time-ago” utility */
function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
export const PostCard = memo(function PostCard({
                                                   post,
                                                   user,
                                                   hoveredId,
                                                   setHoveredId,
                                                   onLocationClick,
                                                   onCardClick,
                                               }) {
    const {
        id,
        first_name,
        last_name,
        avatar_url,
        date_created,
        title,
        description = '',
        lost_or_found,
        reward,
        city,
        county,
        street_address,
        latitude,
        longitude,
        photos = [],
        likesCount = 0,
        viewerLiked = false,
        category,
        severity,
        rec_type,
    } = post;

    const mainPhoto   = photos.find((p) => typeof p === 'string') || '';
    const locationStr = [city, county].filter(Boolean).join(', ');
    const hasAddress  = Boolean(street_address?.trim());
    const granularity = hasAddress
        ? 'address'
        : city?.trim()
            ? 'city'
            : 'county';

    const words = description.split(/\s+/);
    const long  = words.length > 8;
    const preview = long ? words.slice(0, 8).join(' ') : description;

    /* ---------- badge renderer ---------- */
    function renderBadge() {
        /* Public-Safety Alerts */
        if (category === 'public-safety-alerts') {
            const sev = severity || 'info';
            const bg  =
                sev === 'danger'  ? 'error.main'
                    : sev === 'caution'? 'warning.main'
                        : 'success.light';
            const Icon =
                sev === 'danger'   ? ReportIcon
                    : sev === 'caution'? WarningIcon
                        : InfoIcon;

            return (
                <Typography
                    variant="subtitle2"
                    sx={{
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: bg,
                        color: '#fff',
                        borderRadius: 0.5,
                        fontSize: '0.75rem',
                    }}
                >
                    Alert <Icon sx={{ fontSize: 14 }} />
                </Typography>
            );
        }

        /* Announcement */
        if (category === 'announcement' || category === 'announcements') {
            return (
                <Typography
                    variant="subtitle2"
                    sx={{
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: 'info.main',
                        color: '#fff',
                        borderRadius: 0.5,
                        fontSize: '0.75rem',
                    }}
                >
                    Announcement <CampaignIcon sx={{ fontSize: 14 }} />
                </Typography>
            );
        }

        /* General Discussion */
        if (category === 'general-discussion') {
            return (
                <Typography
                    variant="subtitle2"
                    sx={{
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: 'secondary.main',
                        color: '#fff',
                        borderRadius: 0.5,
                        fontSize: '0.75rem',
                    }}
                >
                    Discussion <ChatBubbleIcon sx={{ fontSize: 14 }} />
                </Typography>
            );
        }

        /* Recommendations & Tips */
        if (category === 'recommendation' || category === 'recommendations-tips') {
            const label = rec_type === 'business' ? 'Recommendation' : 'Tip';
            return (
                <Typography
                    variant="subtitle2"
                    sx={{
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: 'rgb(177,163,49)',
                        color: '#fff',
                        fontWeight: 600,
                        borderRadius: 0.5,
                        fontSize: '0.75rem',
                    }}
                >
                    {label} <LightbulbIcon sx={{ fontSize: 14, color: '#fff' }} />
                </Typography>
            );
        }

        /* Volunteer & Help */
        if (
            category === 'volunteer-requests' ||
            category === 'volunteer-and-help-requests' ||
            category === 'volunteer-help' ||
            category === 'volunteer-help-requests'
        ) {
            return (
                <Typography
                    variant="subtitle2"
                    sx={{
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: '#0097a7',
                        color: '#fff',
                        fontWeight: 600,
                        borderRadius: 0.5,
                        fontSize: '0.75rem',
                    }}
                >
                    Volunteer / Help <PanToolIcon sx={{ fontSize: 14, color: '#fff' }} />
                </Typography>
            );
        }

        /* Lost / Found */
        if (lost_or_found) {
            return (
                <Typography
                    variant="subtitle2"
                    sx={{
                        px: 1,
                        borderRadius: 0.5,
                        bgcolor: lost_or_found === 'found' ? 'success.main' : 'error.main',
                        color: '#fff',
                        fontSize: '0.75rem',
                    }}
                >
                    {lost_or_found === 'found' ? 'Found' : 'Lost'}
                </Typography>
            );
        }

        return null;
    }

    /* ---------- card layout ---------- */
    return (
        <Card
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: 320,
                borderRadius: 2,
                boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
                overflow: 'hidden',
                borderColor: hoveredId === id ? 'primary.main' : 'divider',
                borderWidth: 1,
                borderStyle: 'solid',
            }}
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
        >
            <CardHeader
                avatar={<Avatar src={avatar_url}>{first_name?.[0]}</Avatar>}
                title={
                    <Typography variant="subtitle1" fontWeight={600}>
                        {first_name} {last_name}
                    </Typography>
                }
                subheader={
                    <Typography variant="caption" color="text.secondary">
                        {timeAgo(date_created)}
                    </Typography>
                }
                sx={{ pb: 0 }}
            />

            <Box sx={{ mt: 1 }} />

            <CardActionArea
                onClick={() => onCardClick(id)}
                sx={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
                }}
            >
                <CardContent sx={{ px: 2, pt: 0, pb: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        {mainPhoto && (
                            <Box
                                component="img"
                                src={mainPhoto}
                                loading="lazy"
                                sx={{
                                    width: 120,
                                    height: 120,
                                    objectFit: 'cover',
                                    borderRadius: 1,
                                }}
                            />
                        )}

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            {/* Badge row */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {renderBadge()}
                                {lost_or_found === 'lost' && reward > 0 && (
                                    <Typography
                                        variant="subtitle2"
                                        color="text.secondary"
                                        sx={{ fontSize: '0.75rem' }}
                                    >
                                        💰 ${reward} Reward
                                    </Typography>
                                )}
                            </Box>

                            {/* Title */}
                            <Typography
                                variant="h6"
                                sx={{
                                    mt: 0.5,
                                    fontSize: '1.1rem',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {title}
                            </Typography>

                            {/* Description preview */}
                            <Typography
                                variant="body2"
                                color="text.primary"
                                sx={{
                                    mt: 0.5,
                                    lineHeight: 1.4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {preview}
                                {long && (
                                    <>
                                        …{' '}
                                        <Link
                                            component="button"
                                            variant="body2"
                                            onClick={() => onCardClick(id)}
                                            sx={{ p: 0 }}
                                        >
                                            more
                                        </Link>
                                    </>
                                )}
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </CardActionArea>

            {/* Location */}
            {(hasAddress || locationStr) && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: hasAddress ? 'flex-start' : 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        '&:hover': { color: 'orange', cursor: 'pointer' },
                    }}
                    onClick={() => onLocationClick(latitude, longitude, granularity)}
                >
                    <LocationOnIcon fontSize="small" />
                    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {hasAddress && (
                            <Typography
                                variant="caption"
                                sx={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1 }}
                            >
                                {street_address}
                            </Typography>
                        )}
                        {locationStr && (
                            <Typography
                                variant="caption"
                                sx={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1 }}
                            >
                                {locationStr} County
                            </Typography>
                        )}
                    </Box>
                </Box>
            )}

            <CardActions sx={{ justifyContent: 'flex-start', px: 2, pt: 0, pb: 2 }}>
                <ActionBar
                    user={user}
                    postId={id}
                    initialLikes={likesCount}
                    initiallyLiked={viewerLiked}
                    onComment={() => console.log('comment', id)}
                    onShare={() => console.log('share', id)}
                />
            </CardActions>
        </Card>
    );
});

/* ─────────────────────────────────────────────────────────────────────────── */
export default function CommunityList({
                                          user,
                                          posts,
                                          hoveredId,
                                          setHoveredId,
                                          onLocationClick,
                                          onCardClick,
                                      }) {
    const rendered = useMemo(
        () =>
            posts.map((p) => (
                <Box
                    key={p.id}
                    sx={{
                        flex: {
                            xs: '0 0 100%',               // phones
                            sm: '0 0 calc(50% - 16px)',   // tablets / small desktop
                            lg: '0 0 calc(33.333% - 16px)'// ≥1280 px large desktop
                        },
                        m: 1,
                    }}
                >
                    <PostCard
                        post={p}
                        user={user}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={onCardClick}
                    />
                </Box>
            )),
        [posts, user, hoveredId, setHoveredId, onLocationClick, onCardClick]
    );

    if (!posts.length) {
        return (
            <Box sx={{ width: '100%', textAlign: 'center', py: 6 }}>
                <Typography variant="h6" color="text.secondary">
                    No Posts Found
                </Typography>
            </Box>
        );
    }

    return <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>{rendered}</Box>;
}
