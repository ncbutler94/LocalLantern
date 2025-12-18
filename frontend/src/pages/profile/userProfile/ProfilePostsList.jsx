// src/pages/profile/userProfile/ProfilePostsList.jsx
// Profile feed list that renders the EXACT Community PostCard, with profile-specific overrides:
// - Location line IS clickable: opens a small map popup (single marker) for that post.
// - Category chip is re-homed under the Edit button (keeping the *original* chip styles + icons).
// - Lost posts: "Mark as Found" button appears to the right of the category chip.
// - Infinite render: show 20 initially; when you scroll past the 15th item of the current chunk, load 20 more.
//
// FIX (this patch):
// - Action bar no longer prompts "log in" while logged in.
//   We now pass the logged-in viewer object through to CommunityPostCard (viewer/me/currentUser/etc).
// - Adds a Delete Post button (red) next to Edit Post for the owner.
//   It triggers a global event so the shared DeletePostConfirmDialog can be reused elsewhere.

import React, {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    Tooltip,
    Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { MapContainer, TileLayer, Marker, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import '../../../components/MapView.css';
import alabama from '../../../data/alabama.json';

import communityMarkerPng from '../../../assets/mapMarkers/community/community-marker.png';
import announcementMarkerPng from '../../../assets/mapMarkers/community/announcement-marker.png';
import discussionMarkerPng from '../../../assets/mapMarkers/community/discussion-marker.png';
import lostAndFoundMarkerPng from '../../../assets/mapMarkers/community/lost-and-found-marker.png';
import publicSafetyAlertMarkerPng from '../../../assets/mapMarkers/community/public-safety-alert-marker.png';
import recommendationAndTipsMarkerPng from '../../../assets/mapMarkers/community/recommendation-and-tips-marker.png';
import volunteerHelpRequestsMarkerPng from '../../../assets/mapMarkers/community/volunteer-help-requests-marker.png';

import { PostCard as CommunityPostCard } from '../../community/CommunityList';

import UserCardPopover from '../../../components/UserCardPopover';
import SharePostDialog from '../../../components/SharePostDialog';

/* ───────────────────────────────────────────
   Map helpers (mirrors CommunityMapView style)
   ─────────────────────────────────────────── */

const DEFAULT_ZOOM = 7.5;
const RAW_BOUNDS = L.geoJSON(alabama.features[0]).getBounds();

function computeBoundsWithPad(bounds, { padH = 0.16, padV = 0.16 }) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const width = Math.abs(ne.lng - sw.lng);
    const height = Math.abs(ne.lat - sw.lat);

    const extraLng = width * padH;
    const extraLat = height * padV;

    const newSw = L.latLng(sw.lat - extraLat, sw.lng - extraLng);
    const newNe = L.latLng(ne.lat + extraLat, ne.lng + extraLng);
    return L.latLngBounds(newSw, newNe);
}

const makeDivIcon = (png) =>
    L.divIcon({
        className: 'community-div-icon',
        iconSize: [48, 64],
        iconAnchor: [24, 64],
        popupAnchor: [0, -64],
        html: `
      <div style="position:relative;width:48px;height:64px;">
        <img src="${png}" class="marker-icon" style="position:absolute;bottom:8px;left:0;width:48px;height:48px;" />
      </div>
    `,
    });

const communityDivIcon = makeDivIcon(communityMarkerPng);
const announcementDivIcon = makeDivIcon(announcementMarkerPng);
const discussionDivIcon = makeDivIcon(discussionMarkerPng);
const lostAndFoundDivIcon = makeDivIcon(lostAndFoundMarkerPng);
const publicSafetyAlertDivIcon = makeDivIcon(publicSafetyAlertMarkerPng);
const recommendationDivIcon = makeDivIcon(recommendationAndTipsMarkerPng);
const volunteerHelpDivIcon = makeDivIcon(volunteerHelpRequestsMarkerPng);

const CATEGORY_ICON_MAP = {
    event: communityDivIcon,
    events: communityDivIcon,
    announcement: announcementDivIcon,
    announcements: announcementDivIcon,
    'general-discussion': discussionDivIcon,
    discussion: discussionDivIcon,
    'lost-and-found': lostAndFoundDivIcon,
    'lost-found': lostAndFoundDivIcon,
    'public-safety-alerts': publicSafetyAlertDivIcon,
    recommendation: recommendationDivIcon,
    recommendations: recommendationDivIcon,
    tips: recommendationDivIcon,
    'recommendations-tips': recommendationDivIcon,
    'volunteer-requests': volunteerHelpDivIcon,
    volunteers: volunteerHelpDivIcon,
    'help-requests': volunteerHelpDivIcon,
    'volunteer-and-help-requests': volunteerHelpDivIcon,
    'volunteer-help': volunteerHelpDivIcon,
    'volunteer-help-requests': volunteerHelpDivIcon,
};

function normalizeCategory(cat) {
    const s = String(cat || '').trim().toLowerCase();
    return s || 'event';
}

function pickIconForPost(post) {
    const cat = normalizeCategory(post?.category);
    return CATEGORY_ICON_MAP[cat] || communityDivIcon;
}

function pickLatLngForPost(post) {
    const lat = Number(
        post?.latitude ??
        post?.lat ??
        post?.location_lat ??
        post?.locationLat ??
        post?.geo_lat ??
        post?.geoLat
    );
    const lng = Number(
        post?.longitude ??
        post?.lng ??
        post?.location_lng ??
        post?.locationLng ??
        post?.geo_lng ??
        post?.geoLng
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
}

function pickZoomForPost(post) {
    const hasStreet = String(post?.street_address || post?.address || '').trim().length > 0;
    if (hasStreet) return 16;
    const hasCity = String(post?.city || '').trim().length > 0;
    if (hasCity) return 14;
    const hasCounty = String(post?.county || '').trim().length > 0;
    if (hasCounty) return 10;
    return 13;
}

function MaskController() {
    const map = useMap();

    useEffect(() => {
        const outer = [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, 90],
            [-180, -90],
        ];
        const hole = alabama.features[0].geometry.coordinates[0];

        const pane = map.createPane('maskPane');
        if (pane) {
            pane.style.zIndex = 450;
            pane.style.pointerEvents = 'none';
        }

        const mask = L.geoJSON(
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, hole] } },
            {
                pane: 'maskPane',
                interactive: false,
                style: {
                    fillColor: '#f4f6fb',
                    fillOpacity: 0.7,
                    color: 'rgba(0,0,0,0.15)',
                    weight: 2,
                },
            }
        ).addTo(map);

        return () => {
            try {
                map.removeLayer(mask);
            } catch {
                // ignore
            }
        };
    }, [map]);

    return null;
}

function Recenter({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (!center || center.length !== 2) return;
        try {
            map.setView(center, zoom);
        } catch {
            // ignore
        }
    }, [map, center, zoom]);
    return null;
}

function RemoveLeafletPrefix() {
    const map = useMap();
    useEffect(() => {
        if (map?.attributionControl) {
            map.attributionControl.setPrefix(false);
        }
    }, [map]);
    return null;
}

function LocationMapDialog({ open, post, onClose }) {
    const latLng = useMemo(() => pickLatLngForPost(post), [post]);
    const zoom = useMemo(() => pickZoomForPost(post), [post]);
    const bounds = useMemo(
        () => computeBoundsWithPad(RAW_BOUNDS, { padH: 0.16, padV: 0.16 }),
        []
    );

    const title =
        String(post?.street_address || post?.address || '').trim() ||
        [post?.city, post?.county].filter(Boolean).join(', ') ||
        'Post Location';

    return (
        <Dialog
            open={open}
            fullWidth
            maxWidth="md"
            onClose={(_, reason) => {
                if (reason === 'backdropClick') return;
                onClose();
            }}
            PaperProps={{
                sx: {
                    width: 860,
                    maxWidth: '92vw',
                    height: 560,
                    maxHeight: '82vh',
                    borderRadius: 3,
                    overflow: 'hidden',
                },
            }}
        >
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    py: 1.25,
                    pr: 1,
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }} noWrap title={title}>
                        {title}
                    </Typography>
                    {post?.title ? (
                        <Typography variant="caption" color="text.secondary" noWrap title={post.title}>
                            {post.title}
                        </Typography>
                    ) : null}
                </Box>

                <IconButton onClick={onClose} size="small" aria-label="Close">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0, height: '100%' }}>
                {!latLng ? (
                    <Box
                        sx={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            p: 3,
                            textAlign: 'center',
                        }}
                    >
                        <Typography color="text.secondary">
                            This post doesn’t have coordinates saved, so we can’t show it on the map yet.
                        </Typography>
                    </Box>
                ) : (
                    <Box className="ll-location-map" sx={{ width: '100%', height: '100%' }}>
                        <MapContainer
                            center={latLng}
                            zoom={zoom}
                            scrollWheelZoom
                            zoomSnap={0.5}
                            zoomDelta={0.5}
                            minZoom={DEFAULT_ZOOM}
                            maxZoom={18}
                            maxBounds={bounds}
                            maxBoundsViscosity={1}
                            doubleClickZoom={false}
                            touchZoom={false}
                            keyboard={false}
                            zoomControl={false}
                            closePopupOnClick={false}
                            attributionControl
                            style={{ width: '100%', height: '100%' }}
                        >
                            <RemoveLeafletPrefix />
                            <MaskController />
                            <Recenter center={latLng} zoom={zoom} />

                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution="© OpenStreetMap contributors"
                                noWrap
                            />

                            <GeoJSON
                                data={alabama}
                                style={{
                                    color: 'rgba(0,0,0,0.15)',
                                    weight: 2,
                                    fillOpacity: 0,
                                }}
                            />

                            <Marker position={latLng} icon={pickIconForPost(post)} />
                        </MapContainer>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
}

LocationMapDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    post: PropTypes.object,
    onClose: PropTypes.func.isRequired,
};

/* ───────────────────────────────────────────
   Category chip re-home helper
   ─────────────────────────────────────────── */

function moveCategoryChipToHost(rootEl, hostEl) {
    if (!rootEl || !hostEl) return;

    hostEl.innerHTML = '';

    const prevHidden = rootEl.querySelectorAll('[data-ll-hidden-category-chip="1"]');
    prevHidden.forEach((chip) => {
        chip.style.display = chip.dataset.llPrevDisplay || '';
        chip.removeAttribute('data-ll-hidden-category-chip');
        delete chip.dataset.llPrevDisplay;
    });

    const chips = Array.from(rootEl.querySelectorAll('.MuiChip-root, [class*="MuiChip-root"]'));
    if (!chips.length) return;

    const rootBox = rootEl.getBoundingClientRect();

    let best = null;
    let bestScore = -Infinity;

    const scoreChip = (chip) => {
        if (!chip || hostEl.contains(chip)) return -Infinity;
        if (chip.getAttribute('data-ll-cloned-category-chip') === '1') return -Infinity;

        const r = chip.getBoundingClientRect();
        const relTop = r.top - rootBox.top;
        const relRight = rootBox.right - r.right;

        const headerPenalty = relTop <= 130 ? 0 : -250;
        const hasIcon = !!chip.querySelector('svg');

        return (-(relTop * 2) - relRight) + (hasIcon ? 8 : 0) + headerPenalty;
    };

    for (const chip of chips) {
        const s = scoreChip(chip);
        if (s > bestScore) {
            bestScore = s;
            best = chip;
        }
    }

    if (!best || bestScore === -Infinity) return;

    best.dataset.llPrevDisplay = best.style.display || '';
    best.setAttribute('data-ll-hidden-category-chip', '1');
    best.style.display = 'none';

    const clone = best.cloneNode(true);
    clone.style.display = best.dataset.llPrevDisplay || '';
    clone.setAttribute('data-ll-cloned-category-chip', '1');

    clone.style.pointerEvents = 'none';
    clone.style.cursor = 'default';
    clone.style.userSelect = 'none';

    hostEl.appendChild(clone);
}

/* ───────────────────────────────────────────
   ProfilePostCard
   ─────────────────────────────────────────── */

export const ProfilePostCard = memo(function ProfilePostCard(props) {
    const {
        post,
        user,
        onCardClick,
        onOpenUserCard,
        onOpenShare,
        onOpenLocationMap,
        ...rest
    } = props;

    const rootRef = useRef(null);
    const categoryHostRef = useRef(null);

    const fire = useCallback((type, detail) => {
        try {
            window.dispatchEvent(new CustomEvent(type, { detail }));
        } catch {
            // ignore
        }
    }, []);

    const normHandle = useCallback(
        (h) => String(h || '').replace(/^@/, '').trim().toLowerCase(),
        []
    );

    const isOwner = useMemo(() => {
        const viewerId = Number(user?.id || 0);
        const postUserId = Number(post?.user_id || 0);
        if (viewerId && postUserId && viewerId === postUserId) return true;

        const vh = normHandle(user?.handle);
        const ph = normHandle(post?.handle);
        return !!(vh && ph && vh === ph);
    }, [normHandle, post?.handle, post?.user_id, user?.handle, user?.id]);

    const isEdited = useMemo(() => {
        const ea = post?.edited_at || post?.editedAt || post?.updated_at || null;
        if (!ea) return false;
        const posted = new Date(post?.posted_at || post?.date_created || post?.created_at || 0).getTime();
        const edited = new Date(ea).getTime();
        return edited && posted && edited > posted + 60 * 1000;
    }, [
        post?.edited_at,
        post?.editedAt,
        post?.updated_at,
        post?.posted_at,
        post?.date_created,
        post?.created_at,
    ]);

    const lostOrFound = String(post?.lost_or_found || '').toLowerCase();
    const resolvedAt = post?.resolved_at || post?.resolvedAt || null;
    const resolvedMessage = post?.resolved_message || post?.resolvedMessage || '';

    const showMarkFound =
        isOwner &&
        (lostOrFound === 'lost' || (!lostOrFound && String(post?.category || '') === 'lost-and-found')) &&
        !resolvedAt;

    const displayPost = useMemo(() => {
        if (!resolvedAt) return post;

        const baseDesc = String(post?.description || '');
        const updateLine = resolvedMessage
            ? `Update: ${resolvedMessage}`
            : 'Update: Marked as Found by the Owner.';
        const combined = baseDesc ? `${updateLine}\n\n— Original Post —\n${baseDesc}` : updateLine;

        return { ...post, description: combined };
    }, [post, resolvedAt, resolvedMessage]);

    useLayoutEffect(() => {
        moveCategoryChipToHost(rootRef.current, categoryHostRef.current);
    }, [post?.id, post?.category, post?.lost_or_found, post?.rec_type]);

    useEffect(() => {
        const t = setTimeout(() => {
            moveCategoryChipToHost(rootRef.current, categoryHostRef.current);
        }, 0);
        return () => clearTimeout(t);
    }, [post?.id, post?.category, post?.lost_or_found, post?.rec_type]);

    const topEdit = 10;
    const topCategory = isOwner ? 46 : 10;
    const topResolved = isOwner ? 78 : 42;

    return (
        <Box ref={rootRef} sx={{ position: 'relative' }}>
            {isOwner ? (
                <Box
                    sx={{
                        position: 'absolute',
                        top: topEdit,
                        right: 12,
                        zIndex: 7,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <Tooltip title="Edit post">
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<EditIcon fontSize="small" />}
                            onClick={() => {
                                fire('ll:communityPost:requestEdit', { postId: post?.id, post });
                            }}
                            sx={{
                                textTransform: 'none',
                                lineHeight: 1.1,
                                px: 1,
                                py: 0.4,
                                minWidth: 0,
                                borderRadius: 999,
                                bgcolor: 'rgba(255,255,255,0.92)',
                                borderColor: 'divider',
                                boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                                '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
                            }}
                        >
                            Edit Post
                        </Button>
                    </Tooltip>

                    <Tooltip title="Delete post">
                        <Button
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<DeleteOutlineIcon fontSize="small" />}
                            onClick={() => {
                                fire('ll:communityPost:requestDelete', { postId: post?.id, post });
                            }}
                            sx={{
                                textTransform: 'none',
                                lineHeight: 1.1,
                                px: 1,
                                py: 0.4,
                                minWidth: 0,
                                borderRadius: 999,
                                boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                                '&:hover': { opacity: 0.95 },
                            }}
                        >
                            Delete
                        </Button>
                    </Tooltip>
                </Box>
            ) : null}

            <Box
                sx={{
                    position: 'absolute',
                    top: topCategory,
                    right: 12,
                    zIndex: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    maxWidth: 'calc(100% - 24px)',
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <Box
                    ref={categoryHostRef}
                    data-ll-category-host="1"
                    sx={{ display: 'flex', alignItems: 'center', flex: '0 1 auto' }}
                />
                {showMarkFound ? (
                    <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                            fire('ll:communityPost:requestMarkFound', { postId: post?.id, post });
                        }}
                        sx={{
                            textTransform: 'none',
                            lineHeight: 1.1,
                            px: 1,
                            py: 0.4,
                            minWidth: 0,
                            borderRadius: 999,
                            flex: '0 0 auto',
                        }}
                    >
                        Mark as Found
                    </Button>
                ) : null}
            </Box>

            {resolvedAt ? (
                <Box
                    sx={{
                        position: 'absolute',
                        top: topResolved,
                        right: 12,
                        zIndex: 5,
                        bgcolor: 'rgba(255,193,7,0.18)',
                        border: '1px solid',
                        borderColor: 'rgba(255,193,7,0.55)',
                        borderRadius: 999,
                        px: 1,
                        py: 0.25,
                        pointerEvents: 'none',
                    }}
                >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        Marked as Found by the Owner
                    </Typography>
                </Box>
            ) : null}

            <CommunityPostCard
                {...rest}
                post={displayPost || post}
                viewer={user}
                me={user}
                currentUser={user}
                loggedInUser={user}
                sessionUser={user}
                locationClickable
                onLocationClick={(arg1) => {
                    const p = arg1 && typeof arg1 === 'object' ? arg1 : displayPost || post;
                    onOpenLocationMap?.(p);
                }}
                onCardClick={onCardClick}
                onOpenUserCard={onOpenUserCard}
                onOpenShare={onOpenShare}
            />

            {isEdited ? (
                <Box sx={{ position: 'absolute', right: 12, bottom: 10, zIndex: 4 }}>
                    <Typography
                        variant="caption"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            fire('ll:communityPost:requestHistory', { postId: post?.id, post });
                        }}
                        sx={{
                            cursor: 'pointer',
                            fontWeight: 700,
                            px: 0.75,
                            py: 0.2,
                            borderRadius: 1,
                            userSelect: 'none',
                            bgcolor: 'rgba(255,255,255,0.75)',
                            border: '1px solid',
                            borderColor: 'divider',
                            '&:hover': { bgcolor: 'rgba(255,235,59,0.60)' },
                        }}
                        title="Click to view edit history"
                    >
                        Edited
                    </Typography>
                </Box>
            ) : null}
        </Box>
    );
});

ProfilePostCard.displayName = 'ProfilePostCard';

ProfilePostCard.propTypes = {
    post: PropTypes.object,
    user: PropTypes.object,
    hoveredId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    setHoveredId: PropTypes.func,
    previewWords: PropTypes.number,
    previewLineClamp: PropTypes.number,
    onCardClick: PropTypes.func,
    onOpenUserCard: PropTypes.func,
    onOpenShare: PropTypes.func,
    onOpenLocationMap: PropTypes.func,
};

/* ───────────────────────────────────────────
   List chunking
   ─────────────────────────────────────────── */

const CHUNK_SIZE = 20;
const LOAD_MORE_AT = 15;

export default function ProfilePostsList({
                                             user,
                                             posts = [],
                                             loading = false,
                                             hoveredId,
                                             setHoveredId,
                                             onCardClick,
                                         }) {
    const list = useMemo(() => (Array.isArray(posts) ? posts : []), [posts]);

    const [renderCount, setRenderCount] = useState(CHUNK_SIZE);
    useEffect(() => {
        setRenderCount(CHUNK_SIZE);
    }, [list.length]);

    const visibleCount = Math.min(renderCount, list.length);
    const sentinelAfterIndex = Math.max(0, visibleCount - (CHUNK_SIZE - LOAD_MORE_AT));
    const loadMoreRef = useRef(null);

    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el) return;

        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                setRenderCount((c) => Math.min(c + CHUNK_SIZE, list.length));
            },
            { root: null, rootMargin: '600px' }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [list.length, visibleCount]);

    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);

    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    const [locOpen, setLocOpen] = useState(false);
    const [locPost, setLocPost] = useState(null);

    const closeLoc = useCallback(() => {
        setLocOpen(false);
        setLocPost(null);
    }, []);

    const openLocForPost = useCallback((p) => {
        if (!p) return;
        setLocPost(p);
        setLocOpen(true);
    }, []);

    const handleOpenUserCard = useCallback((el, authorLike) => {
        const id =
            Number(authorLike?.id) ||
            Number(authorLike?.user_id) ||
            (authorLike?.post?.user_id ? Number(authorLike.post.user_id) : undefined);

        setUserAnchor(el);
        setUserForCard({
            id: id || undefined,
            first_name: authorLike?.first_name,
            last_name: authorLike?.last_name,
            handle: authorLike?.handle,
            avatar_url: authorLike?.avatar_url || authorLike?.profile_picture,
        });
    }, []);

    const isSelf =
        !!user &&
        !!userForCard &&
        (Number(user.id) === Number(userForCard.id) ||
            (!!user.handle &&
                !!userForCard.handle &&
                String(user.handle).toLowerCase() === String(userForCard.handle).toLowerCase()));

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflow: 'hidden' }}>
            {loading && visibleCount === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
                    Loading…
                </Typography>
            ) : null}

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                {list.slice(0, visibleCount).map((p, i) => (
                    <React.Fragment key={`${p?.category || 'post'}-${p?.id || i}`}>
                        <ProfilePostCard
                            post={p}
                            user={user}
                            hoveredId={hoveredId}
                            setHoveredId={setHoveredId}
                            previewWords={28}
                            previewLineClamp={4}
                            onCardClick={onCardClick}
                            onOpenUserCard={handleOpenUserCard}
                            onOpenShare={(post0) => {
                                setSharePost(post0);
                                setShareOpen(true);
                            }}
                            onOpenLocationMap={openLocForPost}
                        />
                        {i === sentinelAfterIndex - 1 ? <Box ref={loadMoreRef} sx={{ height: 1 }} /> : null}
                    </React.Fragment>
                ))}
            </Box>

            {!loading && list.length === 0 ? (
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
            ) : null}

            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={userForCard}
                isSelf={isSelf}
                following={false}
                onFollow={() => {}}
                onMessage={() =>
                    window.dispatchEvent(
                        new CustomEvent('open-message-center', {
                            detail: { userId: userForCard?.id },
                        })
                    )
                }
                onViewProfile={(u) => window.location.assign(`/${u?.handle || u?.id}`)}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={user} post={sharePost} />

            <LocationMapDialog open={locOpen} post={locPost} onClose={closeLoc} />
        </Box>
    );
}

ProfilePostsList.propTypes = {
    user: PropTypes.object,
    posts: PropTypes.array,
    loading: PropTypes.bool,
    hoveredId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    setHoveredId: PropTypes.func,
    onCardClick: PropTypes.func,
};
