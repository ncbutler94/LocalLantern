// src/pages/community/CommunityList.jsx
//
// Responsive grid (1/2 per row), consistent card height, and category Chip
// in the top-right of each card header. Selected card shows a light gray highlight.
//
// Follow fixes in this version:
// • Follow/Message on the user card are auth-gated (same as Profile page).
// • POST uses the same URL strategy as Profile page: `${api}/users/follow` ➜ '/api/users/follow' ➜ '/users/follow'.
// • We resolve the target via `/users/public/:handleOrId` (same as Profile page) so we always have the correct numeric `id`.
// • The button flips to disabled gray “Following” immediately (optimistic), and stays that way.
// • Already-followed users render “Following” immediately because we derive state from the **target’s** followers list,
//   just like the Profile page does (not from the viewer cache).
//
// UPDATED (infinite scroll):
// • PAGE_SIZE = 100
// • Prefetch when the user scrolls past item #90 of the current page
// • Continues loading with no page cap while the server returns full pages
//
// Based on your original file with no truncation.
//
// NEW (performance bar support + controlled chunking, without removing existing features):
// • In controlled mode (posts prop provided): render only 100 at a time (renderCount).
// • When user scrolls near the bottom of the current chunk:
//     - show 4 flashing skeleton cards,
//     - then reveal the next 100.
// • If we’ve revealed everything we currently have but the parent says there are more:
//     - call onLoadMore() (optional),
//     - keep skeletons visible until parent appends posts.
// • Exposes display stats via onDisplayStatsChange (optional) so we can render a truly fixed bar in CommunityPanel.
//
// NOTE: The “fixed bar” should be rendered by CommunityPanel (overlay in the scroll container) so it is ALWAYS visible.
// This file now reports the values needed for that bar.

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
    Skeleton,
    Button,
    IconButton,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    CircularProgress,
    TextField,
    Tooltip,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText
} from '@mui/material';

import { alpha as alphaColor } from '@mui/material/styles';

import ActionBar from '../../components/ActionBar';
import UserCardPopover from '../../components/UserCardPopover';
import SharePostDialog from '../../components/SharePostDialog';
import EditCommunityPostDialog from '../../components/community/EditCommunityPostDialog';
import DeletePostConfirmDialog from '../../components/community/DeletePostConfirmDialog';
import { useAuth } from '../../components/AuthModalContext';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import announcementMarker from '../../assets/mapMarkers/community/announcement-marker.png';
import announcementMarkerGold from '../../assets/mapMarkers/community/announcement-marker-gold.png';
import discussionMarker from '../../assets/mapMarkers/community/discussion-marker.png';
import discussionMarkerGold from '../../assets/mapMarkers/community/discussion-marker-gold.png';
import recommendationsMarker from '../../assets/mapMarkers/community/recommendations-marker.png';
import recommendationsMarkerGold from '../../assets/mapMarkers/community/recommendations-marker-gold.png';
import volHelpMarker from '../../assets/mapMarkers/community/volunteer-help-requests-marker.png';
import volHelpMarkerGold from '../../assets/mapMarkers/community/volunteer-help-requests-marker-gold.png';
import lostFoundMarker from '../../assets/mapMarkers/community/lost-and-found-marker.png';
import lostFoundMarkerGold from '../../assets/mapMarkers/community/lost-and-found-marker-gold.png';
import safetyMarker from '../../assets/mapMarkers/community/public-safety-alert-marker.png';
import safetyMarkerGold from '../../assets/mapMarkers/community/public-safety-alert-marker-gold.png';
import communityMarker from '../../assets/mapMarkers/community/community-marker.png';
import communityMarkerGold from '../../assets/mapMarkers/community/community-marker-gold.png';


const api = process.env.REACT_APP_API_URL || '';

/* ---------- helpers ---------- */
const formatDate = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    // Abbreviate month names (Dec, Nov, etc.)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

/* ---------- Compact relative time helper (for headers / map popups) ---------- */
const timeAgoCompact = (input) => {
    const d = input ? new Date(input) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    const diffMs = Math.max(0, Date.now() - d.getTime());

    const s = Math.floor(diffMs / 1000);
    if (s < 60) return '1m ago';

    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}hr ago`;
    const dys = Math.floor(h / 24);
    if (dys < 7) return `${dys}d ago`;
    const w = Math.floor(dys / 7);
    if (w < 5) return `${w}wk ago`;
    const mo = Math.floor(dys / 30);
    if (mo < 12) return `${mo}mo ago`;
    const y = Math.floor(dys / 365);
    return `${y}yr ago`;
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


/* Help/Volunteer type labels (for list chips) */
const HELP_TYPE_LABELS = {
    labor: 'Home & Yard Help',
    rides: 'Rides & Errands',
    meals: 'Meals & Groceries',
    donations: 'Donations & Supplies',
    care: 'Care & Support',
    staffing: 'Community Event Help',
    skills: 'Skills & Advice',
    other: 'Other',
};

const formatNiceLabel = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .map((w) => (w ? (w.charAt(0).toUpperCase() + w.slice(1)) : ''))
        .join(' ')
        .trim();
};


const BADGE = {
    announcement: { label: 'Announcement', markerGreen: announcementMarker, markerGold: announcementMarkerGold },
    announcements: { label: 'Announcement', markerGreen: announcementMarker, markerGold: announcementMarkerGold },

    discussion: { label: 'Discussion', markerGreen: discussionMarker, markerGold: discussionMarkerGold },
    'general-discussion': { label: 'Discussion', markerGreen: discussionMarker, markerGold: discussionMarkerGold },

    // Split recommendations
    tips: { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold }, // legacy fallback
    recommendations: { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    'recommendations-tips': { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold }, // legacy fallback
    tip: { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold }, // legacy fallback

    // Split volunteer & help requests
    'help-requests': { label: 'Help Request', markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    volunteers: { label: 'Volunteer', markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-requests': { label: 'Volunteer/Help', markerGreen: volHelpMarker, markerGold: volHelpMarkerGold }, // legacy fallback

    // Fallbacks — buildBadgeFor handles these as special cases but we keep them here too
    'lost-found': { label: 'Lost / Found', markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },
    'lost-and-found': { label: 'Lost / Found', markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },

    'public-safety-alerts': { label: 'Safety Alert', markerGreen: safetyMarker, markerGold: safetyMarkerGold },

    // Generic fallback
    community: { label: 'Community', markerGreen: communityMarker, markerGold: communityMarkerGold },
};

const toHoverKey = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : String(val ?? '');
};

const deriveSplitCategory = (post) => {
    // Normalize to new slugs when legacy category remains
    let cat = String(post?.category || '').toLowerCase();

    if (cat === 'recommendations-tips' || cat === 'tips' || cat === 'tip') {
        // Tips have been removed — treat all legacy “tips” rows as Recommendations.
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
        return { label: 'Safety Alert', markerGreen: safetyMarker, markerGold: safetyMarkerGold };
    }
    if (post.lost_or_found) {
        return {
            label: post.lost_or_found === 'found' ? 'Found' : 'Lost',
            markerGreen: lostFoundMarker,
            markerGold: lostFoundMarkerGold,
        };
    }
    const cat = deriveSplitCategory(post);
    return BADGE[cat] || BADGE.community || null;
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

                                                   // Optional context hints (used by Profile posts list)
                                                   actionBarVariant = '',
                                                   forceProfileActionBar = false,

                                                   currentView = '',
                                                   showTopAccent = true,
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
        rec_type,   // legacy (kept for backward compatibility; tips removed)
        reward,
        resolved_at,
        resolved_message,
        resolved_by_user_id,
        // provided by API
        user_id,    // post author id (preferred)
    } = post;

    const authCtx = useAuth();
    const viewerUser = authCtx?.user || user || null;

    const viewerId = Number(viewerUser?.id || 0);
    const viewerHandle = String(viewerUser?.handle || '').toLowerCase();

    const authorId = Number(user_id || post?.userId || post?.author_id || post?.owner_id || 0);
    const authorHandle = String(handle || '').toLowerCase();

    const isAdmin = Boolean(
        viewerUser?.is_admin ||
        viewerUser?.isAdmin ||
        String(viewerUser?.role || '').toLowerCase() === 'admin' ||
        String(viewerUser?.account_type || '').toLowerCase() === 'admin'
    );

    const isOwner =
        (viewerId && authorId && viewerId === authorId) ||
        (viewerHandle && authorHandle && viewerHandle === authorHandle);

    const viewNorm = String(currentView || '').trim().toLowerCase();
    const viewImpliesMine = ['mine', 'my', 'my_posts', 'my posts', 'myposts'].includes(viewNorm);

    const canManage = Boolean(isOwner || isAdmin || (viewImpliesMine && viewerId));

    const fire = (name, detail) => {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch {
            // ignore
        }
    };

    const isEditedNow = Boolean(
        post?.edited_at ||
        post?.editedAt ||
        post?.has_edits ||
        post?.edits_count ||
        post?.editsCount
    );

    const editedStorageKey = useMemo(() => {
        const idNum = Number(id);
        return idNum ? `ll.communityPost.edited.${idNum}` : '';
    }, [id]);

    const [persistedEdited, setPersistedEdited] = useState(() => {
        if (!editedStorageKey) return false;
        try {
            return window.localStorage.getItem(editedStorageKey) === '1';
        } catch {
            return false;
        }
    });

    // Owner actions menu (Edit/Delete) — reduces visual clutter vs separate icons
    const [ownerMenuEl, setOwnerMenuEl] = useState(null);
    const ownerMenuOpen = Boolean(ownerMenuEl);
    const openOwnerMenu = (e) => {
        e.stopPropagation();
        setOwnerMenuEl(e.currentTarget);
    };
    const closeOwnerMenu = (e) => {
        if (e) e.stopPropagation();
        setOwnerMenuEl(null);
    };

    useEffect(() => {
        if (!editedStorageKey) return;
        if (!isEditedNow) return;
        setPersistedEdited(true);
        try {
            window.localStorage.setItem(editedStorageKey, '1');
        } catch {
            // ignore
        }
    }, [editedStorageKey, isEditedNow]);

    const showEdited = isEditedNow || persistedEdited;

    const finalLikesCount = Number(likesCount ?? likes_count ?? like_count ?? likes ?? 0);
    const finalViewerLiked = Boolean(viewerLiked ?? viewer_liked ?? liked ?? is_liked ?? false);
    const finalCommentsCount = Number(commentsCount ?? comments_count ?? comment_count ?? comments ?? 0);
    const finalRepostsCount = Number(repostsCount ?? reposts_count ?? repost_count ?? reposts ?? 0);
    const finalViewerReposted = Boolean(viewerReposted ?? viewer_reposted ?? reposted ?? is_reposted ?? false);

    const avatarSrc = (avatar_url || profile_picture || '').trim();
    const postDate = date_created || posted_at;

    const [imgError, setImgError] = useState(false);

    const processedPhotos = extractPhotos(post);
    const mainPhoto = processedPhotos[0] || '';
    const showImage = !!mainPhoto && !imgError;

    const countyLabel = county ? (String(county).toLowerCase().includes('county') ? county : `${county} County`) : '';
    const locationStr = [post.city, countyLabel].filter(Boolean).join(', ');

    const safeDesc = typeof description === 'string' ? description : (description ?? '').toString();

    const resolvedAtValue = resolved_at || post?.resolvedAt || null;
    const resolvedMsg = String(resolved_message || post?.resolvedMessage || '').trim();
    const isResolved = Boolean(resolvedAtValue || resolvedMsg);

    // Lost/Found posts: if an update message exists, show ONLY the update preview (hide description preview).
    // Update message sources:
    // - resolved_message / resolvedMessage ("Marked as Found" flow)
    // - update_* fields (if you store a text update separately)
    const isLostFoundPost =
        Boolean(String(lost_or_found || '').trim()) ||
        ['lost-found', 'lost-and-found'].includes(String(category || '').toLowerCase());

    const rawUpdateMsg = String(
        post?.update_message ??
        post?.updateMessage ??
        post?.update_text ??
        post?.updateText ??
        post?.update ??
        ''
    ).trim();

    const lostFoundUpdateMsg = String(resolvedMsg || rawUpdateMsg || '').trim();
    const hasLostFoundUpdate = isLostFoundPost && Boolean(lostFoundUpdateMsg);

    /* Short preview + "more" hint */
    const WORD_LIMIT = 18;
    const CHAR_LIMIT = 160;

    const descTrimmed = safeDesc.trim();
    const words = descTrimmed.split(/\s+/).filter(Boolean);

    const longByWords = words.length > WORD_LIMIT;
    const longByChars = descTrimmed.length > CHAR_LIMIT;

    const long = longByWords || longByChars;

    const preview = !long
        ? descTrimmed
        : longByWords
            ? `${words.slice(0, WORD_LIMIT).join(' ')}...`
            : `${descTrimmed.slice(0, CHAR_LIMIT).trimEnd()}...`;

    const updateNormalized = lostFoundUpdateMsg.replace(/\s+/g, ' ').trim();
    const UPDATE_CHAR_LIMIT = 32;
    const updateNeedsMore = updateNormalized.length > UPDATE_CHAR_LIMIT;

    const updatePreviewText = updateNeedsMore
        ? `${updateNormalized.slice(0, UPDATE_CHAR_LIMIT).trimEnd()}…`
        : updateNormalized;

    const showDescriptionPreview = Boolean(preview) && !hasLostFoundUpdate;

    const badgeMeta = buildBadgeFor({ category, lost_or_found, rec_type, help_type, request_kind, requestKind });
    const actionChip = (() => {
        if (!badgeMeta) return null;

        // Brand-driven chip styling:
        // - Default: subtle dark-green tint
        // - Hover/Selected: solid gold (matches marker + header accent)
        const active =
            String(hoveredId ?? '') === String(toHoverKey(id)) ||
            (selectable && String(selectedId ?? '') === String(id));

        const markerSrc = active
            ? (badgeMeta.markerGold || badgeMeta.marker || badgeMeta.iconGold || badgeMeta.icon)
            : (badgeMeta.markerGreen || badgeMeta.marker || badgeMeta.iconGreen || badgeMeta.icon);

        return (
            <Chip
                size="small"
                label={badgeMeta.label}
                icon={
                    <Box
                        component="img"
                        src={markerSrc}
                        alt=""
                        sx={{ width: 20, height: 20, display: 'block' }}
                    />
                }
                sx={(t) => {
                    const green = t.palette.primary.main;
                    const gold = t.palette.secondary.main;

                    if (active) {
                        return {
                            height: 28,
                            maxWidth: 200,
                            minWidth: 0,
                            bgcolor: green,
                            color: '#FFFFFF',
                            border: '1px solid',
                            borderColor: gold,
                            boxShadow: `0 8px 18px ${alphaColor(gold, 0.28)}`,
                            '& .MuiChip-icon': { marginLeft: '6px', marginRight: '2px' },
                            '& .MuiChip-label': {
                                fontWeight: 900,
                                color: '#FFFFFF',
                                paddingRight: '10px',
                                paddingLeft: '6px',
                                fontSize: 12,
                                lineHeight: 1,
                                maxWidth: 160,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            },
                        };
                    }

                    return {
                        height: 28,
                        maxWidth: 200,
                        minWidth: 0,
                        bgcolor: alphaColor(green, 0.10),
                        color: green,
                        border: '1px solid',
                        borderColor: alphaColor(green, 0.28),
                        '& .MuiChip-icon': { marginLeft: '6px', marginRight: '2px' },
                        '& .MuiChip-label': {
                            fontWeight: 800,
                            color: green,
                            paddingRight: '10px',
                            paddingLeft: '6px',
                            fontSize: 12,
                            lineHeight: 1,
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        },
                    };
                }}
            />
        );
    })();

    const [avatarErrored, setAvatarErrored] = useState(false);
    useEffect(() => {
        setAvatarErrored(false);
    }, [avatarSrc, id]);
    const avatarImgSrc = !avatarErrored ? avatarSrc : '';

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

    const derivedCategory = deriveSplitCategory(post);

    const helpTypeRaw = String(post?.help_type || help_type || '').trim().toLowerCase();
    const helpTypeOther = String(post?.help_type_other || post?.help_typeOther || '').trim();
    const helpTypeLabel =
        helpTypeRaw
            ? (helpTypeRaw === 'other'
                ? (helpTypeOther ? `Other: ${helpTypeOther}` : 'Other')
                : (HELP_TYPE_LABELS[helpTypeRaw] || formatNiceLabel(helpTypeRaw)))
            : '';

    const isHelpRequest =
        ['help-requests', 'help_requests', 'help request', 'help requests'].includes(derivedCategory) ||
        ['help-requests', 'help_requests', 'volunteer-help-requests', 'volunteer-requests', 'volunteer_help_requests'].includes(
            String(post?.category || '').toLowerCase()
        );

    const isUrgent =
        isHelpRequest &&
        Boolean(Number(post?.is_urgent ?? post?.isUrgent ?? post?.urgent ?? 0));

    const isMapPopupCard = showTopAccent === false;

    const isProfileContext =
        String(actionBarVariant || '').trim().toLowerCase() === 'profile' || Boolean(forceProfileActionBar);

    const showMarkFoundButton =
        canManage &&
        String(lost_or_found || '').toLowerCase() === 'lost' &&
        !isResolved;

    const markFoundBtnNode = showMarkFoundButton ? (
        <Button
            size="small"
            variant="outlined"
            startIcon={<CheckCircleOutlineIcon />}
            onClick={(e) => {
                e.stopPropagation();
                fire('ll:communityPost:requestMarkFound', { postId: id, post });
            }}
            sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 800, py: 0.5 }}
        >
            Mark as Found
        </Button>
    ) : null;

    const ownerMenuNode = canManage ? (
        <>
            <Tooltip title="Post options" arrow>
                <IconButton
                    size="small"
                    aria-label="Post options"
                    onClick={openOwnerMenu}
                    sx={{
                        width: 34,
                        height: 34,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: '#FFFFFF',
                        color: 'text.secondary',
                        '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    }}
                >
                    <MoreVertIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={ownerMenuEl}
                open={ownerMenuOpen}
                onClose={closeOwnerMenu}
                onClick={(e) => e.stopPropagation()}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{
                    sx: {
                        mt: 0.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        boxShadow: '0 18px 50px rgba(0,0,0,0.16)',
                        minWidth: 190,
                    },
                }}
            >
                <MenuItem
                    onClick={(e) => {
                        e.stopPropagation();
                        closeOwnerMenu(e);
                        fire('ll:communityPost:requestEdit', { postId: id, post });
                    }}
                >
                    <ListItemIcon>
                        <EditIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Edit post" />
                </MenuItem>

                <MenuItem
                    onClick={(e) => {
                        e.stopPropagation();
                        closeOwnerMenu(e);
                        fire('ll:communityPost:requestDelete', { postId: id, post });
                    }}
                    sx={{ color: 'error.main' }}
                >
                    <ListItemIcon sx={{ color: 'error.main' }}>
                        <DeleteIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Delete post" />
                </MenuItem>
            </Menu>
        </>
    ) : null;

    const headerActionNode = (isMapPopupCard || isProfileContext) ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                {actionChip}
                {ownerMenuNode}
            </Box>
            {markFoundBtnNode}
        </Box>
    ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {markFoundBtnNode}
            {actionChip}
            {ownerMenuNode}
        </Box>
    );

    return (
        <Card
            data-post-id={id}
            data-selected={isSelected ? 'true' : 'false'}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: 360,
                position: 'relative',
                isolation: 'isolate',
                borderRadius: '14px',
                border: 1,
                borderColor: isSelected ? 'secondary.main' : (isHovered ? 'primary.main' : 'divider'),
                bgcolor: '#FFFFFF',
                backgroundImage: (t) => `linear-gradient(180deg, ${alphaColor(t.palette.primary.main, 0.05)} 0%, rgba(255,255,255,0) 60%)`,
                overflow: 'hidden',
                boxShadow: isSelected
                    ? '0 16px 40px rgba(0,0,0,0.14)'
                    : (isHovered ? '0 10px 26px rgba(0,0,0,0.10)' : '0 6px 18px rgba(0,0,0,0.08)'),
                transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background-color 140ms ease',
                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                ...(showTopAccent
                    ? {
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            right: 0,
                            height: 3,
                            backgroundColor: (t) => ((isSelected || isHovered) ? t.palette.secondary.main : t.palette.primary.main),
                            opacity: 0.95,
                            transition: 'background-color 140ms ease, opacity 120ms ease',
                        },

                        '&::after': {
                            content: '""',
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            opacity: (isSelected || isHovered) ? 1 : 0,
                            transition: 'opacity 140ms ease',
                            backgroundImage: (t) => {
                                const a = isSelected
                                    ? alphaColor(t.palette.secondary.main, 0.10)
                                    : alphaColor(t.palette.primary.main, 0.06);
                                return `linear-gradient(180deg, ${a} 0%, rgba(255,255,255,0) 62%) ago`;
                            },
                        },
                    }
                    : {}),

                backgroundClip: 'padding-box',
            }}
            onMouseEnter={() => setHoveredId?.(hoverKey)}
            onMouseLeave={() => setHoveredId?.(null)}
        >
            <CardHeader
                action={headerActionNode}
                avatar={
                    <Avatar
                        src={avatarImgSrc || undefined}
                        sx={{ bgcolor: 'grey.600', width: 50, height: 50, flexShrink: 0, cursor: 'pointer' }}
                        onClick={openUserCard}
                        onError={() => setAvatarErrored(true)}
                    />
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
                            {timeAgoCompact(postDate)}
                            {showEdited && canManage ? (
                                <Box
                                    component="span"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fire('ll:communityPost:requestHistory', { postId: id, post });
                                    }}
                                    sx={{ ml: 1, fontWeight: 700, cursor: 'pointer', color: 'primary.main', textDecoration: 'underline' }}
                                    title="Click to view edit history"
                                >
                                    (Edited)
                                </Box>
                            ) : null}
                        </Typography>
                    </Box>
                }
                sx={{
                    px: 2,
                    pt: 1.5,
                    pb: 1,
                    '& .MuiCardHeader-avatar': { mr: 1.5 },
                    '& .MuiCardHeader-action': { alignSelf: 'center', mt: 0 },
                }}
            />

            <CardActionArea onClick={() => onCardClick?.(post)} sx={{ flex: 1, px: 2, pt: showImage ? 1.25 : 0.75, pb: 1.25
                , '& .MuiCardActionArea-focusHighlight': { opacity: 0 }
                , '&:hover .MuiCardActionArea-focusHighlight': { opacity: 0 }
            }}>
                <Box sx={{ display: 'flex', gap: showImage ? 2 : 0 }}>
                    {showImage && (
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <Box
                                component="img"
                                src={mainPhoto}
                                loading="lazy"
                                onError={() => setImgError(true)}
                                sx={{
                                    width: 112,
                                    height: 112,
                                    objectFit: 'cover',
                                    borderRadius: '14px',
                                    flexShrink: 0,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                                    bgcolor: (t) => alphaColor(t.palette.common.white, 0.65),
                                }}
                                alt=""
                            />
                            {processedPhotos.length > 1 ? (
                                <Box
                                    sx={{
                                        mt: 0.65,
                                        px: 1.1,
                                        py: 0.25,
                                        borderRadius: 999,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: 'rgba(0,0,0,0.03)',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        color: 'text.secondary',
                                        lineHeight: 1.2,
                                        whiteSpace: 'nowrap',
                                        userSelect: 'none',
                                    }}
                                >
                                    +{processedPhotos.length - 1} more {processedPhotos.length - 1 === 1 ? 'photo' : 'photos'}
                                </Box>
                            ) : null}
                        </Box>
                    )}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {title && (
                            <Typography
                                variant="h6"
                                sx={{
                                    mt: 0.25,
                                    fontSize: '1.05rem',
                                    fontWeight: 800,
                                    letterSpacing: '-0.01em',
                                    lineHeight: 1.2,
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
                                    ...(isMapPopupCard
                                        ? {
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }
                                        : {}),
                                }}
                            >
                                {title}
                            </Typography>
                        )}


                        {/* Help type + Urgent (for Help Requests / Volunteers) */}
                        {(helpTypeLabel || isUrgent) ? (
                            <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {helpTypeLabel ? (
                                    <Chip
                                        size="small"
                                        label={helpTypeLabel}
                                        sx={{ borderRadius: 999, fontWeight: 800 }}
                                    />
                                ) : null}

                                {isUrgent ? (
                                    <Chip
                                        size="small"
                                        label="Urgent"
                                        sx={{
                                            borderRadius: 999,
                                            fontWeight: 900,
                                            border: '1px solid rgba(211, 47, 47, 0.35)',
                                            bgcolor: 'rgba(211, 47, 47, 0.08)',
                                            '& .MuiChip-label': { fontWeight: 900 },
                                        }}
                                    />
                                ) : null}
                            </Box>
                        ) : null}

                        {(isResolved || hasLostFoundUpdate) ? (
                            <Box sx={{ mt: 0.75 }}>
                                {isResolved ? (
                                    <Chip
                                        size="small"
                                        label="Marked as Found"
                                        icon={<CheckCircleRoundedIcon sx={{ color: '#1b5e20 !important' }} />}
                                        sx={{
                                            fontWeight: 900,
                                            borderRadius: 999,
                                            border: '1px solid rgba(46, 125, 50, 0.35)',
                                            bgcolor: 'rgba(46, 125, 50, 0.08)',
                                            '& .MuiChip-label': { fontWeight: 900 },
                                            mb: hasLostFoundUpdate ? 0.75 : 0,
                                        }}
                                    />
                                ) : null}

                                {hasLostFoundUpdate ? (
                                    <Box
                                        sx={{
                                            px: 1.0,
                                            py: 0.75,
                                            borderRadius: '14px',
                                            bgcolor: 'rgba(46, 125, 50, 0.08)',
                                            border: '1px solid rgba(46, 125, 50, 0.22)',
                                            width: '100%',
                                            maxWidth: '100%',
                                            minWidth: 0,
                                            flexBasis: 0,
                                            overflow: 'hidden',
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                                            Update
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{
                                                    lineHeight: 1.4,
                                                    flex: '1 1 0%',
                                                    minWidth: 0,
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    display: 'block',
                                                    maxWidth: '100%',
                                                    overflowWrap: 'anywhere',
                                                }}
                                            >
                                                {updatePreviewText}
                                            </Typography>
                                            {updateNeedsMore ? (
                                                <Link
                                                    component="span"
                                                    underline="hover"
                                                    color="inherit"
                                                    sx={{ flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap' }}
                                                >
                                                    more
                                                </Link>
                                            ) : null}
                                        </Box>
                                    </Box>
                                ) : null}
                            </Box>
                        ) : null}

                        {showDescriptionPreview && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                    mt: 0.6,
                                    lineHeight: 1.4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: isMapPopupCard ? 2 : 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
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
                                sx={{
                                    alignSelf: 'flex-start',
                                    mt: 0.85,
                                    fontWeight: 800,
                                    borderRadius: 999,
                                    bgcolor: 'rgba(255, 152, 0, 0.12)',
                                    border: '1px solid',
                                    borderColor: 'rgba(255, 152, 0, 0.35)',
                                }}
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
                        mb: 0.75, // extra space between address and the action bar
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

            <CardActions sx={{ px: 2, pt: 1.0, pb: 1.5, mt: 'auto', borderTop: '1px solid', borderColor: 'divider' }}>
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

/* NEW: skeleton post cards (4) while revealing/loading next chunk */
const SkeletonPostCard = () => (
    <Card
        sx={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: 360,
            borderRadius: '14px',
            border: 1,
            borderColor: 'divider',
            overflow: 'hidden',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        }}
    >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, pb: 1 }}>
            <Skeleton variant="circular" width={40} height={40} animation="wave" />
            <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="55%" animation="wave" />
                <Skeleton variant="text" width="35%" animation="wave" />
            </Box>
            <Skeleton variant="rounded" width={84} height={26} animation="wave" />
        </Box>

        <Box sx={{ px: 2, pb: 1.5 }}>
            <Skeleton variant="text" width="65%" animation="wave" />
            <Skeleton variant="text" width="85%" animation="wave" />
            <Skeleton variant="text" width="70%" animation="wave" />
        </Box>

        <Box sx={{ mt: 'auto', p: 2, pt: 0 }}>
            <Skeleton variant="rounded" height={36} animation="wave" />
        </Box>
    </Card>
);

/* --------------------------------------------------------------------------
 * Pagination + virtualized render
 * ------------------------------------------------------------------------ */
const PAGE_SIZE = 50;        // ← load 50 at a time from the API
const PREFETCH_AT = 45;      // ← when scrolled past item #45, prefetch next 50
const LOCAL_CHUNK = 50;      // ← for the controlled (client-only) list window
const MIN_BOTTOM_LOADER_MS = 250;

export default function CommunityList({
                                          isRefreshing = false,
                                          user,
                                          posts,
                                          loading = false,
                                          hoveredId,
                                          setHoveredId,
                                          onLocationClick,
                                          onCardClick,
                                          query = '',
                                          view = '',
                                          selectedId = null,
                                          selectable = false,

                                          // NEW (optional): lets parent provide true totals + paging
                                          totalCount = null,
                                          hasMoreExternal = null,
                                          onLoadMore = null,

                                          // NEW (optional): report display stats to parent for the fixed bar
                                          onDisplayStatsChange = null,

                                          onMutate = null,
                                      }) {
    const auth = useAuth();
    const [postOverrides, setPostOverrides] = useState({});
    const [deletedIds, setDeletedIds] = useState(() => new Set());

    const [editOpen, setEditOpen] = useState(false);
    const [editPostId, setEditPostId] = useState(null);

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletePostId, setDeletePostId] = useState(null);

    const [markFoundOpen, setMarkFoundOpen] = useState(false);
    const [markFoundPostId, setMarkFoundPostId] = useState(null);
    const [markFoundPost, setMarkFoundPost] = useState(null);
    const [markFoundMessage, setMarkFoundMessage] = useState('');
    const [markFoundSaving, setMarkFoundSaving] = useState(false);
    const [markFoundError, setMarkFoundError] = useState('');

    const MARK_FOUND_MAX = 1000;

    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyPostId, setHistoryPostId] = useState(null);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');


    // Fetch the canonical latest post payload from the server (used after Edit dialog closes)
    // so the Community list + Post detail + Post page all update immediately.
    const fetchLatestPost = useCallback(async (pid) => {
        const idStr = pid != null ? String(pid) : '';
        if (!idStr) return null;

        const urls = [
            `/api/community/${encodeURIComponent(idStr)}`,
            `/api/community/posts/${encodeURIComponent(idStr)}`,
        ];

        for (const url of urls) {
            try {
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                if (!res.ok) continue;

                const data = await res.json().catch(() => null);
                const normalized = Array.isArray(data) ? data[0] : data;

                if (normalized && typeof normalized === 'object') return normalized;
            } catch {
                // try next
            }
        }

        return null;
    }, []);

    const broadcastPostUpdated = useCallback((updated) => {
        if (!updated || updated.id == null) return;
        const pid = Number(updated.id);
        if (!Number.isFinite(pid) || pid <= 0) return;

        // Only persist the (Edited) badge if the server says the post is edited.
        const isEdited = Boolean(
            updated?.edited_at ||
            updated?.editedAt ||
            updated?.has_edits ||
            updated?.edits_count ||
            updated?.editsCount
        );

        if (isEdited) {
            try {
                window.localStorage.setItem(`ll.communityPost.edited.${pid}`, '1');
            } catch {
                // ignore
            }
        }

        try {
            window.dispatchEvent(
                new CustomEvent('ll:communityPost:updated', {
                    detail: { postId: pid, post: updated, forceRefresh: true },
                })
            );
        } catch {
            // ignore
        }
    }, []);

    const closeEditDialog = useCallback(async () => {
        const pid = Number(editPostId || 0);

        setEditOpen(false);
        setEditPostId(null);

        // Always re-hydrate after closing the edit dialog so every view updates immediately.
        // (If the user cancelled, this is a harmless no-op update.)
        if (pid) {
            const latest = await fetchLatestPost(pid);
            if (latest) broadcastPostUpdated(latest);
        }

        if (typeof onMutate === 'function') onMutate();
    }, [editPostId, fetchLatestPost, broadcastPostUpdated, onMutate]);

    const closeMarkFoundDialog = () => {
        setMarkFoundOpen(false);
        setMarkFoundPostId(null);
        setMarkFoundPost(null);
        setMarkFoundMessage('');
        setMarkFoundError('');
        setMarkFoundSaving(false);
    };

    const closeHistoryDialog = () => {
        setHistoryOpen(false);
        setHistoryPostId(null);
        setHistoryRows([]);
        setHistoryError('');
        setHistoryLoading(false);
    };

    useEffect(() => {
        const onReqEdit = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setEditPostId(pid);
            setEditOpen(true);
        };

        const onReqDelete = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setDeletePostId(pid);
            setDeleteConfirmOpen(true);
        };

        const onReqMarkFound = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setMarkFoundError('');
            setMarkFoundMessage('');
            setMarkFoundPostId(pid);
            setMarkFoundPost(e?.detail?.post || null);
            setMarkFoundOpen(true);
        };

        const onReqHistory = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setHistoryError('');
            setHistoryRows([]);
            setHistoryPostId(pid);
            setHistoryOpen(true);
        };

        window.addEventListener('ll:communityPost:requestEdit', onReqEdit);
        window.addEventListener('ll:communityPost:requestDelete', onReqDelete);
        window.addEventListener('ll:communityPost:requestMarkFound', onReqMarkFound);
        window.addEventListener('ll:communityPost:requestHistory', onReqHistory);

        return () => {
            window.removeEventListener('ll:communityPost:requestEdit', onReqEdit);
            window.removeEventListener('ll:communityPost:requestDelete', onReqDelete);
            window.removeEventListener('ll:communityPost:requestMarkFound', onReqMarkFound);
            window.removeEventListener('ll:communityPost:requestHistory', onReqHistory);
        };
    }, []);

// When an edit succeeds, refresh the list (or patch rows in-place) so the UI shows the latest content immediately.
    // Keep the list visually in sync immediately after edits/deletes/mark-found without relying on a full refetch.
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

        const onUpdated = (e) => {
            const updated = getPostFromEvent(e);
            const updatedId = Number(updated?.id || 0);
            if (!updatedId) return;

            // Persist "edited" badge even if list endpoint omits edited fields
            try {
                window.localStorage.setItem(`ll.communityPost.edited.${updatedId}`, '1');
            } catch {
                // ignore
            }

            // Merge as an override so controlled lists re-render immediately.
            setPostOverrides((prev) => ({
                ...prev,
                [updatedId]: { ...(prev?.[updatedId] || {}), ...updated },
            }));

            // Patch internal rows too (uncontrolled mode)
            try {
                setRows((prev) => (Array.isArray(prev) ? prev.map((p) => (Number(p?.id) === updatedId ? { ...p, ...updated } : p)) : prev));
            } catch {
                // ignore
            }
        };

        const onDeleted = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.id || e?.detail?.post?.id || 0);
            if (!pid) return;

            setDeletedIds((prev) => {
                const next = new Set(prev);
                next.add(pid);
                return next;
            });

            setPostOverrides((prev) => {
                if (!prev || !prev[pid]) return prev;
                const next = { ...prev };
                delete next[pid];
                return next;
            });

            try {
                setRows((prev) => (Array.isArray(prev) ? prev.filter((p) => Number(p?.id) !== pid) : prev));
            } catch {
                // ignore
            }
        };

        window.addEventListener('ll:communityPost:updated', onUpdated);
        window.addEventListener('ll:communityPost:markedFound', onUpdated);
        window.addEventListener('ll:communityPost:deleted', onDeleted);

        return () => {
            window.removeEventListener('ll:communityPost:updated', onUpdated);
            window.removeEventListener('ll:communityPost:markedFound', onUpdated);
            window.removeEventListener('ll:communityPost:deleted', onDeleted);
        };
    }, []);
    useEffect(() => {
        const run = async () => {
            if (!historyOpen || !historyPostId) return;
            setHistoryLoading(true);
            setHistoryError('');
            try {
                const res = await axios.get(`/api/community/${historyPostId}/edits`);
                setHistoryRows(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                const msg = err?.response?.data?.message || err?.message || 'Failed to load edit history.';
                setHistoryError(String(msg));
            } finally {
                setHistoryLoading(false);
            }
        };
        run();
    }, [historyOpen, historyPostId]);

    const submitMarkFound = async () => {
        if (!markFoundPostId) return;
        setMarkFoundSaving(true);
        setMarkFoundError('');
        try {
            const res = await axios.post(`/api/community/${markFoundPostId}/mark-found`, {
                message: markFoundMessage || '',
            });
            const updated = res?.data && typeof res.data === 'object' ? res.data : null;
            if (updated) {
                window.dispatchEvent(new CustomEvent('ll:communityPost:markedFound', { detail: { post: updated } }));
            }

            // Make sure (Edited) can remain visible even if list refresh omits edited flags
            try {
                window.localStorage.setItem(`ll.communityPost.edited.${Number(markFoundPostId)}`, '1');
            } catch {
                // ignore
            }

            closeMarkFoundDialog();
            if (typeof onMutate === 'function') onMutate();
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to mark as found.';
            setMarkFoundError(String(msg));
        } finally {
            setMarkFoundSaving(false);
        }
    };

    const controlled = typeof posts !== 'undefined';

    const isTrendingView = String(view || '').trim().toLowerCase() === 'trending';

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

    // NEW: controlled mode chunk loading UI
    const [controlledChunkLoading, setControlledChunkLoading] = useState(false);
    const controlledSentinelRef = useRef(null);
    const awaitingServerAppendRef = useRef(false);
    const requestedMoreRef = useRef(false);

    // Bottom loader timing (≥ 250ms)
    const [showBottomLoader, setShowBottomLoader] = useState(false);
    const bottomStartRef = useRef(0);
    const bottomTimerRef = useRef(null);
    const prevULoadingRef = useRef(uLoading);

    // Server-verified following set keyed by user id (author id)
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

    // Controlled: don’t reset renderCount when posts append; only reset when list shrinks (new search)
    const prevControlledLenRef = useRef(0);
    useEffect(() => {
        if (!controlled) return;

        const nextLen = Array.isArray(posts) ? posts.length : 0;
        const prevLen = prevControlledLenRef.current;

        if (nextLen < prevLen) {
            // new search / filters replaced the list
            setRenderCount(LOCAL_CHUNK);
            setControlledChunkLoading(false);
            awaitingServerAppendRef.current = false;
            requestedMoreRef.current = false;
        } else if (nextLen > prevLen) {
            // append from parent (server load more)
            if (awaitingServerAppendRef.current) {
                awaitingServerAppendRef.current = false;
                requestedMoreRef.current = false;

                // reveal next chunk after a short shimmer beat
                setTimeout(() => {
                    setRenderCount((c) => Math.min(c + PAGE_SIZE, nextLen));
                    setControlledChunkLoading(false);
                }, 150);
            }
        }

        prevControlledLenRef.current = nextLen;
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

    const baseList = controlled ? (Array.isArray(posts) ? posts : []) : rows;

    const list = useMemo(() => {
        const arr = Array.isArray(baseList) ? baseList : [];
        const hasOverrides = postOverrides && Object.keys(postOverrides).length > 0;
        const hasDeleted = deletedIds && deletedIds.size > 0;

        if (!hasOverrides && !hasDeleted) return arr;

        return arr
            .filter((p) => {
                const pid = Number(p?.id || 0);
                return !(hasDeleted && pid && deletedIds.has(pid));
            })
            .map((p) => {
                const pid = Number(p?.id || 0);
                if (!pid || !hasOverrides) return p;
                const ov = postOverrides[pid];
                return ov ? { ...p, ...ov } : p;
            });
    }, [baseList, postOverrides, deletedIds]);

    const visible = controlled ? list.slice(0, renderCount) : list;

    // ✅ Report stats upward (for the fixed bar in CommunityPanel)
    const effectiveTotal =
        Number.isFinite(Number(totalCount)) ? Number(totalCount)
            : (controlled ? list.length : list.length);

    useEffect(() => {
        if (typeof onDisplayStatsChange !== 'function') return;
        onDisplayStatsChange({
            displayed: controlled ? Math.min(renderCount, list.length) : list.length,
            displaying: controlled ? Math.min(renderCount, list.length) : list.length,
            total: effectiveTotal,
            loadingMore: Boolean(controlled ? controlledChunkLoading : (showBottomLoader || uLoading)),
        });
    }, [onDisplayStatsChange, controlled, renderCount, list.length, effectiveTotal]);

    // Controlled: sentinel to reveal next chunk / request next page from parent
    useEffect(() => {
        if (!controlled) return undefined;

        const el = controlledSentinelRef.current;
        if (!el) return undefined;

        const rootEl = document.querySelector('[data-community-scroll]') || null;

        const io = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;

                const loadedLen = list.length;
                const canRevealMore = renderCount < loadedLen;

                // If we have more already loaded, reveal next 100 with shimmer
                if (canRevealMore && !controlledChunkLoading) {
                    setControlledChunkLoading(true);
                    setTimeout(() => {
                        setRenderCount((c) => Math.min(c + PAGE_SIZE, loadedLen));
                        setControlledChunkLoading(false);
                    }, 350);
                    return;
                }

                // If we’ve revealed everything we currently have, but parent says more exist: request more
                const externalHasMore = (hasMoreExternal == null) ? false : Boolean(hasMoreExternal);
                if (!canRevealMore && externalHasMore && typeof onLoadMore === 'function') {
                    if (requestedMoreRef.current) return;
                    requestedMoreRef.current = true;
                    awaitingServerAppendRef.current = true;

                    setControlledChunkLoading(true);
                    onLoadMore();
                }
            },
            { root: rootEl, rootMargin: '900px', threshold: 0.1 }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [controlled, list.length, renderCount, controlledChunkLoading, hasMoreExternal, onLoadMore]);

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
                            currentView={view}
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
    // When filters/view change, show the same gray placeholder style used for infinite scroll loading.
    if (isRefreshing) {
        return (
            <Box sx={{ width: '100%', height: '100%' }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'stretch',
                        justifyContent: 'flex-start',
                    }}
                >
                    {Array.from({ length: 6 }).map((_, idx) => (
                        <Box
                            key={`skeleton-${idx}`}
                            sx={{
                                flex: {
                                    xs: '0 0 100%',
                                    sm: '0 0 100%',
                                    md: '0 0 calc(50% - 16px)',
                                    lg: '0 0 calc(50% - 16px)',
                                    xl: '0 0 calc(50% - 16px)',
                                },
                                mx: 1,
                                my: 1,
                                minWidth: 0,
                                maxWidth: '100%',
                            }}
                        >
                            <SkeletonPostCard />
                        </Box>
                    ))}
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflow: 'hidden' }}>
            {visible.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', width: '100%', overflowX: 'hidden' }}>
                    {renderedGrid}

                    {/* ✅ Controlled-mode skeletons while revealing or waiting on server */}
                    {controlled && controlledChunkLoading && (
                        <>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Box
                                    key={`controlled-sk-${i}`}
                                    sx={{
                                        flex: {
                                            xs: '0 0 100%',
                                            sm: '0 0 100%',
                                            md: '0 0 calc(50% - 16px)',
                                            lg: '0 0 calc(50% - 16px)',
                                            xl: '0 0 calc(50% - 16px)',
                                        },
                                        mx: 1,
                                        my: 1,
                                        minWidth: 0,
                                        maxWidth: '100%',
                                    }}
                                >
                                    <SkeletonPostCard />
                                </Box>
                            ))}
                        </>
                    )}

                    {/* Bottom-of-list inline loader under the last row while fetching (≥ 250ms) */}
                    {showBottomLoader && (
                        <Box sx={{ flex: '0 0 100%', display: 'flex', justifyContent: 'center', py: 2 }}>
                            <LoadingDots />
                        </Box>
                    )}
                </Box>
            )}

            {/* Invisible sentinel to trigger next fetch (bottom) */}
            {!controlled && <Box ref={sentinelRef} sx={{ height: 1 }} />}

            {/* Controlled sentinel (trigger reveal / server page) */}
            {controlled && <Box ref={controlledSentinelRef} sx={{ height: 1 }} />}

            {/* Initial full-screen overlay only for the very first load */}
            {initialLoading && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bgcolor: '#FFFFFF',
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
                        {isTrendingView ? 'No trending posts yet for these filters.' : 'No posts found.'}
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
                onViewProfile={(u) => window.location.assign(`/${u.handle || u.id}`)}
            />

            <EditCommunityPostDialog open={editOpen} postId={editPostId} onClose={closeEditDialog} />

            <DeletePostConfirmDialog
                open={deleteConfirmOpen}
                postId={deletePostId}
                onClose={() => {
                    setDeleteConfirmOpen(false);
                    setDeletePostId(null);
                }}
                onDeleted={() => {
                    const pid = Number(deletePostId || 0);
                    // Notify any listeners (CommunityPage/PostDetail/PostPage) to refetch or clear selection.
                    if (pid) {
                        try {
                            window.dispatchEvent(new CustomEvent('ll:communityPost:deleted', { detail: { postId: pid } }));
                        } catch {
                            // ignore
                        }
                    }

                    setDeleteConfirmOpen(false);
                    setDeletePostId(null);
                    if (typeof onMutate === 'function') onMutate();
                }}
            />

            <Dialog
                open={markFoundOpen}
                fullWidth
                maxWidth="sm"
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return;
                    closeMarkFoundDialog();
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Mark as Found
                    <IconButton onClick={closeMarkFoundDialog} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {markFoundError ? (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {markFoundError}
                        </Alert>
                    ) : null}

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {markFoundPost?.title
                            ? `You're marking “${markFoundPost.title}” as found.`
                            : 'You are marking this item as found.'}
                        {' '}You can optionally add an update message.
                    </Typography>

                    <TextField
                        label="Update message (optional)"
                        value={markFoundMessage}
                        onChange={(e) => setMarkFoundMessage(e.target.value.slice(0, MARK_FOUND_MAX))}
                        fullWidth
                        multiline
                        minRows={3}
                        inputProps={{ maxLength: MARK_FOUND_MAX }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeMarkFoundDialog} disabled={markFoundSaving}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={submitMarkFound} disabled={markFoundSaving}>
                        {markFoundSaving ? 'Saving…' : 'Mark as Found'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={historyOpen}
                fullWidth
                maxWidth="md"
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return;
                    closeHistoryDialog();
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Post Edit History
                    <IconButton onClick={closeHistoryDialog} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {historyError ? (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {historyError}
                        </Alert>
                    ) : null}

                    {historyLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2">Loading history…</Typography>
                        </Box>
                    ) : null}

                    {!historyLoading && !historyError && (!historyRows || historyRows.length === 0) ? (
                        <Typography variant="body2" color="text.secondary">
                            No edit history found.
                        </Typography>
                    ) : null}

                    {!historyLoading && historyRows && historyRows.length ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {historyRows.map((row) => (
                                <Box
                                    key={row.id || row.version}
                                    sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 2, p: 1.25 }}
                                >
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Version {row.version}{row.edited_at ? ` • ${dateTimeLabel(row.edited_at)}` : ''}{row.editor_handle ? ` • @${row.editor_handle}` : ''}
                                    </Typography>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                        {row?.snapshot?.title || '(no title)'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {row?.snapshot?.description || ''}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    ) : null}
                </DialogContent>
            </Dialog>

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
    view: PropTypes.string,
    selectedId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    selectable: PropTypes.bool,
    currentView: PropTypes.string,

    // NEW (optional)
    totalCount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    hasMoreExternal: PropTypes.bool,
    onLoadMore: PropTypes.func,
    onDisplayStatsChange: PropTypes.func,
    onMutate: PropTypes.func,
};