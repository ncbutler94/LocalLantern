// src/components/SidePanel/Community/CommunityList.jsx
// ============================================================================
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
import CampaignIcon   from '@mui/icons-material/Campaign';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import ReportIcon     from '@mui/icons-material/Report';
import LightbulbIcon  from '@mui/icons-material/Lightbulb';
import PanToolIcon    from '@mui/icons-material/PanTool';
import SearchIcon     from '@mui/icons-material/Search';

import ActionBar      from '../../ActionBar/ActionBar';

/*──────────────────────────────────────────────────────────────────────────────
  helpers
──────────────────────────────────────────────────────────────────────────────*/
const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const s  = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m  = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h  = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d  = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};

/* compact pill palette */
const BADGE = {
    announcement:           { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements:          { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },

    discussion:             { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion':   { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },

    recommendation:         { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips': { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },

    'volunteer-requests':   { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help':       { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests': { label:'Volunteer',  color:'#0097a7', Icon: PanToolIcon },

    'lost-found':           { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
};

/* reusable pill */
const Pill = ({ label, Icon, color }) => (
    <Box
        sx={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          0.5,
            px:           1,
            py:           0.25,
            bgcolor:      color,
            color:        '#fff',
            borderRadius: 12,
            fontSize:     '0.75rem',
            fontWeight:   600,
            width:        'max-content',
        }}
    >
        <Icon sx={{ fontSize: 14 }} />
        {label}
    </Box>
);

/*──────────────────────────────────────────────────────────────────────────────
  PostCard
──────────────────────────────────────────────────────────────────────────────*/
const PostCard = memo(function PostCard({
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
        likesCount   = 0,
        viewerLiked  = false,
        category,
    } = post;

    /* track broken images */
    const [imgError, setImgError] = useState(false);
    const mainPhoto = photos.find((p) => typeof p === 'string') || '';
    const showImage = !!mainPhoto && !imgError;

    const locationStr = [city, county].filter(Boolean).join(', ');
    const hasAddress  = Boolean(street_address?.trim());
    const granularity = hasAddress ? 'address' : city ? 'city' : 'county';

    const words   = description.trim().split(/\s+/);
    const long    = words.length > 8;
    const preview = long ? words.slice(0, 8).join(' ') : description;

    /* ---------- pill renderer ---------- */
    const renderBadge = () => {
        if (category === 'public-safety-alerts') {
            return <Pill label="Alert" Icon={ReportIcon} color="#e53935" />;
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

    /* ---------- card component ---------- */
    return (
        <Card
            sx={{
                display:       'flex',
                flexDirection: 'column',
                width:         '100%',
                height:        320,
                borderRadius:  2,
                border:        1,
                borderColor:   hoveredId === id ? 'primary.main' : 'divider',
                overflow:      'hidden',
                boxShadow:     '0 1px 6px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
        >
            {/* header */}
            <CardHeader
                avatar={<Avatar src={avatar_url}>{first_name?.[0]}</Avatar>}
                title={<Typography variant="subtitle1" fontWeight={600}>{first_name} {last_name}</Typography>}
                subheader={<Typography variant="caption" color="text.secondary">{timeAgo(date_created)}</Typography>}
                sx={{ pb: 0 }}
            />

            {/* text + (optional) image */}
            <CardActionArea
                onClick={() => onCardClick(post)}
                sx={{ flex: 1, px: 2, py: showImage ? 1.5 : 0.5 }}
            >
                <Box sx={{ display: 'flex', gap: showImage ? 2 : 0 }}>
                    {showImage && (
                        <Box
                            component="img"
                            src={mainPhoto}
                            loading="lazy"
                            onError={() => setImgError(true)}
                            sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                        />
                    )}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* badge row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {renderBadge()}
                            {lost_or_found === 'lost' && reward > 0 && (
                                <Typography variant="subtitle2" sx={{ fontSize: '0.75rem' }}>
                                    💰 ${reward} Reward
                                </Typography>
                            )}
                        </Box>

                        {/* title */}
                        {title && (
                            <Typography variant="h6" sx={{ mt: 0.5, fontSize: '1.1rem', wordBreak: 'break-word' }}>
                                {title}
                            </Typography>
                        )}

                        {/* description preview */}
                        {preview && (
                            <Typography
                                variant="body2"
                                sx={{
                                    mt: 0.5,
                                    lineHeight: 1.4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {preview}
                                {long && (
                                    <>
                                        …{' '}
                                        <Link component="button" variant="body2" onClick={() => onCardClick(post)} sx={{ p: 0 }}>
                                            more
                                        </Link>
                                    </>
                                )}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </CardActionArea>

            {/* location */}
            {(hasAddress || locationStr) && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: hasAddress ? 'flex-start' : 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        cursor: 'pointer',
                        color: 'text.secondary',
                        '&:hover': { color: 'primary.main' },   // blue hover
                    }}
                    onClick={() => onLocationClick(latitude, longitude, granularity)}
                >
                    <LocationOnIcon fontSize="small" />
                    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {hasAddress && (
                            <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>{street_address}</Typography>
                        )}
                        {locationStr && (
                            <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>{locationStr} County</Typography>
                        )}
                    </Box>
                </Box>
            )}

            {/* actions */}
            <CardActions sx={{ px: 2, pt: 0, pb: 2 }}>
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

/*──────────────────────────────────────────────────────────────────────────────
  CommunityList wrapper
──────────────────────────────────────────────────────────────────────────────*/
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
                            xs: '0 0 100%',
                            sm: '0 0 calc(50% - 16px)',
                            lg: '0 0 calc(33.333% - 16px)',
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

/* propTypes */
CommunityList.propTypes = {
    user:            PropTypes.object,
    posts:           PropTypes.array.isRequired,
    hoveredId:       PropTypes.number,
    setHoveredId:    PropTypes.func.isRequired,
    onLocationClick: PropTypes.func.isRequired,
    onCardClick:     PropTypes.func.isRequired,
};

export {PostCard};
