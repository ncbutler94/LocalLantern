import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams,
    useLocation,
    useNavigate } from 'react-router-dom';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
    Box,
    Paper,
    Typography,
    Avatar,
    Button,
    Divider,
    IconButton,
    Chip,
    TextField,
    InputAdornment,
    CircularProgress,
    Link,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    RadioGroup,
    FormControlLabel,
    Radio,
    Tooltip,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText
} from '@mui/material';

import { alpha as alphaColor } from '@mui/material/styles';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocationOnIcon from '@mui/icons-material/LocationOn';
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

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CloseIcon from '@mui/icons-material/Close';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import PersonIcon from '@mui/icons-material/Person';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';

import ActionBar from '../../components/ActionBar';
import SharePostDialog from '../../components/SharePostDialog';
import UserCardPopover from '../../components/UserCardPopover';
const api = process.env.REACT_APP_API_URL || '';

/* ---------- Relative time helper ---------- */
const timeAgo = (input) => {
    const d = input ? new Date(input) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    const diffMs = Math.max(0, Date.now() - d.getTime());

    const s = Math.floor(diffMs / 1000);
    if (s < 60) return '1m ago';

    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ${h === 1 ? 'hr' : 'hrs'} ago`;
    const dys = Math.floor(h / 24);
    if (dys < 7) return `${dys}d ago`;
    const w = Math.floor(dys / 7);
    if (w < 5) return `${w}${w === 1 ? 'wk' : 'wks'} ago`;
    const mo = Math.floor(dys / 30);
    if (mo < 12) return `${mo}${mo === 1 ? 'mo' : 'mos'} ago`;
    const y = Math.floor(dys / 365);
    return `${y}${y === 1 ? 'yr' : 'yrs'} ago`;
};

/* ---------- Compact relative time helper (for post headers / map popups) ---------- */
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

/* ---------- category/badge helpers (match CommunityList chips) ---------- */
const BADGE = {
    announcement: { label: 'Announcement', markerGreen: announcementMarker, markerGold: announcementMarkerGold },
    announcements: { label: 'Announcement', markerGreen: announcementMarker, markerGold: announcementMarkerGold },

    discussion: { label: 'Discussion', markerGreen: discussionMarker, markerGold: discussionMarkerGold },
    'general-discussion': { label: 'Discussion', markerGreen: discussionMarker, markerGold: discussionMarkerGold },

    // Split recommendations (tips removed)
    tips: { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold }, // legacy fallback
    recommendations: { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    'recommendations-tips': { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold }, // legacy fallback
    tip: { label: 'Recommendation', markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold }, // legacy fallback

    // Split volunteer & help requests
    'help-requests': { label: 'Help Request', markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    volunteers: { label: 'Volunteer', markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-requests': { label: 'Volunteer/Help', markerGreen: volHelpMarker, markerGold: volHelpMarkerGold }, // legacy fallback

    // Lost/Found handled as special case but kept as fallback
    'lost-found': { label: 'Lost / Found', markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },
    'lost-and-found': { label: 'Lost / Found', markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },

    'public-safety-alerts': { label: 'Safety Alert', markerGreen: safetyMarker, markerGold: safetyMarkerGold },

    // Generic fallback
    community: { label: 'Community', markerGreen: communityMarker, markerGold: communityMarkerGold },
};

const deriveSplitCategory = (post) => {
    // Normalize to new slugs when legacy category remains
    let cat = String(post?.category || '').toLowerCase();

    if (cat === 'recommendations-tips' || cat === 'tips' || cat === 'tip') {
        // Tips removed — treat legacy rows as Recommendations.
        return 'recommendations';
    }

    if (cat === 'volunteer-requests' || cat === 'volunteer-help-requests' || cat === 'volunteer-help') {
        const kind = String(post?.request_kind || post?.requestKind || '').toLowerCase();
        if (kind === 'volunteer' || kind === 'offer' || kind === 'offering') return 'volunteers';
        if (kind === 'help' || kind === 'request' || kind === 'help-request' || kind === 'help_request') return 'help-requests';
        // Fallback for legacy rows (no request_kind)
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

const CategoryChip = ({ badge, active = false }) => {
    if (!badge) return null;

    const markerSrc = active
        ? (badge.markerGold || badge.marker || badge.iconGold || badge.icon)
        : (badge.markerGreen || badge.marker || badge.iconGreen || badge.icon);

    return (
        <Chip
            size="small"
            label={badge.label}
            icon={<Box component="img" src={markerSrc} alt="" sx={{ width: 20, height: 20, display: 'block' }} />}
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
};


/* ---------- photos ---------- */
const extractPhotos = (post) => {
    if (!post) return [];
    let processed = [];
    const { photos } = post;

    if (Array.isArray(photos)) {
        processed = photos.filter((p) => p && typeof p === 'string' && p !== 'null');
    } else if (typeof photos === 'string' && photos !== 'null' && photos.trim()) {
        try {
            const parsed = JSON.parse(photos);
            if (Array.isArray(parsed)) processed = parsed.filter((p) => p && typeof p === 'string' && p !== 'null');
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
            .slice(0, 10);
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

/* ---------- Help / Volunteer detail helpers ---------- */
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

const DEFAULT_AVATAR_SX = {
    bgcolor: 'grey.600',
    color: '#fff',
};

const formatDateShort = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatTimeShort = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
        .toLowerCase();
};

const dateTimeLabelShort = (v) => {
    const a = formatDateShort(v);
    const b = formatTimeShort(v);
    return a && b ? `${a} · ${b}` : a || b || '';
};

function HelpVolunteerDetailsPanel({ post, derivedCategory, isUrgent }) {
    const isHelpRequest = ['help-requests', 'help_requests', 'help request', 'help requests'].includes(String(derivedCategory || '').toLowerCase());
    const isVolunteerOffer = ['volunteers', 'volunteer-requests', 'volunteer_requests'].includes(String(derivedCategory || '').toLowerCase());
    const shouldShow = isHelpRequest || isVolunteerOffer;

    // Normalize for backwards-compatible values
    const helpTypeRaw = String(post?.help_type || '').trim().toLowerCase();
    const helpTypeOther = String(post?.help_type_other || post?.other_help_type || '').trim();

    let helpTypeKey = helpTypeRaw
        .replace(/&/g, 'and')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_')
        .trim();

    // Older / alternate values that should map to "care"
    if (helpTypeKey === 'care_and_support' || helpTypeKey === 'care_and_upport') helpTypeKey = 'care';

    const helpTypeLabel = helpTypeKey
        ? helpTypeKey === 'other'
            ? helpTypeOther
                ? `Other: ${helpTypeOther}`
                : 'Other'
            : HELP_TYPE_LABELS[helpTypeKey] || HELP_TYPE_LABELS[helpTypeRaw] || helpTypeRaw
        : '';

    if (!shouldShow) return null;

    return (
        <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {helpTypeLabel ? (
                <Chip
                    size="small"
                    label={helpTypeLabel}
                    sx={{
                        fontWeight: 800,
                        borderRadius: 999,
                    }}
                />
            ) : null}

            {isHelpRequest && isUrgent ? (
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
    );
}



/* ========================================================================== */
/* Flag dialog (no click-away; X in the corner)                               */
/* ========================================================================== */
function FlagCommentDialog({ open, onClose, onSubmit, initialReason = 'spam' }) {
    const [reason, setReason] = useState(initialReason);
    const [details, setDetails] = useState('');

    useEffect(() => {
        if (!open) {
            setReason(initialReason);
            setDetails('');
        }
    }, [open, initialReason]);

    return (
        <Dialog
            open={open}
            onClose={(_e, r) => {
                if (r === 'backdropClick' || r === 'escapeKeyDown') return; // don't close on backdrop or ESC
                onClose();
            }}
            fullWidth
            maxWidth="xs"
        >
            <DialogTitle sx={{ pr: 6 }}>
                Report comment
                <IconButton
                    aria-label="Close"
                    onClick={onClose}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" sx={{ mb: 1 }}>
                    Choose a reason:
                </Typography>
                <RadioGroup value={reason} onChange={(e) => setReason(e.target.value)} sx={{ gap: 0.5 }}>
                    <FormControlLabel value="spam" control={<Radio />} label="Spam" />
                    <FormControlLabel value="harassment" control={<Radio />} label="Harassment" />
                    <FormControlLabel value="hate" control={<Radio />} label="Hate speech" />
                    <FormControlLabel value="nudity" control={<Radio />} label="Nudity" />
                    <FormControlLabel value="misinformation" control={<Radio />} label="Misinformation" />
                    <FormControlLabel value="illegal" control={<Radio />} label="Illegal content" />
                    <FormControlLabel value="other" control={<Radio />} label="Other" />
                </RadioGroup>

                <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Details (optional)"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    sx={{ mt: 2 }}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button
                    variant="contained"
                    onClick={() => onSubmit({ reason, details })}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                    Submit report
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ========================================================================== */
/* Comments utilities + threaded list                                         */
/* ========================================================================== */

/** New: length caps and preview settings */
const COMMENT_MAX_CHARS = 15000;
const COMMENT_PREVIEW_CHARS = 200;

function normalizeComments(raw) {
    const src = Array.isArray(raw) ? raw : raw?.comments || raw?.data || [];
    const items = src.map((c, idx) => ({
        id: c.id ?? c.comment_id ?? c._id ?? `c_${idx}`,
        parentId: c.parent_id ?? c.parentId ?? c.reply_to ?? null,
        user_id: c.user_id ?? c.userId ?? c.user?.id ?? null,
        public_id: c.public_id ?? c.user_public_id ?? c.user?.public_id ?? null,
        text: String(c.text ?? c.content ?? c.body ?? c.comment ?? '').trim(),
        first_name: c.first_name ?? c.author_first_name ?? c.user?.first_name ?? '',
        last_name: c.last_name ?? c.author_last_name ?? c.user?.last_name ?? '',
        handle: c.handle ?? c.user?.handle ?? c.username ?? '',
        avatar: c.avatar_url ?? c.user?.avatar_url ?? c.profile_picture ?? '',
        created_at: c.created_at ?? c.date_created ?? c.posted_at ?? c.time ?? '',
        likes: Number(c.likes ?? c.likes_count ?? c.like_count ?? c.likeCount ?? 0),
        viewer_liked: Boolean(c.viewer_liked ?? c.liked ?? false),
        viewer_flagged: Boolean(c.viewer_flagged ?? false),
        reply_count: Number(c.reply_count ?? 0),
        replies: [],
    }));

    const byId = new Map();
    items.forEach((n) => byId.set(String(n.id), n));
    const roots = [];
    items.forEach((n) => {
        const pid = n.parentId ? String(n.parentId) : null;
        if (pid && byId.has(pid)) {
            byId.get(pid).replies.push(n);
        } else {
            roots.push(n);
        }
    });
    return roots;
}

function ThreadedCommentItem({
                                 node,
                                 depth = 0,
                                 expanded,
                                 setExpanded,
                                 viewerAvatarUrl,
                                 viewerLabel,
                                 postAuthor,
                                 onOpenUserCard,
                                 likeComment,
                                 submitReply,
                                 openFlag,
                                 viewerId,
                                 onDelete,
                             }) {
    const name = `${node.first_name || ''} ${node.last_name || ''}`.trim() || 'User';
    const ts = node.created_at ? timeAgo(node.created_at) : '';
    const hasReplies = Array.isArray(node.replies) && node.replies.length > 0;
    const open = !!expanded[node.id];

    const [showFull, setShowFull] = useState(false);

    const nameNorm = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const authorId = postAuthor?.id != null ? String(postAuthor.id) : null;
    const authorHandle = (postAuthor?.handle || '').toLowerCase();
    const authorPublicId = postAuthor?.public_id != null ? String(postAuthor.public_id) : null;
    const authorNameNorm = (postAuthor?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const nodeId = node.user_id != null ? String(node.user_id) : null;
    const nodeHandle = (node.handle || '').toLowerCase();
    const nodePub = node.public_id != null ? String(node.public_id) : null;
    const canDelete = viewerId != null && (String(viewerId) === nodeId || (authorId && String(viewerId) === authorId));
    const deleteLabel = depth > 0 ? 'Delete Reply' : 'Delete Comment';

    const isAuthor =
        (authorId && nodeId && nodeId === authorId) ||
        (authorHandle && nodeHandle && nodeHandle === authorHandle) ||
        (authorPublicId && nodePub && nodePub === authorPublicId) ||
        (!!authorNameNorm && !!nameNorm && authorNameNorm === nameNorm);

    const [liked, setLiked] = useState(Boolean(node.viewer_liked));
    const [likes, setLikes] = useState(Number(node.likes || 0));
    const [flagged, setFlagged] = useState(Boolean(node.viewer_flagged));

    useEffect(() => {
        setLiked(Boolean(node.viewer_liked));
        setLikes(Number(node.likes || 0));
        setFlagged(Boolean(node.viewer_flagged));
    }, [node.viewer_liked, node.viewer_flagged, node.likes]);

    const toggleReplies = () => setExpanded((s) => ({ ...s, [node.id]: !s[node.id] }));

    const [replyOpen, setReplyOpen] = useState(false);
    const [replyText, setReplyText] = useState('');

    const sendReply = () => {
        const txt = replyText.trim();
        if (!txt) return;
        submitReply(node.id, txt, () => {
            setReplyText('');
            setReplyOpen(false);
            setExpanded((s) => ({ ...s, [node.id]: true }));
        });
    };

    const onReplyKeyDown = (e) => {
        // Enter = new line. Ctrl/Cmd + Enter = submit.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendReply();
        }
    };

    const openCard = (e) => {
        onOpenUserCard?.(e.currentTarget, {
            id: node.user_id,
            first_name: node.first_name,
            last_name: node.last_name,
            handle: node.handle,
            avatar_url: node.avatar,
        });
    };

    const hasNodeAvatar = !!node.avatar;

    const needsTruncate = !!node.text && node.text.length > COMMENT_PREVIEW_CHARS;
    const displayText =
        !node.text
            ? ''
            : showFull || !needsTruncate
                ? node.text
                : `${node.text.slice(0, COMMENT_PREVIEW_CHARS)}...`;

    const REPLY_BATCH = 25;
    const [visibleReplies, setVisibleReplies] = useState(REPLY_BATCH);
    useEffect(() => {
        if (open) setVisibleReplies(REPLY_BATCH);
    }, [open]);

    const repliesToShow = hasReplies ? node.replies.slice(0, visibleReplies) : [];

    return (
        <Box
            sx={{
                pl: depth ? 2 : 0,
                borderLeft: depth ? '2px solid rgba(0,0,0,0.08)' : 'none',
                ml: depth ? 1 : 0,
            }}
        >
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1.25 }}>
                <Avatar
                    src={hasNodeAvatar ? node.avatar : undefined}
                    sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: 'divider',
                    }}
                    onClick={openCard}
                >
                    {!hasNodeAvatar ? <PersonIcon fontSize="small" /> : null}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 700, cursor: 'pointer' }}
                                onClick={openCard}
                                noWrap
                            >
                                {name}
                            </Typography>

                            {isAuthor ? (
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%' }} />
                                    <Typography variant="caption" color="text.secondary">
                                        Author
                                    </Typography>
                                </Box>
                            ) : null}

                            {ts ? (
                                <>
                                    <Box sx={{ width: 4, height: 4, borderRadius: '50%' }} />
                                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                        {ts}
                                    </Typography>
                                </>
                            ) : null}
                        </Box>
                        {canDelete ? (
                            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
                                <Tooltip title={deleteLabel} placement="top">
                                    <IconButton
                                        size="small"
                                        onClick={() => onDelete?.(node.id, !!depth)}
                                        sx={{
                                            ml: 0.5,
                                            border: '1px solid rgba(2,6,23,0.10)',
                                            background: '#fff',
                                        }}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        ) : null}
                    </Box>

                    {node.handle ? (
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 0.25, cursor: 'pointer' }}
                            onClick={openCard}
                            noWrap
                        >
                            @{node.handle}
                        </Typography>
                    ) : null}

                    {node.text ? (
                        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {displayText}
                            {needsTruncate && !showFull ? (
                                <>
                                    {' '}
                                    <Link
                                        component="button"
                                        type="button"
                                        underline="hover"
                                        onClick={() => setShowFull(true)}
                                        sx={{ fontSize: 14 }}
                                    >
                                        more
                                    </Link>
                                </>
                            ) : null}
                            {needsTruncate && showFull ? (
                                <>
                                    {' '}
                                    <Link
                                        component="button"
                                        type="button"
                                        underline="hover"
                                        onClick={() => setShowFull(false)}
                                        sx={{ fontSize: 14 }}
                                    >
                                        less
                                    </Link>
                                </>
                            ) : null}
                        </Typography>
                    ) : null}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Button
                            variant="text"
                            size="small"
                            onClick={() => likeComment(node.id, liked, setLiked, setLikes)}
                            sx={{ textTransform: 'none', minWidth: 0 }}
                        >
                            {likes > 0 ? `Like · ${likes}` : 'Like'}
                        </Button>

                        <Button
                            variant="text"
                            size="small"
                            onClick={() => setReplyOpen((v) => !v)}
                            sx={{ textTransform: 'none', minWidth: 0 }}
                            aria-expanded={replyOpen ? 'true' : 'false'}
                        >
                            Reply
                        </Button>

                        <Button
                            variant="text"
                            size="small"
                            startIcon={<FlagRoundedIcon />}
                            onClick={() => {
                                if (flagged) return;
                                openFlag(node.id);
                            }}
                            disabled={flagged}
                            sx={{ textTransform: 'none', minWidth: 0, color: flagged ? 'success.main' : 'inherit' }}
                        >
                            {flagged ? 'Reported' : 'Report'}
                        </Button>
                    </Box>

                    {replyOpen ? (
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
                            <Avatar
                                src={viewerAvatarUrl ? viewerAvatarUrl : undefined}
                                alt={viewerLabel}
                                sx={{
                                    width: 32,
                                    height: 32,
                                    mt: 0.25,
                                    flexShrink: 0,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: 'grey.600'
                                }}
                            >
                                {!viewerAvatarUrl ? <PersonIcon fontSize="small" /> : null}
                            </Avatar>

                            <TextField
                                fullWidth
                                multiline
                                minRows={2}
                                maxRows={6}
                                placeholder="Write a reply…"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={onReplyKeyDown}
                                inputProps={{ maxLength: COMMENT_MAX_CHARS }}
                                sx={{
                                    '& .MuiOutlinedInput-root': { borderRadius: 2, alignItems: 'flex-end' },
                                }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.25 }}>
                                            <IconButton
                                                aria-label="Send reply"
                                                onClick={sendReply}
                                                disabled={!replyText.trim()}
                                                sx={{
                                                    ml: 0.5,
                                                    bgcolor: 'primary.main',
                                                    color: '#fff',
                                                    width: 34,
                                                    height: 34,
                                                    flexShrink: 0,
                                                    '&:hover': { bgcolor: 'primary.dark' },
                                                    '&.Mui-disabled': {
                                                        bgcolor: 'action.disabledBackground',
                                                        color: 'action.disabled',
                                                        opacity: 1,
                                                    },
                                                }}
                                            >
                                                <ArrowForwardRoundedIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Box>
                    ) : null}

                    {node.reply_count > 0 && !hasReplies ? (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {node.reply_count} repl{node.reply_count === 1 ? 'y' : 'ies'}
                        </Typography>
                    ) : null}

                    {hasReplies ? (
                        <Link
                            component="button"
                            type="button"
                            underline="hover"
                            onClick={toggleReplies}
                            aria-expanded={open ? 'true' : 'false'}
                            aria-label={open ? 'Hide replies' : `Show replies (${node.replies.length})`}
                            sx={{
                                mt: 0.5,
                                p: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                fontSize: 14,
                                fontWeight: 600,
                                color: 'primary.main',
                                textAlign: 'left',
                                '&:focus-visible': (theme) => ({
                                    outline: `2px solid ${theme.palette.primary.main}`,
                                    outlineOffset: 2,
                                    borderRadius: 0.5,
                                }),
                            }}
                        >
                            {open ? 'Hide replies' : `Show replies (${node.replies.length})`}
                        </Link>
                    ) : null}
                </Box>
            </Box>

            {hasReplies && open ? (
                <>
                    <Box sx={{ mt: 0.5 }}>
                        {repliesToShow.map((r) => (
                            <ThreadedCommentItem
                                key={r.id}
                                node={r}
                                depth={depth + 1}
                                expanded={expanded}
                                setExpanded={setExpanded}
                                viewerAvatarUrl={viewerAvatarUrl}
                                viewerLabel={viewerLabel}
                                postAuthor={postAuthor}
                                onOpenUserCard={onOpenUserCard}
                                likeComment={likeComment}
                                submitReply={submitReply}
                                openFlag={openFlag}
                                viewerId={viewerId}
                                onDelete={onDelete}
                            />
                        ))}
                    </Box>

                    {node.replies.length > repliesToShow.length ? (
                        <Box sx={{ pl: 2, mt: 0.5 }}>
                            <Link
                                component="button"
                                type="button"
                                underline="hover"
                                onClick={() => setVisibleReplies((n) => Math.min(n + REPLY_BATCH, node.replies.length))}
                                sx={{ fontWeight: 600 }}
                            >
                                Load 25 more replies
                            </Link>
                        </Box>
                    ) : null}
                </>
            ) : null}
        </Box>
    );
}

function RedditComments({
                            postId,
                            refreshKey,
                            initialPageSize = 50, // 50 comments at a time
                            viewer,
                            postAuthor,
                            onOpenUserCard,
                        }) {
    const [loading, setLoading] = useState(true);
    const [threads, setThreads] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [visibleCount, setVisibleCount] = useState(initialPageSize);
    const [scrolled, setScrolled] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [commentDeleteConfirm, setCommentDeleteConfirm] = useState({ open: false, commentId: null, isReply: false });

    // "Back to Top" visibility
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 100);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // fetch comments (and replies)
    useEffect(() => {
        let cancelled = false;
        const fetchComments = async () => {
            setLoading(true);
            setVisibleCount(initialPageSize);
            const tryUrls = [
                `/api/community/${encodeURIComponent(postId)}/comments`,
                `/api/community/posts/${encodeURIComponent(postId)}/comments`,
                `/api/comments?postId=${encodeURIComponent(postId)}`,
                `/api/posts/${encodeURIComponent(postId)}/comments`,
            ];

            for (const url of tryUrls) {
                try {
                    const res = await fetch(url, { credentials: 'include' });
                    if (res.ok) {
                        const data = await res.json();
                        if (!cancelled) {
                            setThreads(normalizeComments(data));
                            setLoading(false);
                        }
                        return;
                    }
                } catch {
                    // try next endpoint
                }
            }
            if (!cancelled) {
                setThreads([]);
                setLoading(false);
            }
        };
        fetchComments();
        return () => {
            cancelled = true;
        };
    }, [postId, refreshKey, initialPageSize, refreshTick]);

    const toggle = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

    const requestCommentDelete = useCallback((commentId, isReply = false) => {
        const cid = Number(commentId);
        if (!Number.isFinite(cid) || cid <= 0) return;
        setCommentDeleteConfirm({ open: true, commentId: cid, isReply: !!isReply });
    }, []);

    const closeCommentDeleteConfirm = useCallback(() => {
        setCommentDeleteConfirm({ open: false, commentId: null, isReply: false });
    }, []);

    const confirmCommentDelete = useCallback(async () => {
        if (!commentDeleteConfirm.commentId) return;
        await deleteComment(commentDeleteConfirm.commentId);
        closeCommentDeleteConfirm();
    }, [commentDeleteConfirm.commentId, deleteComment, closeCommentDeleteConfirm]);

    const openLogin = () => {
        try {
            window.dispatchEvent(new CustomEvent('open-login'));
            window.dispatchEvent(new CustomEvent('open-auth-dialog'));
            window.dispatchEvent(new CustomEvent('open-login-popup'));
        } catch {}
    };

    const viewerAvatarUrl = viewer?.avatar_url || viewer?.profile_picture || '';
    const viewerLabel = `${viewer?.first_name || ''} ${viewer?.last_name || ''}`.trim() || 'You';

    // like/flag/reply helpers
    const likeComment = async (commentId, currentLiked, setLiked, setLikes) => {
        if (!viewer) return openLogin();
        const paths = [
            `/api/community/comments/${encodeURIComponent(commentId)}/like`,
            `/api/comments/${encodeURIComponent(commentId)}/like`,
        ];
        for (const url of paths) {
            try {
                const res = await fetch(url, { method: 'POST', credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setLiked(Boolean(data.liked));
                    setLikes(Number(data.likes || 0));
                    return;
                }
            } catch {
                /* try next */
            }
        }
        // optimistic fallback
        setLiked(!currentLiked);
        setLikes((n) => Math.max(0, n + (currentLiked ? -1 : 1)));
    };

    const submitReply = async (parentId, text, onDone) => {
        if (!viewer) return openLogin();
        const cleaned = text.trim().slice(0, COMMENT_MAX_CHARS);
        if (!cleaned) return;
        const payload = {
            text: cleaned,
            content: cleaned,
            parent_id: parentId,
        };
        const urls = [
            `/api/community/${encodeURIComponent(postId)}/comments`,
            `/api/posts/${encodeURIComponent(postId)}/comments`,
        ];
        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    onDone?.();
                    setRefreshTick((k) => k + 1);
                    return;
                }
            } catch {
                /* try next */
            }
        }
    };

    const [flagState, setFlagState] = useState({ open: false, commentId: null });


    async function deleteComment(commentId) {
        if (!viewer) return openLogin();
        const cid = Number(commentId);
        if (!cid) return;

        const tryUrls = [
            `/api/community/comments/${encodeURIComponent(cid)}`,
            `/api/comments/${encodeURIComponent(cid)}`,
        ];

        for (const url of tryUrls) {
            try {
                const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
                if (res.ok) {
                    setRefreshTick((k) => k + 1);
                    return;
                }
            } catch {
                /* try next */
            }
        }
    }

    const openFlag = (commentId) => {
        if (!viewer) return openLogin();
        setFlagState({ open: true, commentId });
    };
    const closeFlag = () => setFlagState({ open: false, commentId: null });

    const submitFlag = async ({ reason, details }) => {
        const commentId = flagState.commentId;
        if (!commentId) return closeFlag();

        const urls = [
            `/api/community/comments/${encodeURIComponent(commentId)}/flag`,
            `/api/comments/${encodeURIComponent(commentId)}/flag`,
        ];
        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason, details }),
                });
                if (res.ok) {
                    // refresh so viewer_flagged shows
                    setRefreshTick((k) => k + 1);
                    break;
                }
            } catch {
                /* try next */
            }
        }
        closeFlag();
    };


    const visibleThreads = threads.slice(0, visibleCount);
    const canLoadMore = threads.length > visibleThreads.length;

    // Only widen when reply nesting gets "too deep" so a horizontal scrollbar appears
    const INDENT_PX = 24;
    const SAFE_DEPTH_BEFORE_SCROLL = 6; // vertical until depth exceeds this
    const computeMaxOpenDepth = (nodes, depth = 0) => {
        let max = depth;
        for (const n of nodes) {
            const dHere = expanded[n.id] && n.replies?.length ? computeMaxOpenDepth(n.replies, depth + 1) : depth;
            if (dHere > max) max = dHere;
        }
        return max;
    };
    const maxOpenDepth = computeMaxOpenDepth(visibleThreads, 0);
    const extraWidthPx = Math.max(0, (maxOpenDepth - SAFE_DEPTH_BEFORE_SCROLL) * INDENT_PX);

    return (
        <Box id="comments-anchor" sx={{ mt: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
                Comments
            </Typography>

            {/* Vertical list by default; only shows horizontal scrollbar when extra width is actually needed */}
            <Box sx={{ overflowX: 'auto', overflowY: 'hidden', pb: 1 }}>
                <Box sx={{ minWidth: extraWidthPx ? `calc(100% + ${extraWidthPx}px)` : '100%' }}>
                    {loading ? (
                        <Typography color="text.secondary">Loading comments…</Typography>
                    ) : visibleThreads.length ? (
                        <>
                            {visibleThreads.map((t) => (
                                <ThreadedCommentItem
                                    key={t.id}
                                    node={t}
                                    depth={0}
                                    expanded={expanded}
                                    setExpanded={setExpanded}
                                    viewerAvatarUrl={viewerAvatarUrl}
                                    viewerLabel={viewerLabel}
                                    postAuthor={postAuthor}
                                    onOpenUserCard={onOpenUserCard}
                                    likeComment={likeComment}
                                    submitReply={submitReply}
                                    openFlag={openFlag}
                                    viewerId={viewer?.id}
                                    onDelete={requestCommentDelete}
                                />
                            ))}
                            {canLoadMore && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                                    <Link
                                        component="button"
                                        type="button"
                                        underline="hover"
                                        onClick={() =>
                                            setVisibleCount((c) =>
                                                Math.min(c + initialPageSize, threads.length)
                                            )
                                        }
                                        sx={{ fontWeight: 700 }}
                                    >
                                        Load 50 more comments
                                    </Link>
                                </Box>
                            )}
                            {scrolled && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                                    <Button
                                        variant="contained"
                                        startIcon={<ArrowUpwardRoundedIcon sx={{ color: '#fff' }} />}
                                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                        sx={{ textTransform: 'none', fontWeight: 600 }}
                                    >
                                        Back to Top
                                    </Button>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Typography color="text.secondary">No comments yet.</Typography>
                    )}
                </Box>
            </Box>

            <Dialog
                open={!!commentDeleteConfirm.open}
                onClose={(e, reason) => {
                    if (reason === 'backdropClick') return;
                    closeCommentDeleteConfirm();
                }}
                disableEscapeKeyDown
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle sx={{ pr: 6 }}>
                    Confirm delete
                    <IconButton
                        aria-label="Close"
                        onClick={closeCommentDeleteConfirm}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography>
                        {commentDeleteConfirm.isReply
                            ? 'Delete this reply? This cannot be undone.'
                            : 'Delete this comment and all of its replies? This cannot be undone.'}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeCommentDeleteConfirm} variant="outlined">Cancel</Button>
                    <Button onClick={confirmCommentDelete} variant="contained" color="error">Delete</Button>
                </DialogActions>
            </Dialog>

            {/* Report/Flag dialog (global for this list) */}
            <FlagCommentDialog open={flagState.open} onClose={closeFlag} onSubmit={submitFlag} />
        </Box>
    );
}

/* ========================================================================== */
/* Main PostPage                                                              */
/* ========================================================================== */
export default function PostPage({ embedded = false, post: initialPost = null, user: initialUser = null }) {
    const { id: routeId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const statePost = location?.state?.post || null;

    // ---- All hooks are declared BEFORE any early returns ----
    const [post, setPost] = useState(initialPost || statePost);
    const [loading, setLoading] = useState(!initialPost && !statePost);
    const [viewer, setViewer] = useState(initialUser);
    const [shareOpen, setShareOpen] = useState(false);

    // Shared user card popover state (author + commenters)
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [serverFollowingSet, setServerFollowingSet] = useState(() => new Set());
    const [locallyFollowed, setLocallyFollowed] = useState(() => new Set());

    // comment composer + refresh hook for comment list
    const [commentText, setCommentText] = useState('');
    const [posting, setPosting] = useState(false);
    const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
    const forceRefreshComments = () => setCommentsRefreshKey((k) => k + 1);

    // Description clamp (prevents a single long token from breaking layout)
    const [showFullDescription, setShowFullDescription] = useState(false);
    useEffect(() => {
        setShowFullDescription(false);
    }, [post?.id]);

    // Sync with prop when embedded so selecting another card updates the detail pane
    // Also merges when the same post is updated (e.g., edited photos) so the detail view stays current.
    useEffect(() => {
        if (!embedded || !initialPost) return;

        setPost((prev) => {
            if (!prev) return initialPost;

            const prevId = prev?.id != null ? String(prev.id) : '';
            const nextId = initialPost?.id != null ? String(initialPost.id) : '';

            if (prevId && nextId && prevId !== nextId) return initialPost;

            if (prev === initialPost) return prev;

            return { ...prev, ...initialPost };
        });

        setLoading(false);
    }, [embedded, initialPost]);

    // recognize viewer (includes social_json we use for following)
    useEffect(() => {
        let alive = true;
        if (!viewer) {
            fetch('/users/profile', { credentials: 'include' })
                .then((r) => (r.ok ? r.json() : null))
                .then((resp) => {
                    if (!alive) return;
                    const u = resp?.user || resp || null;
                    setViewer(u);
                })
                .catch(() => {
                    if (alive) setViewer(null);
                });
        }
        return () => {
            alive = false;
        };
    }, [viewer]);

    // fetch post by id if not provided
    useEffect(() => {
        let cancelled = false;
        const id = post?.id || routeId;
        if (!id || post) return;

        (async () => {
            setLoading(true);
            try {
                let res = await fetch(`/api/community/${encodeURIComponent(id)}`, { credentials: 'include' });
                if (!res.ok) {
                    const res2 = await fetch(`/api/community/posts/${encodeURIComponent(id)}`, { credentials: 'include' });
                    if (res2.ok) res = res2;
                }
                const data = await res.json();
                if (!cancelled) setPost(Array.isArray(data) ? data[0] : data);
            } catch {
                if (!cancelled) setPost(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [routeId, post]);

    const backToList = useCallback(() => {
        try {
            const url = sessionStorage.getItem('ll:community:url');
            if (url) {
                navigate(url);
                return;
            }
        } catch {}
        navigate(-1);
    }, [navigate]);

    const photos = useMemo(
        () => extractPhotos(post || {}),
        [
            post,
            post?.photos,
            post?.photos_json,
            post?.photo_url,
            post?.image_url,
            post?.main_photo_url,
            post?.cover_url,
            post?.community_photos,
        ]
    );
    const badgeMeta = useMemo(() => buildBadgeFor(post || {}), [post]);
    const derivedCategory = useMemo(() => deriveSplitCategory(post || {}), [post]);

    const isUrgent = Boolean(Number(post?.is_urgent ?? post?.isUrgent ?? post?.urgent ?? 0));
    const displayCategoryLabel = badgeMeta?.label || post?.category_name || post?.category || '';

    const showHelpVolunteerPanel = useMemo(() => {
        const dc = String(derivedCategory || '').trim().toLowerCase();
        return dc === 'help-requests' || dc === 'volunteers' || dc === 'volunteer-requests';
    }, [derivedCategory]);

    // counts & viewer flags for ActionBar
    const likes = Number(post?.likesCount ?? post?.likes_count ?? post?.like_count ?? post?.likes ?? 0);
    const viewerLiked = Boolean(post?.viewerLiked ?? post?.viewer_liked ?? post?.liked ?? post?.is_liked ?? false);
    const commentsCount = Number(
        post?.commentsCount ?? post?.comments_count ?? post?.comment_count ?? post?.comments ?? 0
    );
    const reposts = Number(post?.repostsCount ?? post?.reposts_count ?? post?.repost_count ?? post?.reposts ?? 0);
    const viewerReposted = Boolean(
        post?.viewerReposted ?? post?.viewer_reposted ?? post?.reposted ?? post?.is_reposted ?? false
    );

    const viewerUser = viewer?.user || viewer || null;
    const fullName = `${viewerUser?.first_name || ''} ${viewerUser?.last_name || ''}`.trim();
    const avatarUrl = viewerUser?.avatar_url || viewerUser?.profile_picture || '';

    const postId = post?.id;
    const postAuthorId =
        post?.user_id ?? post?.author_id ?? post?.user?.id ?? post?.uid ?? post?.owner_id ?? null;

    // package author info for robust matching
    const postAuthor = useMemo(() => {
        const name = `${post?.first_name || ''} ${post?.last_name || ''}`.trim();
        return {
            id: postAuthorId != null ? String(postAuthorId) : null,
            handle: post?.handle || null,
            public_id: post?.public_id != null ? String(post.public_id) : null,
            name,
        };
    }, [post, postAuthorId]);


    const isOwner = useMemo(() => {
        const vid = viewerUser?.id;
        const aid = postAuthorId;

        if (vid != null && aid != null && Number(vid) === Number(aid)) return true;

        const vHandle = String(viewerUser?.handle || '').trim().toLowerCase();
        const pHandle = String(post?.handle || '').trim().toLowerCase();
        if (vHandle && pHandle && vHandle === pHandle) return true;

        const vPublic = viewerUser?.public_id != null ? String(viewerUser.public_id) : '';
        const pPublic = post?.public_id != null ? String(post.public_id) : '';
        if (vPublic && pPublic && vPublic === pPublic) return true;

        return false;
    }, [viewerUser?.id, viewerUser?.handle, viewerUser?.public_id, postAuthorId, post?.handle, post?.public_id]);


    // Owner actions menu (Edit/Delete)
    const [ownerMenuEl, setOwnerMenuEl] = useState(null);
    const ownerMenuOpen = Boolean(ownerMenuEl);
    const openOwnerMenu = useCallback((e) => {
        if (e) e.stopPropagation();
        setOwnerMenuEl(e.currentTarget);
    }, []);
    const closeOwnerMenu = useCallback((e) => {
        if (e) e.stopPropagation();
        setOwnerMenuEl(null);
    }, []);

    const isEdited = Boolean(post?.edited_at || post?.editedAt);
    const isResolved = Boolean(post?.resolved_at || post?.resolvedAt || post?.resolved_message || post?.resolvedMessage);

    const DETAIL_DESC_PREVIEW_CHARS = 650;
    const fullDescRaw = post?.description != null ? String(post.description) : '';
    const fullDescTrimmed = fullDescRaw.trim();
    const descNeedsTruncate = fullDescTrimmed.length > DETAIL_DESC_PREVIEW_CHARS;
    const descDisplay = (!descNeedsTruncate || showFullDescription)
        ? fullDescRaw
        : `${fullDescTrimmed.slice(0, DETAIL_DESC_PREVIEW_CHARS).trimEnd()}...`;
    const resolvedMessage = post?.resolved_message || post?.resolvedMessage || '';
    const canMarkFound = isOwner && String(post?.lost_or_found || '').toLowerCase() === 'lost' && !isResolved;

    const fire = useCallback((eventName, detail) => {
        try {
            window.dispatchEvent(new CustomEvent(eventName, { detail }));
        } catch {
            // ignore
        }
    }, []);

    const requestEdit = useCallback((e) => {
        if (e) e.stopPropagation();
        if (!postId || !post) return;
        fire('ll:communityPost:requestEdit', { postId, post });
    }, [fire, postId, post]);

    const requestDelete = useCallback((e) => {
        if (e) e.stopPropagation();
        if (!postId || !post) return;
        fire('ll:communityPost:requestDelete', { postId, post });
    }, [fire, postId, post]);

    const requestMarkFound = useCallback((e) => {
        if (e) e.stopPropagation();
        if (!postId || !post) return;
        fire('ll:communityPost:requestMarkFound', { postId, post });
    }, [fire, postId, post]);

    const openEditedHistory = useCallback((e) => {
        if (e) e.stopPropagation();
        if (!postId || !post) return;
        fire('ll:communityPost:requestHistory', { postId, post });
    }, [fire, postId, post]);

    const activePostId = routeId || postId;

    useEffect(() => {
        if (!activePostId) return;

        let alive = true;

        let fetchTimer = null;

        const coercePostFromEvent = (e) => {
            const d = e?.detail;
            if (!d) return null;
            if (d?.post && typeof d.post === 'object') return d.post;
            if (typeof d === 'object' && d?.id != null) return d;
            return null;
        };

        const fetchLatest = async (pid) => {
            try {
                let res = await fetch(`/api/community/${encodeURIComponent(pid)}`, { credentials: 'include' });
                if (!res.ok) {
                    const res2 = await fetch(`/api/community/posts/${encodeURIComponent(pid)}`, { credentials: 'include' });
                    if (res2.ok) res = res2;
                }
                const data = await res.json().catch(() => null);
                if (!alive) return;
                const normalized = Array.isArray(data) ? data[0] : data;
                if (normalized && typeof normalized === 'object') {
                    setPost((prev) => ({ ...(prev || {}), ...normalized }));
                }
            } catch {
                // ignore
            }
        };

        const onUpdatedLike = (e) => {
            const next = coercePostFromEvent(e);
            const pid = next?.id ?? e?.detail?.postId ?? e?.detail?.id ?? null;
            if (pid == null) return;
            if (String(pid) !== String(activePostId)) return;

            if (next && typeof next === 'object') {
                setPost((prev) => ({ ...(prev || {}), ...next }));
            }

            // Ensure the detail view reflects edits that may not include full photo payloads in the event.
            // We debounce the refetch so rapid updates (likes, etc.) don't spam the server.
            const detail = e?.detail || {};
            const hasPhotoPayload =
                next &&
                (Object.prototype.hasOwnProperty.call(next, 'photos') ||
                    Object.prototype.hasOwnProperty.call(next, 'community_photos') ||
                    Object.prototype.hasOwnProperty.call(next, 'photos_json') ||
                    Object.prototype.hasOwnProperty.call(next, 'photo_url') ||
                    Object.prototype.hasOwnProperty.call(next, 'image_url') ||
                    Object.prototype.hasOwnProperty.call(next, 'main_photo_url') ||
                    Object.prototype.hasOwnProperty.call(next, 'cover_url'));

            const seemsEdit = Boolean(next?.edited_at || next?.editedAt);
            const forceRefresh = Boolean(detail?.forceRefresh || detail?.refresh || detail?.refetch);

            if (forceRefresh || seemsEdit || !hasPhotoPayload) {
                if (fetchTimer) window.clearTimeout(fetchTimer);
                fetchTimer = window.setTimeout(() => {
                    fetchLatest(pid);
                }, 250);
            }
        };

        const onDeleted = (e) => {
            const pid = e?.detail?.postId ?? e?.detail?.id ?? e?.detail?.post?.id ?? null;
            if (pid == null) return;
            if (String(pid) !== String(activePostId)) return;
            setPost(null);
        };

        window.addEventListener('ll:communityPost:updated', onUpdatedLike);
        window.addEventListener('ll:communityPost:markedFound', onUpdatedLike);
        window.addEventListener('ll:communityPost:deleted', onDeleted);

        return () => {
            alive = false;
            if (fetchTimer) window.clearTimeout(fetchTimer);
            window.removeEventListener('ll:communityPost:updated', onUpdatedLike);
            window.removeEventListener('ll:communityPost:markedFound', onUpdatedLike);
            window.removeEventListener('ll:communityPost:deleted', onDeleted);
        };
    }, [activePostId]);


    const openLoginPopup = useCallback(
        (e) => {
            if (e) e.preventDefault();
            try {
                window.dispatchEvent(new CustomEvent('open-login'));
                window.dispatchEvent(new CustomEvent('open-auth-dialog'));
                window.dispatchEvent(new CustomEvent('open-login-popup'));
            } catch {}
            try {
                navigate('/login');
            } catch {}
        },
        [navigate]
    );

    async function submitComment() {
        if (!postId) return;
        const cleaned = commentText.trim().slice(0, COMMENT_MAX_CHARS);
        if (!cleaned) return;
        setPosting(true);
        const payload = {
            text: cleaned,
            content: cleaned,
            body: cleaned,
            comment: cleaned,
        };
        const tryPosts = [
            { url: `/api/community/${encodeURIComponent(postId)}/comments`, method: 'POST' },
            { url: `/api/community/posts/${encodeURIComponent(postId)}/comments`, method: 'POST' },
            { url: `/api/posts/${encodeURIComponent(postId)}/comments`, method: 'POST' },
            { url: `/api/comments?postId=${encodeURIComponent(postId)}`, method: 'POST' },
        ];
        let ok = false;
        for (const t of tryPosts) {
            try {
                const res = await fetch(t.url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    ok = true;
                    break;
                }
            } catch {
                /* try next */
            }
        }
        setPosting(false);
        if (ok) {
            setCommentText('');
            setPost((p) => (p ? { ...p, commentsCount: Number(p.commentsCount || 0) + 1 } : p));
            try {
                const nextCount = (() => {
                    try {
                        const current = Number(post?.commentsCount ?? post?.comments_count ?? post?.comment_count ?? post?.comments ?? 0);
                        return Number.isFinite(current) ? current + 1 : 1;
                    } catch {
                        return 1;
                    }
                })();

                window.dispatchEvent(
                    new CustomEvent('ll:communityPost:updated', {
                        detail: {
                            postId: postId,
                            post: {
                                id: postId,
                                commentsCount: nextCount,
                                comments_count: nextCount,
                                comment_count: nextCount,
                            },
                        },
                    })
                );
            } catch {
                // ignore
            }
            forceRefreshComments();
            const anchor = document.getElementById('comments-anchor');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // if unauthenticated, prompt login
            openLoginPopup();
        }
    }

    const onComposerKeyDown = (e) => {
        // Enter = new line. Ctrl/Cmd + Enter = submit.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitComment();
        }
    };

    /* ---------- Shared user card logic (matches CommunityList) ---------- */
    const openAuthUI = useCallback(() => {
        openLoginPopup();
    }, [openLoginPopup]);

    const requireAuth = useCallback(
        (cb) => {
            if (viewerUser) return cb?.();
            openAuthUI();
            return undefined;
        },
        [viewerUser, openAuthUI]
    );

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
                    const res = await fetch(u, { credentials: 'include' });
                    if (!res.ok) continue;
                    const data = await res.json();
                    const profile = data?.profile || data?.user || data;
                    if (!profile) continue;

                    // Ensure we have the numeric id
                    setUserForCard((prev) => {
                        if (!prev) return prev;
                        if (!prev.id && profile.id) return { ...prev, id: profile.id };
                        return prev;
                    });

                    // Am *I* in the target's followers?
                    const sjRaw = profile.social_json;
                    let sj = {};
                    if (typeof sjRaw === 'string') {
                        try {
                            sj = JSON.parse(sjRaw || '{}');
                        } catch {
                            sj = {};
                        }
                    } else if (sjRaw && typeof sjRaw === 'object') {
                        sj = sjRaw;
                    }
                    const followers = Array.isArray(sj?.followers) ? sj.followers : [];
                    const isF = !!viewerUser?.id && followers.includes(Number(viewerUser.id));
                    if (profile.id && isF) {
                        setServerFollowingSet((old) => {
                            const next = new Set(old);
                            next.add(Number(profile.id));
                            return next;
                        });
                    }
                    return profile;
                } catch {
                    /* try next */
                }
            }
            return null;
        },
        [viewerUser?.id]
    );

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

    const handleViewProfile = (u) => window.location.assign(`/${u.handle || u.id}`);
    const postFollow = async (targetId) => {
        const payload = { target_id: targetId, action: 'follow' };
        const urls = [`${api}/users/follow`, '/api/users/follow', '/users/follow'].filter(Boolean);
        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) return true;
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

        // Don't allow following yourself
        const selfId = Number(viewerUser?.id);
        if (selfId && tid0 && selfId === tid0) return;

        requireAuth(async () => {
            // Ensure numeric id via hydration if needed
            let tid = tid0;
            if (!tid && handle0) {
                const p = await hydrateTargetFromPublic({ handle: handle0 });
                if (p?.id) tid = Number(p.id);
            }
            if (!tid) return;

            // Optimistic UI flip
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
                // rollback optimistic
                setLocallyFollowed((prev) => {
                    const next = new Set(prev);
                    next.delete(tid);
                    return next;
                });
            }
        });
    };

    const isSelfForCard = useMemo(() => {
        if (!viewerUser || !userForCard) return false;
        const idMatch =
            viewerUser.id != null && userForCard.id != null && Number(viewerUser.id) === Number(userForCard.id);
        const handleMatch =
            viewerUser.handle &&
            userForCard.handle &&
            String(viewerUser.handle).toLowerCase() === String(userForCard.handle).toLowerCase();
        return idMatch || handleMatch;
    }, [viewerUser, userForCard]);

    const isFollowingForCard = useMemo(() => {
        const tid = Number(userForCard?.id);
        if (!tid) return false;
        return serverFollowingSet.has(tid) || locallyFollowed.has(tid);
    }, [userForCard, serverFollowingSet, locallyFollowed]);

    /* panel width */
    const outerSx = embedded
        ? { width: '100%', maxWidth: 'none', mx: 0, px: 0, py: 0 }
        : { maxWidth: 900, mx: 'auto', px: { xs: 1.25, sm: 2 }, py: { xs: 1.5, sm: 3 } };

    if (loading) {
        return (
            <Box sx={{ ...outerSx, py: 4, px: embedded ? 0 : 2 }}>
                <Typography color="text.secondary">Loading post…</Typography>
            </Box>
        );
    }
    if (!post) {
        return (
            <Box sx={{ ...outerSx, py: 4, px: embedded ? 0 : 2 }}>
                <Typography color="text.secondary">Post not found.</Typography>
                {!embedded && (
                    <Button onClick={backToList} sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
                        Return to Community Posts
                    </Button>
                )}
            </Box>
        );
    }

    const countyLabel = post.county
        ? String(post.county).toLowerCase().includes('county')
            ? post.county
            : `${post.county} County`
        : '';
    const locationStr = [post.city, countyLabel].filter(Boolean).join(', ');
    const postDate = post.date_created || post.posted_at;

    const authorUser = {
        id: postAuthorId,
        first_name: post.first_name,
        last_name: post.last_name,
        handle: post.handle,
        avatar_url: post.avatar_url || post.profile_picture,
        public_id: post.public_id,
    };

    const openTopCard = (e) => {
        handleOpenUserCard(e.currentTarget, authorUser);
    };

    const authorAvatar = post.avatar_url || post.profile_picture || '';


    const mainContent = (
        <>

            {!embedded && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Button
                        onClick={backToList}
                        startIcon={<ArrowBackIcon />}
                        sx={{ px: 0, minWidth: 0, fontWeight: 600, textTransform: 'none' }}
                    >
                        Return to Community Posts
                    </Button>
                </Box>
            )}

            {/* Header (author) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar
                    src={authorAvatar || undefined}
                    alt={post ? `${post.first_name || ''} ${post.last_name || ''}`.trim() : ''}
                    sx={{ bgcolor: 'grey.600', width: 36, height: 36, flexShrink: 0, cursor: 'pointer', ...DEFAULT_AVATAR_SX }}
                    onClick={openTopCard}
                >
                    {!authorAvatar ? <PersonIcon /> : null}
                </Avatar>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                    {/* Top row: Name · time */}
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" noWrap sx={{ cursor: 'pointer' }} onClick={openTopCard}>
                            {post.first_name} {post.last_name}
                        </Typography>
                    </Box>

                    {/* Second row: @handle (only) */}
                    {post.handle ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                sx={{ cursor: 'pointer' }}
                                onClick={openTopCard}
                            >
                                @{post.handle}
                            </Typography>
                            {isEdited ? (
                                <Link
                                    component="button"
                                    type="button"
                                    underline="hover"
                                    onClick={openEditedHistory}
                                    sx={{ fontSize: 12, color: 'primary.main', fontWeight: 900, p: 0 }}
                                    title="Click to view edit history"
                                >
                                    (Edited)
                                </Link>
                            ) : null}
                        </Box>
                    ) : null}

                    {postDate ? (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                            {timeAgoCompact(postDate)}
                        </Typography>
                    ) : null}
                </Box>

                <Box sx={{ ml: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {canMarkFound ? (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<CheckCircleOutlineIcon />}
                                onClick={requestMarkFound}
                                sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 999 }}
                            >
                                <span className="ll-owner-action-label">Mark as Found</span>
                            </Button>
                        ) : null}
                        {badgeMeta ? (
                            <Tooltip title={displayCategoryLabel || 'Category'} arrow>
                                <Box sx={{ display: 'inline-flex' }}>
                                    <CategoryChip badge={badgeMeta} active />
                                </Box>
                            </Tooltip>
                        ) : null}

                        {(isUrgent && !showHelpVolunteerPanel) ? (
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
                        {isOwner ? (
                            <>
                                <Tooltip title="Post options" arrow>
                                    <IconButton
                                        size="small"
                                        aria-label="Post options"
                                        onClick={openOwnerMenu}
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            color: 'text.secondary',
                                            bgcolor: 'background.paper',
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
                                            requestEdit(e);
                                        }}
                                    >
                                        <ListItemIcon>
                                            <EditRoundedIcon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText primary="Edit post" />
                                    </MenuItem>

                                    <MenuItem
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            closeOwnerMenu(e);
                                            requestDelete(e);
                                        }}
                                        sx={{ color: 'error.main' }}
                                    >
                                        <ListItemIcon sx={{ color: 'error.main' }}>
                                            <DeleteRoundedIcon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText primary="Delete post" />
                                    </MenuItem>
                                </Menu>
                            </>
                        ) : null}
                    </Box>
                </Box>
            </Box>

            {/* Title + Description */}
            {post.title ? (
                <Typography variant="h5" sx={{ mt: 1.25, wordBreak: 'break-word' }}>
                    {post.title}
                </Typography>
            ) : null}

            {isResolved ? (
                <Box sx={{ mt: 1.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                            icon={<CheckCircleRoundedIcon sx={{ color: '#1b5e20 !important' }} />}
                            label="Marked as Found"
                            size="small"
                            sx={{
                                border: '1px solid rgba(46, 125, 50, 0.35)',
                                bgcolor: 'rgba(46, 125, 50, 0.08)',
                                fontWeight: 900,
                                borderRadius: 999,
                                '& .MuiChip-label': { fontWeight: 900 },
                            }}
                        />
                    </Box>

                    {resolvedMessage ? (
                        <Box
                            sx={{
                                mt: 0.75,
                                px: 1.25,
                                py: 1,
                                borderRadius: '14px',
                                bgcolor: 'rgba(46, 125, 50, 0.08)',
                                border: '1px solid rgba(46, 125, 50, 0.22)',
                            }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.25 }}>
                                Updated
                            </Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, wordBreak: 'break-word' }}
                            >
                                {String(resolvedMessage)}
                            </Typography>
                        </Box>
                    ) : null}
                </Box>
            ) : null}


            <HelpVolunteerDetailsPanel
                post={post}
                derivedCategory={derivedCategory}
                isUrgent={isUrgent}
                viewerUser={viewerUser}
                onRequireLogin={openLoginPopup}
                authorUser={authorUser}
            />

            {post.description ? (
                <Typography
                    variant="body1"
                    sx={{
                        mt: 1,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {descDisplay}
                    {descNeedsTruncate && !showFullDescription ? (
                        <>
                            {' '}
                            <Link
                                component="button"
                                type="button"
                                underline="hover"
                                onClick={() => setShowFullDescription(true)}
                                sx={{ fontSize: 14, fontWeight: 800 }}
                            >
                                more
                            </Link>
                        </>
                    ) : null}
                    {descNeedsTruncate && showFullDescription ? (
                        <>
                            {' '}
                            <Link
                                component="button"
                                type="button"
                                underline="hover"
                                onClick={() => setShowFullDescription(false)}
                                sx={{ fontSize: 14, fontWeight: 800 }}
                            >
                                less
                            </Link>
                        </>
                    ) : null}
                </Typography>
            ) : null}

            {/* Photos */}
            {photos.length > 0 && <Carousel photos={photos} />}

            {/* Location */}
            {(post.city || post.county || post.street_address) && (
                <>
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <LocationOnIcon fontSize="small" color="action" />
                        {post.street_address ? (
                            <>
                                <Typography variant="body2">{post.street_address}</Typography>
                                {locationStr && (
                                    <Typography variant="body2" color="text.secondary" sx={{ ml: 0.25 }}>
                                        {locationStr}
                                    </Typography>
                                )}
                            </>
                        ) : (
                            <Typography variant="body2">{locationStr}</Typography>
                        )}
                    </Box>
                </>
            )}

            {/* ACTION BAR */}
            <Paper
                variant="outlined"
                sx={{
                    mt: 1.25,
                    p: 1,
                    borderRadius: 1.5,
                    bgcolor: '#FFFFFF',
                    borderColor: (t) => alphaColor(t.palette.primary.main, 0.14),
                }}
            >
                <ActionBar
                    user={viewerUser}
                    postId={post.id}
                    initialLikes={likes}
                    initiallyLiked={viewerLiked}
                    commentsCount={commentsCount}
                    initialReposts={reposts}
                    initiallyReposted={viewerReposted}
                    onShare={() => setShareOpen(true)}
                    onComment={() => {
                        const anchor = document.getElementById('comments-composer');
                        if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                />
            </Paper>

            {/* Composer OR login prompt */}
            {viewerUser ? (
                <Box
                    id="comments-composer"
                    sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'nowrap' }}
                >
                    <Avatar
                        src={avatarUrl || undefined}
                        alt={fullName || 'You'}
                        sx={{
                            bgcolor: 'grey.600',
                            width: 36,
                            height: 36,
                            flexShrink: 0,
                            border: '1px solid',
                            borderColor: 'divider',}}
                    >
                        {!avatarUrl ? <PersonIcon /> : null}
                    </Avatar>

                    <TextField
                        fullWidth
                        multiline
                        minRows={1}
                        maxRows={6}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={onComposerKeyDown}
                        label={`Leave a comment as ${fullName || 'Guest'}`}
                        placeholder="Write your comment…"
                        variant="outlined"
                        inputProps={{ maxLength: COMMENT_MAX_CHARS }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.25 }}>
                                    <IconButton
                                        aria-label="Send comment"
                                        onClick={submitComment}
                                        disabled={posting || !commentText.trim()}
                                        sx={(t) => ({
                                            ml: 0.5,
                                            bgcolor: 'primary.main',
                                            color: '#fff',
                                            width: 38,
                                            height: 38,
                                            borderRadius: 2,
                                            boxShadow: `0 10px 18px ${alphaColor(t.palette.primary.main, 0.18)}`,
                                            '&:hover': {
                                                bgcolor: 'primary.dark',
                                                boxShadow: `0 14px 26px ${alphaColor(t.palette.primary.main, 0.22)}`,
                                            },
                                            '&.Mui-disabled': {
                                                bgcolor: 'action.disabledBackground',
                                                color: 'action.disabled',
                                                boxShadow: 'none',
                                                opacity: 1,
                                            },
                                        })}
                                    >
                                        {posting ? (
                                            <CircularProgress size={18} sx={{ color: '#fff' }} />
                                        ) : (
                                            <ArrowForwardRoundedIcon />
                                        )}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                </Box>
            ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    You need to{' '}
                    <Link href="/login" onClick={openLoginPopup} underline="hover">
                        log in
                    </Link>{' '}
                    to comment.
                </Typography>
            )}

            <Divider sx={{ my: 1.5 }} />

            {/* Comments */}
            <RedditComments
                postId={post.id}
                refreshKey={commentsRefreshKey}
                initialPageSize={50} // 50 top-level comments per batch
                viewer={viewerUser}
                postAuthor={postAuthor}
                onOpenUserCard={handleOpenUserCard}
            />
        </>
    );

    return (
        <Box sx={outerSx}>
            {embedded ? (
                <Box
                    sx={(t) => ({
                        width: '100%',
                        minHeight: '100%',
                        bgcolor: '#FFFFFF',
                        px: { xs: 1.25, sm: 1.75 },
                        py: { xs: 1.25, sm: 1.5 },
                    })}
                >
                    {mainContent}
                </Box>
            ) : (
                <Paper
                    variant="outlined"
                    sx={(t) => ({
                        p: { xs: 1.25, sm: 2 },
                        borderRadius: 3,
                        borderColor: alphaColor(t.palette.primary.main, 0.14),
                        backgroundColor: '#FFFFFF',
                        backgroundImage: 'none',
                        boxShadow: embedded ? 'none' : `0 16px 56px ${alphaColor(t.palette.common.black, 0.08)}`,
                    })}
                >
                    {mainContent}
                </Paper>
            )}
        </Box>
    );

}

/* ---------- Local, lightweight carousel ---------- */
function Carousel({ photos }) {
    const [index, setIndex] = useState(0);

    // Reset back to the first photo whenever a different post is selected or photos change.
    useEffect(() => {
        setIndex(0);
    }, [photos]);

    // Clamp index so we never show "3/2" style counters or read out-of-bounds.
    useEffect(() => {
        setIndex((i) => {
            if (!Array.isArray(photos) || photos.length === 0) return 0;
            const max = photos.length - 1;
            return Math.min(Math.max(0, i), max);
        });
    }, [photos.length]);

    const safeIndex = Array.isArray(photos) && photos.length ? Math.min(index, photos.length - 1) : 0;
    const current = Array.isArray(photos) ? photos[safeIndex] : null;

    const prev = () => {
        if (!Array.isArray(photos) || photos.length < 2) return;
        setIndex((i) => (i - 1 + photos.length) % photos.length);
    };

    const next = () => {
        if (!Array.isArray(photos) || photos.length < 2) return;
        setIndex((i) => (i + 1) % photos.length);
    };

    if (!current) return null;

    return (
        <Box sx={{ position: 'relative', mt: 1.25 }}>
            <Box
                sx={{
                    width: '100%',
                    height: { xs: 260, sm: 420 },
                    bgcolor: '#111',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <Box
                    component="img"
                    src={current}
                    alt=""
                    loading="lazy"
                    sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block',
                        userSelect: 'none',
                        backgroundColor: 'transparent',
                    }}
                />
            </Box>

            {photos.length > 1 && (
                <>
                    <IconButton
                        aria-label="Previous image"
                        onClick={prev}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: 8,
                            transform: 'translateY(-50%)',
                            bgcolor: 'rgba(0,0,0,0.45)',
                            color: '#fff',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                        }}
                    >
                        <ChevronLeftIcon />
                    </IconButton>

                    <IconButton
                        aria-label="Next image"
                        onClick={next}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            right: 8,
                            transform: 'translateY(-50%)',
                            bgcolor: 'rgba(0,0,0,0.45)',
                            color: '#fff',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                        }}
                    >
                        <ChevronRightIcon />
                    </IconButton>

                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: 8,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            bgcolor: 'rgba(0,0,0,0.45)',
                            color: '#fff',
                            fontSize: 12,
                        }}
                    >
                        {safeIndex + 1} / {photos.length}
                    </Box>
                </>
            )}
        </Box>
    );
}
