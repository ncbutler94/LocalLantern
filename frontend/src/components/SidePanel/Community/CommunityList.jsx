// src/components/SidePanel/Community/CommunityList.jsx
// ==========================================================================
//  2025‑08‑07  ✅ FINAL WITH LOADER
//      • “Controlled” mode (parent supplies `posts`) now shows the centred
//        loader whenever the parent sets `loading={true}`.
//      • “Uncontrolled” mode (component fetches its own data) still shows
//        the loader while each page request is in‑flight.
// --------------------------------------------------------------------------

import React, {
    memo,
    useMemo,
    useState,
    useEffect,
    useRef,
} from 'react';
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
import LocationOnIcon  from '@mui/icons-material/LocationOn';
import CampaignIcon    from '@mui/icons-material/Campaign';
import ChatBubbleIcon  from '@mui/icons-material/ChatBubble';
import ReportIcon      from '@mui/icons-material/Report';
import LightbulbIcon   from '@mui/icons-material/Lightbulb';
import PanToolIcon     from '@mui/icons-material/PanTool';
import SearchIcon      from '@mui/icons-material/Search';

import ActionBar from '../../ActionBar/ActionBar';

/* ───────── helper — time‑ago ───────── */
const timeAgo = (d) => {
    const diff = Date.now() - new Date(d).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const dd = Math.floor(h / 24);
    if (dd < 30) return `${dd}d ago`;
    const mo = Math.floor(dd / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};

/* badge look‑up */
const BADGE = {
    announcement:            { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements:           { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion:              { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion':    { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },
    recommendation:          { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips':  { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    'volunteer-requests':    { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help':        { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests':{label:'Volunteer',     color:'#0097a7', Icon: PanToolIcon },
    'lost-found':            { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
};

/* pill */
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
Pill.propTypes = { label: PropTypes.string, Icon: PropTypes.elementType, color: PropTypes.string };

/* ───────── PostCard ───────── */
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
        likesCount = 0,
        viewerLiked = false,
        category,
    } = post;

    const [imgError, setImgError] = useState(false);
    const mainPhoto = photos.find((p) => typeof p === 'string') || '';
    const showImage = !!mainPhoto && !imgError;

    const locationStr = [city, county].filter(Boolean).join(', ');
    const hasAddress  = Boolean(street_address?.trim());
    const granularity = hasAddress ? 'address' : city ? 'city' : 'county';

    const words   = description.trim().split(/\s+/);
    const long    = words.length > 8;
    const preview = long ? words.slice(0, 8).join(' ') : description;

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

    return (
        <Card
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: 320,
                borderRadius: 2,
                border: 1,
                borderColor: hoveredId === id ? 'primary.main' : 'divider',
                overflow: 'hidden',
                boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
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
                            sx={{
                                width: 120,
                                height: 120,
                                objectFit: 'cover',
                                borderRadius: 1,
                                flexShrink: 0,
                            }}
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
                            <Typography
                                variant="h6"
                                sx={{ mt: 0.5, fontSize: '1.1rem', wordBreak: 'break-word' }}
                            >
                                {title}
                            </Typography>
                        )}

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
                                        <Link
                                            component="button"
                                            variant="body2"
                                            onClick={() => onCardClick(post)}
                                            sx={{ p: 0 }}
                                        >
                                            more
                                        </Link>
                                    </>
                                )}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </CardActionArea>

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
                        '&:hover': { color: 'primary.main' },
                    }}
                    onClick={() => onLocationClick(latitude, longitude, granularity)}
                >
                    <LocationOnIcon fontSize="small" />
                    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {hasAddress && (
                            <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
                                {street_address}
                            </Typography>
                        )}
                        {locationStr && (
                            <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
                                {locationStr} County
                            </Typography>
                        )}
                    </Box>
                </Box>
            )}

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
PostCard.propTypes = {
    post: PropTypes.object.isRequired,
    user: PropTypes.object,
    hoveredId: PropTypes.number,
    setHoveredId: PropTypes.func.isRequired,
    onLocationClick: PropTypes.func.isRequired,
    onCardClick: PropTypes.func.isRequired,
};

/* ───────── loader ───────── */
const LoadingDots = () => (
    <Box
        sx={{
            display: 'flex',
            gap: 1,
            '@keyframes b': {
                '0%,80%,100%': { transform: 'scale(0)' },
                '40%': { transform: 'scale(1.0)' },
            },
        }}
    >
        {[0, 1, 2].map((i) => (
            <Box
                key={i}
                sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    animation: 'b 1.4s infinite ease-in-out',
                    animationDelay: `${i * 0.2}s`,
                }}
            />
        ))}
    </Box>
); // same animation used in PostDetailModal :contentReference[oaicite:2]{index=2}

/* ───────── main list component ───────── */
const PAGE_SIZE = 30;

export default function CommunityList({
                                          user,
                                          posts,          // presence ⇒ controlled mode
                                          loading = false,// parent‑supplied flag (controlled)
                                          hoveredId,
                                          setHoveredId,
                                          onLocationClick,
                                          onCardClick,
                                          query = '',     // uncontrolled mode filter string
                                      }) {
    /* detect controlled vs uncontrolled */
    const controlled = typeof posts !== 'undefined';

    /* state for uncontrolled mode */
    const [rows, setRows]       = useState([]);
    const [page, setPage]       = useState(0);
    const [uLoading, setULoad]  = useState(true);
    const [hasMore, setHasMore] = useState(true);

    const sentinelRef = useRef(null);

    /* fetch helper (uncontrolled) */
    const fetchPage = async (p) => {
        setULoad(true);
        try {
            const res = await fetch(
                `/api/community?limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}${
                    query ? `&${query}` : ''
                }`,
            );
            const j = await res.json();
            setRows((old) => [...old, ...j]);
            setHasMore(j.length === PAGE_SIZE);
            setPage(p);
        } catch (e) {
            console.error(e);
        }
        setULoad(false);
    };

    /* (re)load when filters change (uncontrolled) */
    useEffect(() => {
        if (controlled) return;
        setRows([]);
        setPage(0);
        setHasMore(true);
        fetchPage(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, controlled]);

    /* infinite scroll (uncontrolled) */
    useEffect(() => {
        if (controlled || !hasMore || uLoading) return;
        const io = new IntersectionObserver(
            (e) => e[0].isIntersecting && fetchPage(page + 1),
            { rootMargin: '600px' },
        );
        const el = sentinelRef.current;
        if (el) io.observe(el);
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controlled, hasMore, uLoading, page]);

    /* pick data & busy state */
    const list = controlled ? posts : rows;
    const busy = controlled ? loading : uLoading;

    /* memoised card grid */
    const renderedGrid = useMemo(
        () =>
            list.map((p) => (
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
        [list, user, hoveredId, setHoveredId, onLocationClick, onCardClick],
    );

    /* render */
    return (
        <Box sx={{ position: 'relative', minHeight: 240 }}>
            {list.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>{renderedGrid}</Box>
            )}

            {/* sentinel for infinite scroll (uncontrolled) */}
            {!controlled && <Box ref={sentinelRef} sx={{ height: 1 }} />}

            {/* centred loader overlay */}
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

            {/* empty‑state when idle */}
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
                    <Typography variant="h6" color="text.secondary">
                        No Posts Found
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

CommunityList.propTypes = {
    user:            PropTypes.object,
    posts:           PropTypes.array,   // supply for controlled mode
    loading:         PropTypes.bool,    // pass true during fetch in controlled mode
    hoveredId:       PropTypes.number,
    setHoveredId:    PropTypes.func.isRequired,
    onLocationClick: PropTypes.func.isRequired,
    onCardClick:     PropTypes.func.isRequired,
    query:           PropTypes.string,  // filters for uncontrolled mode
};

/* export PostCard for reuse */
export { PostCard };
