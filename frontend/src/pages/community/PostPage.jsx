// src/pages/community/PostPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams,
    useLocation,
    useNavigate } from 'react-router-dom';
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
    Alert,
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
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import PersonIcon from '@mui/icons-material/Person';
import MoreVertIcon from '@mui/icons-material/MoreVert';

import ActionBar from '../../components/ActionBar';
import SharePostDialog from '../../components/SharePostDialog';
import EditCommunityPostDialog from '../../components/community/EditCommunityPostDialog';
import DeletePostConfirmDialog from '../../components/community/DeletePostConfirmDialog';
import UserCardPopover from '../../components/UserCardPopover';

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

const URGENCY_LABELS = {
    flexible: 'Flexible',
    soon: 'Soon',
    urgent: 'Urgent',
};

const TRAVEL_RADIUS_LABELS = {
    city: 'Within my city',
    county: 'Within my county',
    neighboring_counties: 'Nearby counties',
    statewide: 'Anywhere in Alabama',
};

const DEFAULT_AVATAR_SX = {
    bgcolor: 'grey.600',
    color: '#fff',
};

const SEND_BUTTON_SX = {
    ml: 0.5,
    bgcolor: 'primary.main',
    color: '#fff',
    width: 36,
    height: 36,
    flexShrink: 0,
    '&:hover': { bgcolor: 'primary.dark' },
    '&.Mui-disabled': {
        bgcolor: 'action.disabledBackground',
        color: 'action.disabled',
        opacity: 1,
    },
};

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

/* ---------- Compact relative time helper (for post headers) ---------- */
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

/* ---------- Absolute date helper (short month names) ---------- */
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

/* ---------- category/badge helpers (match CommunityList chips) ---------- */
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

const isVolunteerHelpCategory = (category) => {
    const cat = String(category || '').trim().toLowerCase();
    if (!cat) return false;
    return (
        cat === 'help-requests' ||
        cat === 'volunteers' ||
        cat === 'volunteer-requests' ||
        cat === 'volunteer-help-requests' ||
        cat === 'volunteer-help' ||
        cat.includes('volunteer')
    );
};

const normalizeRequestKind = (post) => {
    const kind = String(post?.request_kind || post?.requestKind || '').trim().toLowerCase();
    if (kind) return kind;

    // Fallback: infer from category when request_kind is missing (legacy rows)
    const cat = String(post?.category || '').trim().toLowerCase();
    if (cat === 'help-requests') return 'help';
    if (cat === 'volunteers') return 'volunteer';
    if (cat === 'volunteer-requests' || cat === 'volunteer-help-requests' || cat === 'volunteer-help') return 'help';
    return '';
};

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
    if (!post || typeof post !== 'object') return [];

    const pickUrl = (val) => {
        if (!val) return null;
        if (typeof val === 'string') {
            const s = val.trim();
            if (!s || s === 'null' || s === 'undefined') return null;
            return s;
        }
        if (typeof val === 'object') {
            const s =
                val.url ||
                val.photo_url ||
                val.photoUrl ||
                val.path ||
                val.location ||
                val.src ||
                val.href ||
                null;
            return pickUrl(s);
        }
        return null;
    };

    const pushMany = (arr, out) => {
        for (const item of arr) {
            const u = pickUrl(item);
            if (u) out.push(u);
        }
    };

    const collected = [];

    // Common shapes:
    // - post.photos: array of strings/objects OR JSON string
    // - post.photos_json: JSON string
    // - post.photo_urls / post.image_urls: array or JSON string
    // - fallbacks: photo_url, image_url, etc.
    const candidates = [
        post.photos,
        post.photos_json,
        post.photo_urls,
        post.photoUrls,
        post.image_urls,
        post.imageUrls,
        post.images,
        post.image_list,
        post.imageList,
    ];

    for (const c of candidates) {
        if (!c) continue;

        if (Array.isArray(c)) {
            pushMany(c, collected);
            continue;
        }

        if (typeof c === 'string') {
            const s = c.trim();
            if (!s || s === 'null') continue;

            // JSON array?
            if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
                try {
                    const parsed = JSON.parse(s);
                    if (Array.isArray(parsed)) pushMany(parsed, collected);
                    else {
                        const u = pickUrl(parsed);
                        if (u) collected.push(u);
                    }
                    continue;
                } catch {
                    // fall through
                }
            }

            // Delimited list?
            if (/[;,|]/.test(s)) {
                const parts = s
                    .split(/[;,|]/)
                    .map((p) => p.trim())
                    .filter(Boolean);
                pushMany(parts, collected);
                continue;
            }

            // Single URL/path
            const u = pickUrl(s);
            if (u) collected.push(u);
        }
    }

    // Other known fallbacks
    if (!collected.length) {
        const oneOffs = [
            post.photo_url,
            post.photoUrl,
            post.photo,
            post.image_url,
            post.imageUrl,
            post.image,
            post.thumbnail,
            post.main_photo_url,
            post.mainPhotoUrl,
            post.cover,
            post.cover_url,
            post.coverUrl,
        ];
        pushMany(oneOffs, collected);
    }

    if (!collected.length && Array.isArray(post.community_photos)) {
        pushMany(post.community_photos, collected);
    }

    // Unique + stable order
    const seen = new Set();
    const out = [];
    for (const u of collected) {
        if (!u) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        out.push(u);
        if (out.length >= 20) break;
    }

    return out;
};

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
                                 viewerId,
                                 postAuthor,
                                 onOpenUserCard,
                                 likeComment,
                                 submitReply,
                                 openFlag,
                                 highlightedCommentId,
                                 onRequestDelete,
                             }) {
    const name = `${node.first_name || ''} ${node.last_name || ''}`.trim() || 'User';
    const ts = node.created_at ? timeAgo(node.created_at) : '';
    const hasReplies = Array.isArray(node.replies) && node.replies.length > 0;
    const open = !!expanded[node.id];

    const [showFull, setShowFull] = useState(false);

    const isHighlighted =
        highlightedCommentId != null && String(node.id) === String(highlightedCommentId);

    const nameNorm = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const authorId = postAuthor?.id != null ? String(postAuthor.id) : null;
    const authorHandle = (postAuthor?.handle || '').toLowerCase();
    const authorPublicId = postAuthor?.public_id != null ? String(postAuthor.public_id) : null;
    const authorNameNorm = (postAuthor?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const nodeId = node.user_id != null ? String(node.user_id) : null;
    const nodeHandle = (node.handle || '').toLowerCase();
    const nodePub = node.public_id != null ? String(node.public_id) : null;
    const viewerIdStr = viewerId != null ? String(viewerId) : null;
    const canDelete = !!viewerIdStr && ((nodeId && viewerIdStr === nodeId) || (authorId && viewerIdStr === authorId));

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
        if (e.key === 'Enter' && !e.shiftKey) {
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

    const REPLY_BATCH = 25;
    const [visibleReplies, setVisibleReplies] = useState(REPLY_BATCH);
    useEffect(() => {
        if (open) setVisibleReplies(REPLY_BATCH);
    }, [open]);

    const repliesToShow = hasReplies ? node.replies.slice(0, visibleReplies) : [];

    const needsTruncate = !!node.text && node.text.length > COMMENT_PREVIEW_CHARS;
    const displayText =
        !node.text
            ? ''
            : showFull || !needsTruncate
                ? node.text
                : `${node.text.slice(0, COMMENT_PREVIEW_CHARS)}...`;

    return (
        <Box
            data-comment-id={String(node.id)}
            id={`comment-${node.id}`}
            sx={{
                pl: depth ? 2 : 0,
                borderLeft: depth ? '2px solid rgba(0,0,0,0.08)' : 'none',
                ml: depth ? 1 : 0,
                scrollMarginTop: 120,
            }}
        >
            <Box
                sx={(t) => ({
                    display: 'flex',
                    gap: 1,
                    alignItems: 'flex-start',
                    py: 1.25,
                    borderRadius: 2,
                    transition: 'background-color 220ms ease, box-shadow 220ms ease, outline-color 220ms ease',
                    ...(isHighlighted
                        ? {
                            px: 1,
                            backgroundColor: alphaColor(t.palette.secondary.main, 0.14),
                            outline: `2px solid ${alphaColor(t.palette.secondary.main, 0.70)}`,
                            boxShadow: `0 14px 34px ${alphaColor(t.palette.secondary.main, 0.20)}`,
                        }
                        : null),
                })}
            >
                <Avatar
                    src={hasNodeAvatar ? node.avatar : undefined}
                    sx={{ width: 48, height: 48, cursor: 'pointer', border: '1px solid', borderColor: 'divider', ...DEFAULT_AVATAR_SX }}
                    onClick={openCard}
                >
                    {!hasNodeAvatar ? <PersonIcon /> : null}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 1,
                            flexWrap: 'nowrap',
                        }}
                    >
                        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography
                                    variant="subtitle2"
                                    sx={{ fontWeight: 700, cursor: 'pointer' }}
                                    onClick={openCard}
                                    noWrap
                                >
                                    {name}
                                </Typography>
                                {isAuthor && (
                                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            Author
                                        </Typography>
                                    </Box>
                                )}
                                {ts ? (
                                    <>
                                        <Box sx={{ width: 4, height: 4, borderRadius: '50%' }} />
                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                            {ts}
                                        </Typography>
                                    </>
                                ) : null}
                            </Box>
                            {node.handle ? (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ cursor: 'pointer', mt: 0.1, lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                    onClick={openCard}
                                    noWrap
                                >
                                    @{node.handle}
                                </Typography>
                            ) : null}
                        </Box>
                        {canDelete ? (
                            <Tooltip title={depth ? 'Delete Reply' : 'Delete Comment'} arrow>
                                <IconButton
                                    aria-label={depth ? 'Delete reply' : 'Delete comment'}
                                    size="small"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onRequestDelete?.(node.id, depth > 0);
                                    }}
                                    sx={{
                                        ml: 'auto',
                                        width: 36,
                                        height: 36,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        color: 'text.secondary',
                                        bgcolor: 'background.paper',
                                        '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                                    }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        ) : null}
                    </Box>
                    {node.text ? (
                        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {displayText}
                            {needsTruncate && !showFull && (
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
                            )}
                            {needsTruncate && showFull && (
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
                            )}
                        </Typography>
                    ) : null}

                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mt: 0.5,
                            flexWrap: 'wrap',
                        }}
                    >
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
                            sx={{
                                textTransform: 'none',
                                minWidth: 0,
                                color: flagged ? 'success.main' : 'inherit',
                            }}
                        >
                            {flagged ? 'Reported' : 'Report'}
                        </Button>
                    </Box>

                    {replyOpen && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
                            <Avatar
                                src={viewerAvatarUrl ? viewerAvatarUrl : undefined}
                                alt={viewerLabel}
                                sx={{
                                    width: 32,
                                    height: 32,
                                    mt: 0.25,
                                    flexShrink: 0,
                                    ...DEFAULT_AVATAR_SX,
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
                                sx={{
                                    '& .MuiOutlinedInput-root': { borderRadius: 2, alignItems: 'flex-end' },
                                }}
                                inputProps={{ maxLength: COMMENT_MAX_CHARS }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.25 }}>
                                            <IconButton
                                                aria-label="Send reply"
                                                onClick={sendReply}
                                                disabled={!replyText.trim()}
                                                sx={{
                                                    ...SEND_BUTTON_SX,
                                                    width: 34,
                                                    height: 34,
                                                }}
                                            >
                                                <ArrowForwardRoundedIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Box>
                    )}

                    {node.reply_count > 0 && !hasReplies && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {node.reply_count} repl{node.reply_count === 1 ? 'y' : 'ies'}
                        </Typography>
                    )}

                    {hasReplies && (
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
                    )}
                </Box>
            </Box>

            {hasReplies && open && (
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
                                viewerId={viewerId}
                                highlightedCommentId={highlightedCommentId}
                                onRequestDelete={onRequestDelete}
                                postAuthor={postAuthor}
                                onOpenUserCard={onOpenUserCard}
                                likeComment={likeComment}
                                submitReply={submitReply}
                                openFlag={openFlag}
                            />
                        ))}
                    </Box>

                    {node.replies.length > repliesToShow.length && (
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
                    )}
                </>
            )}
        </Box>
    );
}

function RedditComments({
                            postId,
                            refreshKey,
                            initialPageSize = 50,
                            viewer,
                            postAuthor,
                            onOpenUserCard,
                            scrollToCommentId,
                        }) {
    const [loading, setLoading] = useState(true);
    const [threads, setThreads] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [visibleCount, setVisibleCount] = useState(initialPageSize);
    const [scrolled, setScrolled] = useState(false);
    const [highlightedCommentId, setHighlightedCommentId] = useState(null);
    const autoScrollRef = useRef(false);
    const highlightTimerRef = useRef(0);

    useEffect(() => {
        const onScroll = () => {
            const y = window.scrollY || document.documentElement.scrollTop || 0;
            setScrolled(y > 600);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const target = scrollToCommentId != null ? String(scrollToCommentId) : '';
        autoScrollRef.current = false;
        setHighlightedCommentId(null);
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = 0;
        }
        // reset per-post or per-target change
    }, [postId, scrollToCommentId]);

    const [refreshTick, setRefreshTick] = useState(0);

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

    useEffect(() => {
        const targetId = scrollToCommentId != null ? String(scrollToCommentId) : '';
        if (!targetId) return;
        if (loading) return;
        if (!threads || threads.length === 0) return;
        if (autoScrollRef.current) return;

        const findPath = (nodes, rootIndex = 0) => {
            for (let i = 0; i < nodes.length; i += 1) {
                const n = nodes[i];
                const id = n?.id != null ? String(n.id) : '';
                if (id === targetId) {
                    return { found: true, parentIds: [], rootIndex: rootIndex + i, rootId: id };
                }
                const kids = Array.isArray(n?.replies) ? n.replies : [];
                if (kids.length) {
                    const subRes = findPath(kids, rootIndex + i);
                    if (subRes?.found) {
                        return {
                            ...subRes,
                            parentIds: [id, ...(subRes.parentIds || [])].filter(Boolean),
                            rootId: subRes.rootId,
                        };
                    }
                }
            }
            return null;
        };

        // Find the chain (root -> ... -> target) so we can expand parents and ensure the root is visible.
        let rootIndex = -1;
        let parentIds = [];
        let rootId = '';
        for (let i = 0; i < threads.length; i += 1) {
            const root = threads[i];
            const rootId0 = root?.id != null ? String(root.id) : '';
            if (!rootId0) continue;
            if (rootId0 === targetId) {
                rootIndex = i;
                rootId = rootId0;
                parentIds = [];
                break;
            }
            const res = findPath(Array.isArray(root?.replies) ? root.replies : [], 0);
            if (res?.found) {
                rootIndex = i;
                rootId = rootId0;
                parentIds = [rootId0, ...(res.parentIds || [])].filter(Boolean);
                break;
            }
        }

        // If the root comment isn't in the current visible window, expand the window first.
        if (rootIndex >= 0) {
            const needed = rootIndex + 1;
            if (visibleCount < needed) {
                setVisibleCount(needed);
                return;
            }
        }

        if (parentIds.length) {
            setExpanded((prev) => {
                const next = { ...(prev || {}) };
                parentIds.forEach((pid) => {
                    if (!pid) return;
                    next[pid] = true;
                });
                return next;
            });
        }

        const safeEscape = (v) => {
            try {
                if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
                    return window.CSS.escape(v);
                }
            } catch {}
            return v.replace(/"/g, '\\"');
        };

        const attemptScroll = (triesLeft) => {
            const sel = `[data-comment-id="${safeEscape(targetId)}"]`;
            const el = document.querySelector(sel);
            if (el) {
                try {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch {
                    // ignore
                }

                setHighlightedCommentId(targetId);
                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                highlightTimerRef.current = setTimeout(() => {
                    setHighlightedCommentId(null);
                    highlightTimerRef.current = 0;
                }, 6500);

                autoScrollRef.current = true;
                return;
            }

            if (triesLeft <= 0) {
                autoScrollRef.current = true;
                return;
            }

            requestAnimationFrame(() => attemptScroll(triesLeft - 1));
        };

        // Let the DOM paint (and replies expand) before searching for the target element.
        requestAnimationFrame(() => requestAnimationFrame(() => attemptScroll(8)));
    }, [scrollToCommentId, loading, threads, visibleCount]);

    const openLogin = () => {
        try {
            window.dispatchEvent(new CustomEvent('open-login'));
            window.dispatchEvent(new CustomEvent('open-auth-dialog'));
            window.dispatchEvent(new CustomEvent('open-login-popup'));
        } catch {}
    };

    const [commentDeleteConfirm, setCommentDeleteConfirm] = useState({ open: false, commentId: null, isReply: false });

    const requestCommentDelete = useCallback((commentId, isReply = false) => {
        const cid = Number(commentId);
        if (!Number.isFinite(cid) || cid <= 0) return;
        setCommentDeleteConfirm({ open: true, commentId: cid, isReply: !!isReply });
    }, []);

    const closeCommentDeleteConfirm = useCallback(() => {
        setCommentDeleteConfirm({ open: false, commentId: null, isReply: false });
    }, []);

    async function deleteComment(commentId) {
        if (!viewer) return openLogin();
        const cid = Number(commentId);
        if (!Number.isFinite(cid) || cid <= 0) return;

        const tryUrls = [
            `/api/community/comments/${encodeURIComponent(cid)}`,
            `/api/comments/${encodeURIComponent(cid)}`,
            `/api/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(cid)}`,
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

    const confirmCommentDelete = useCallback(async () => {
        if (!commentDeleteConfirm.commentId) return;
        await deleteComment(commentDeleteConfirm.commentId);
        closeCommentDeleteConfirm();
    }, [commentDeleteConfirm.commentId, closeCommentDeleteConfirm]);

    const viewerAvatarUrl = viewer?.avatar_url || viewer?.profile_picture || '';
    const viewerLabel = `${viewer?.first_name || ''} ${viewer?.last_name || ''}`.trim() || 'You';

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
        setLiked(!currentLiked);
        setLikes((n) => Math.max(0, n + (currentLiked ? -1 : 1)));
    };

    const submitReply = async (parentId, text, onDone) => {
        if (!viewer) return openLogin();
        const cleaned = text.trim().slice(0, COMMENT_MAX_CHARS);
        if (!cleaned) return;
        const payload = { text: cleaned, content: cleaned, parent_id: parentId };
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
            } catch {}
        }
    };

    const [flagState, setFlagState] = useState({ open: false, commentId: null });

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
                    setRefreshTick((k) => k + 1);
                    break;
                }
            } catch {}
        }
        closeFlag();
    };

    const visibleThreads = threads.slice(0, visibleCount);
    const canLoadMore = threads.length > visibleThreads.length;

    const INDENT_PX = 24;
    const SAFE_DEPTH_BEFORE_SCROLL = 6;
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
        <>
            <Box id="comments-anchor" sx={{ mt: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                    Comments
                </Typography>

                <Box sx={{ overflowX: 'auto', overflowY: 'visible', pb: 1, px: { xs: 1, sm: 1.25 } }}>

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
                                        viewerId={viewer?.id}
                                        postAuthor={postAuthor}
                                        highlightedCommentId={highlightedCommentId}
                                        onOpenUserCard={onOpenUserCard}
                                        likeComment={likeComment}
                                        submitReply={submitReply}
                                        openFlag={openFlag}
                                        onRequestDelete={requestCommentDelete}
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

                <FlagCommentDialog open={flagState.open} onClose={closeFlag} onSubmit={submitFlag} />
            </Box>
            <Dialog
                open={commentDeleteConfirm.open}
                onClose={(event, reason) => {
                    if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
                    closeCommentDeleteConfirm();
                }}
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ pr: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Delete {commentDeleteConfirm.isReply ? 'reply' : 'comment'}?
                    </Typography>
                    <IconButton
                        aria-label="Close"
                        onClick={closeCommentDeleteConfirm}
                        size="small"
                        sx={{ width: 36, height: 36 }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary">
                        {commentDeleteConfirm.isReply
                            ? 'This reply will be permanently deleted.'
                            : 'This comment and all replies under it will be permanently deleted.'}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 2, py: 1.5 }}>
                    <Button onClick={closeCommentDeleteConfirm} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmCommentDelete}
                        variant="contained"
                        color="error"
                        startIcon={<DeleteIcon />}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </>
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

    const reloadPost = useCallback(
        async ({ showSpinner = false } = {}) => {
            const id = post?.id || routeId;
            if (!id) return null;

            if (showSpinner) setLoading(true);

            let out = null;

            try {
                let res = await fetch(`/api/community/${encodeURIComponent(id)}`, {
                    credentials: 'include',
                    cache: 'no-store',
                });

                if (!res.ok) {
                    const res2 = await fetch(`/api/community/posts/${encodeURIComponent(id)}`, {
                        credentials: 'include',
                        cache: 'no-store',
                    });
                    if (res2.ok) res = res2;
                }

                const data = await res.json().catch(() => null);
                const normalized = Array.isArray(data) ? data[0] : data;

                if (normalized && typeof normalized === 'object') {
                    out = normalized;
                    setPost(normalized);
                }
            } catch {
                // ignore
            } finally {
                if (showSpinner) setLoading(false);
            }

            return out;
        },
        [routeId, post?.id]
    );
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

// owner action dialogs (edit/delete/mark found/history)
    const [editOpen, setEditOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

    const [markFoundOpen, setMarkFoundOpen] = useState(false);
    const [markFoundPostId, setMarkFoundPostId] = useState(null);
    const [markFoundMessage, setMarkFoundMessage] = useState('');
    const [markFoundSaving, setMarkFoundSaving] = useState(false);
    const [markFoundError, setMarkFoundError] = useState('');

    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyPostId, setHistoryPostId] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [historyRows, setHistoryRows] = useState([]);
    // Dialog helpers (edit / delete / mark found / history)
    const openEditDialog = useCallback(() => {
        if (!post?.id) return;
        setEditOpen(true);
    }, [post?.id]);

    const openDeleteDialog = useCallback(() => {
        if (!post?.id) return;
        setDeleteConfirmOpen(true);
    }, [post?.id]);

    const openMarkFoundDialog = useCallback(() => {
        if (!post?.id) return;
        setMarkFoundPostId(Number(post.id));
        setMarkFoundMessage('');
        setMarkFoundError('');
        setMarkFoundSaving(false);
        setMarkFoundOpen(true);
    }, [post?.id]);

    const closeMarkFoundDialog = useCallback(() => {
        setMarkFoundOpen(false);
        setMarkFoundPostId(null);
        setMarkFoundMessage('');
        setMarkFoundError('');
        setMarkFoundSaving(false);
    }, []);

    const submitMarkFound = useCallback(async () => {
        if (!markFoundPostId) return;

        setMarkFoundSaving(true);
        setMarkFoundError('');

        try {
            const res = await fetch(`/api/community/${encodeURIComponent(markFoundPostId)}/mark-found`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message: markFoundMessage || '' }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setMarkFoundError(String(data?.message || 'Failed to mark as found.'));
                setMarkFoundSaving(false);
                return;
            }

            let updated = null;

            if (data && typeof data === 'object') {
                if (data?.post && typeof data.post === 'object') updated = data.post;
                else if (data?.id != null) updated = data;
            }

            // If the API didn't return the updated post, fetch it so the UI updates immediately
            if (!updated || updated?.id == null) {
                try {
                    let getRes = await fetch(`/api/community/${encodeURIComponent(markFoundPostId)}`, { credentials: 'include' });
                    if (!getRes.ok) {
                        const res2 = await fetch(`/api/community/posts/${encodeURIComponent(markFoundPostId)}`, { credentials: 'include' });
                        if (res2.ok) getRes = res2;
                    }
                    const latest = await getRes.json().catch(() => null);
                    const normalized = Array.isArray(latest) ? latest[0] : latest;
                    if (normalized && typeof normalized === 'object') updated = normalized;
                } catch {
                    // ignore
                }
            }

            if (updated && typeof updated === 'object') {
                setPost((prev) => ({ ...(prev || {}), ...updated }));
                try {
                    window.dispatchEvent(
                        new CustomEvent('ll:communityPost:markedFound', {
                            detail: { postId: markFoundPostId, post: updated },
                        })
                    );
                } catch {
                    // ignore
                }
            }

            closeMarkFoundDialog();
        } catch {
            setMarkFoundError('Failed to mark as found.');
            setMarkFoundSaving(false);
        }
    }, [markFoundPostId, markFoundMessage, closeMarkFoundDialog]);

    const openHistoryDialog = useCallback(async () => {
        if (!post?.id) return;

        const pid = Number(post.id);
        setHistoryPostId(pid);
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryError('');
        setHistoryRows([]);

        try {
            const res = await fetch(`/api/community/${encodeURIComponent(pid)}/edits`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => []);
            if (!res.ok) {
                setHistoryError(String(data?.message || 'Failed to load edit history.'));
                setHistoryRows([]);
            } else {
                setHistoryRows(Array.isArray(data) ? data : []);
            }
        } catch {
            setHistoryError('Failed to load edit history.');
            setHistoryRows([]);
        } finally {
            setHistoryLoading(false);
        }
    }, [post?.id]);

    const closeHistoryDialog = useCallback(() => {
        setHistoryOpen(false);
        setHistoryPostId(null);
        setHistoryLoading(false);
        setHistoryError('');
        setHistoryRows([]);
    }, []);

    // NEW: ensure we land at the top whenever this page is opened (non-embedded)
    useEffect(() => {
        if (!embedded) {
            try {
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            } catch {}
        }
    }, [embedded]);

    // Sync with prop when embedded so selecting another card updates the detail pane
    useEffect(() => {
        if (embedded && initialPost && (!post || String(initialPost.id) !== String(post.id))) {
            setPost(initialPost);
            setLoading(false);
        }
    }, [embedded, initialPost, post]);

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

    // Return targets when we came from a profile
    const fromProfile = Boolean(location?.state?.fromProfile);
    const backProfileName = location?.state?.backProfileName || '';
    const backProfileHandle = location?.state?.backProfileHandle || '';
    const backProfileId = location?.state?.backProfileId || '';
    const backToProfileUrl =
        location?.state?.backToProfileUrl ||
        (backProfileHandle ? `/${backProfileHandle}` : backProfileId ? `/${backProfileId}` : '');

    const fromCommunity = useMemo(() => {
        if (location?.state?.from === 'community' || location?.state?.fromCommunity === true) return true;
        try {
            return Boolean(sessionStorage.getItem('ll:community:url'));
        } catch {
            return false;
        }
    }, [location?.state]);
    const backToList = useCallback(() => {
        try {
            sessionStorage.setItem('ll:community:restore', '1');
        } catch {}

        try {
            const url = sessionStorage.getItem('ll:community:url');
            if (url) {
                navigate(url, { state: { restoreCommunity: true } });
                return;
            }
        } catch {}

        navigate('/community');
    }, [navigate]);

    const handleReturnClick = useCallback(() => {
        if (fromProfile) {
            try {
                const key = backProfileHandle || backProfileId;
                if (key) sessionStorage.setItem(`ll:profile:${key}:restore`, '1');
            } catch {}
            const canGoBack =
                typeof window !== 'undefined' && window.history && typeof window.history.length === 'number'
                    ? window.history.length > 1
                    : false;

            // Prefer navigating back so the profile returns EXACTLY to its previous UI state (tab, scroll, filters).
            if (canGoBack) {
                navigate(-1);
            } else if (backToProfileUrl) {
                navigate(backToProfileUrl);
            } else {
                const fallbackHandle = backProfileHandle ? String(backProfileHandle).replace(/^@/, '') : '';
                navigate(fallbackHandle ? `/${fallbackHandle}` : '/');
            }
            return;
        }
        backToList();
    }, [fromProfile, navigate, backToList, backToProfileUrl, backProfileHandle, backProfileId]);

    const photos = useMemo(() => extractPhotos(post || {}), [post]);
    const badgeMeta = useMemo(() => buildBadgeFor(post || {}), [post]);

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
    const activePostId = routeId || postId;

    useEffect(() => {
        if (!activePostId) return;

        const patchCommunitySessionCache = (updatedPost) => {
            try {
                const idStr = updatedPost?.id != null ? String(updatedPost.id) : '';
                if (!idStr) return;

                // Patch the cached Community list payload so returning to /community shows updated photos immediately.
                const dataKey = 'll:community:data';
                const stateKey = 'll:community:state';

                const safeParse = (raw) => {
                    if (!raw || typeof raw !== 'string') return null;
                    try { return JSON.parse(raw); } catch { return null; }
                };

                const rawData = sessionStorage.getItem(dataKey);
                const data = safeParse(rawData);
                if (data && Array.isArray(data.posts)) {
                    const nextPosts = data.posts.map((p) => (p && String(p.id) === idStr ? { ...p, ...updatedPost } : p));
                    // Only write if we actually had that post in cache
                    if (nextPosts.some((p) => p && String(p.id) === idStr)) {
                        sessionStorage.setItem(dataKey, JSON.stringify({ ...data, posts: nextPosts, ts: Date.now() }));
                    }
                }

                const rawState = sessionStorage.getItem(stateKey);
                const st = safeParse(rawState);
                if (st && st.selectedPost && String(st.selectedPost.id) === idStr) {
                    sessionStorage.setItem(stateKey, JSON.stringify({ ...st, selectedPost: { ...st.selectedPost, ...updatedPost } }));
                }
            } catch {
                // ignore
            }
        };

        const onUpdated = (e) => {
            const next = e?.detail?.post || e?.detail || null;
            if (!next || next.id == null) return;
            if (String(next.id) !== String(activePostId)) return;
            setPost((prev) => ({ ...(prev || {}), ...next }));
            patchCommunitySessionCache(next);
        };

        const onMarkedFound = (e) => {
            const next = e?.detail?.post || e?.detail || null;
            if (!next || next.id == null) return;
            if (String(next.id) !== String(activePostId)) return;
            setPost((prev) => ({ ...(prev || {}), ...next }));
            patchCommunitySessionCache(next);
        };

        const onDeleted = (e) => {
            const delId = e?.detail?.postId ?? e?.detail?.id ?? e?.detail ?? null;
            if (delId == null) return;
            if (String(delId) !== String(activePostId)) return;
            setPost(null);
        };

        window.addEventListener('ll:communityPost:updated', onUpdated);
        window.addEventListener('ll:communityPost:markedFound', onMarkedFound);
        window.addEventListener('ll:communityPost:deleted', onDeleted);

        return () => {
            window.removeEventListener('ll:communityPost:updated', onUpdated);
            window.removeEventListener('ll:communityPost:markedFound', onMarkedFound);
            window.removeEventListener('ll:communityPost:deleted', onDeleted);
        };
    }, [activePostId]);
    const postAuthorId =
        post?.user_id ?? post?.author_id ?? post?.user?.id ?? post?.uid ?? post?.owner_id ?? null;

    const viewerId = viewerUser?.id != null ? String(viewerUser.id) : '';
    const viewerHandle = String(viewerUser?.handle || '').trim().toLowerCase();

    const authorId = postAuthorId != null ? String(postAuthorId) : '';
    const authorHandle = String(post?.handle || '').trim().toLowerCase();
    const viewerPublicId = viewerUser?.public_id != null ? String(viewerUser.public_id) : '';
    const authorPublicId = post?.public_id != null ? String(post.public_id) : '';

    const isOwner = useMemo(() => {
        if (viewerId && authorId && viewerId === authorId) return true;
        if (viewerHandle && authorHandle && viewerHandle === authorHandle) return true;
        if (viewerPublicId && authorPublicId && viewerPublicId === authorPublicId) return true;
        return false;
    }, [viewerId, authorId, viewerHandle, authorHandle, viewerPublicId, authorPublicId]);

    const isEdited = Boolean(post?.edited_at || post?.editedAt);

    const resolvedAt = post?.resolved_at || post?.resolvedAt || null;
    const resolvedMessage = post?.resolved_message || post?.resolvedMessage || '';
    const isResolved = Boolean(resolvedAt || resolvedMessage);

    const POST_DESC_PREVIEW_CHARS = 900;
    const fullDescRaw = post?.description != null ? String(post.description) : '';
    const fullDescTrimmed = fullDescRaw.trim();
    const descNeedsTruncate = fullDescTrimmed.length > POST_DESC_PREVIEW_CHARS;
    const descDisplay = (!descNeedsTruncate || showFullDescription)
        ? fullDescRaw
        : `${fullDescTrimmed.slice(0, POST_DESC_PREVIEW_CHARS).trimEnd()}...`;

    const lostOrFound = String(post?.lost_or_found || '').trim().toLowerCase();
    const canMarkFound = Boolean(isOwner && lostOrFound === 'lost' && !isResolved);

    const requestKind = useMemo(() => normalizeRequestKind(post), [post]);
    const isVolunteerHelp = useMemo(() => {
        const catOk = isVolunteerHelpCategory(post?.category);
        const rk = String(requestKind || '').trim().toLowerCase();
        const hasHelpFields = Boolean(post?.help_type || post?.helpType || post?.help_type_other || post?.is_urgent || post?.isUrgent);
        return Boolean(catOk || rk === 'help' || rk === 'volunteer' || hasHelpFields);
    }, [post, requestKind]);

    const helpTypeLabel = useMemo(() => {
        const ht = String(post?.help_type || post?.helpType || '').trim().toLowerCase();
        const other = String(post?.help_type_other || '').trim();
        if (!ht) return '';
        if (ht === 'other') return other ? `Other: ${other}` : 'Other';
        return HELP_TYPE_LABELS[ht] || formatNiceLabel(ht);
    }, [post]);

    const urgency = requestKind === 'help'
        ? String(post?.urgency || post?.urgency_level || post?.urgencyLevel || '').trim().toLowerCase()
        : '';

    const isUrgent = (
        // Primary: DB column `is_urgent` from volunteer_help_requests
        Boolean(Number(post?.is_urgent ?? post?.isUrgent ?? post?.urgent ?? 0)) ||
        // Legacy fallbacks (only used if you ever stored a string urgency)
        String(post?.urgency || post?.urgency_level || post?.urgencyLevel || '').trim().toLowerCase() === 'urgent'
    );
    const postAuthor = useMemo(() => {
        const name = `${post?.first_name || ''} ${post?.last_name || ''}`.trim();
        return {
            id: postAuthorId != null ? String(postAuthorId) : null,
            handle: post?.handle || null,
            public_id: post?.public_id != null ? String(post.public_id) : null,
            name,
        };
    }, [post, postAuthorId]);

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
            forceRefreshComments();
            const anchor = document.getElementById('comments-anchor');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            openLoginPopup();
        }
    }

    const onComposerKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
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

                    setUserForCard((prev) => {
                        if (!prev) return prev;
                        if (!prev.id && profile.id) return { ...prev, id: profile.id };
                        return prev;
                    });

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
                } catch {}
            }
            return null;
        },
        [viewerUser?.id]
    );

    const handleOpenUserCard = (el, author) => {
        setUserAnchor(el);
        setUserForCard({
            id: author?.id,
            first_name: author?.first_name,
            last_name: author?.last_name,
            handle: author?.handle,
            avatar_url: author?.avatar_url,
        });
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
            } catch {}
        }
        return false;
    };

    const handleFollow = async (targetUser) => {
        const tid0 = Number(targetUser?.id || userForCard?.id);
        const handle0 = targetUser?.handle || userForCard?.handle;
        if (!tid0 && !handle0) return;

        const selfId = Number(viewerUser?.id);
        if (selfId && tid0 && selfId === tid0) return;

        requireAuth(async () => {
            let tid = tid0;
            if (!tid && handle0) {
                const p = await hydrateTargetFromPublic({ handle: handle0 });
                if (p?.id) tid = Number(p.id);
            }
            if (!tid) return;

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
                <Typography color="text.secondary">
                    The post you are trying to find does not exist or has been deleted.
                </Typography>

                {!embedded && (fromProfile || fromCommunity) ? (
                    <Button onClick={handleReturnClick} sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
                        {fromProfile
                            ? backProfileName
                                ? `Return to ${backProfileName}'s profile`
                                : 'Return to Profile'
                            : 'Return to Community Posts'}
                    </Button>
                ) : !embedded ? (
                    <Button
                        onClick={() => navigate('/community')}
                        sx={{ mt: 2 }}
                        startIcon={<ArrowBackIcon />}
                    >
                        Go to Community Posts
                    </Button>
                ) : null}
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

    return (
        <Box sx={outerSx}>
            <Paper
                variant="outlined"
                sx={(t) => ({
                    p: { xs: 1.25, sm: 2 },
                    borderRadius: 3,
                    borderColor: alphaColor(t.palette.primary.main, 0.12),
                    bgcolor: '#FFFFFF',
                    backgroundImage: 'none',
                    boxShadow: embedded
                        ? 'none'
                        : `0 16px 56px ${alphaColor(t.palette.common.black, 0.08)}`,
                })}
            >
                {/* Top return bar (Profile or Community) */}
                {!embedded && (fromProfile || fromCommunity) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Button
                            onClick={handleReturnClick}
                            startIcon={<ArrowBackIcon />}
                            sx={{ px: 1, py: 0.5, minWidth: 0, fontWeight: 800, textTransform: 'none', borderRadius: 999, '&:hover': { bgcolor: 'action.hover' } }}
                        >
                            {fromProfile
                                ? backProfileName
                                    ? `Return to ${backProfileName}'s profile`
                                    : 'Return to Profile'
                                : 'Return to Community Posts'}
                        </Button>
                    </Box>
                )}

                {/* Header (author) */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Avatar
                        src={authorAvatar || undefined}
                        alt={post.first_name || ''}
                        sx={{ width: 36, height: 36, flexShrink: 0, cursor: 'pointer', ...DEFAULT_AVATAR_SX }}
                        onClick={openTopCard}
                    >
                        {!authorAvatar ? <PersonIcon /> : null}
                    </Avatar>

                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="subtitle1" noWrap sx={{ cursor: 'pointer' }} onClick={openTopCard}>
                                {post.first_name} {post.last_name}
                            </Typography>
                        </Box>

                        {post.handle ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
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
                                        onClick={openHistoryDialog}
                                        sx={{ fontSize: 12, color: 'primary.main', fontWeight: 900, p: 0 }}
                                    >
                                        (Edited)
                                    </Link>
                                ) : null}
                            </Box>
                        ) : isEdited ? (
                            <Link
                                component="button"
                                type="button"
                                underline="hover"
                                onClick={openHistoryDialog}
                                sx={{ fontSize: 12, color: 'primary.main', fontWeight: 900, p: 0 }}
                            >
                                (Edited)
                            </Link>
                        ) : null}
                    </Box>

                    <Box
                        sx={{
                            ml: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 0.75,
                            minWidth: 0,
                        }}
                    >

                        {/* Volunteer / Help details panel (matches the preview detail UI) */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {canMarkFound ? (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={openMarkFoundDialog}
                                    startIcon={<CheckCircleOutlineIcon />}
                                    sx={{
                                        borderRadius: 999,
                                        textTransform: 'none',
                                        fontWeight: 800,
                                        px: 1.25,
                                        py: 0.5,
                                        minWidth: 0,
                                    }}
                                >
                                    Mark as Found
                                </Button>
                            ) : null}

                            {badgeMeta ? <CategoryChip badge={badgeMeta} active /> : null}

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
                                                openEditDialog();
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
                                                openDeleteDialog();
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
                            ) : null}
                        </Box>
                    </Box>
                </Box>

                {/* Title + Description */}
                {post.title ? (
                    <Typography variant="h5" sx={{ mt: 1.25, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, wordBreak: 'break-word' }}>
                        {post.title}
                    </Typography>

                ) : null}

                {isVolunteerHelp ? (
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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

                {post.description ? (
                    <Typography
                        variant="body1"
                        sx={{
                            mt: 1.25,
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.7,
                            color: 'text.primary',
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
                            src={avatarUrl ? avatarUrl : undefined}
                            alt={fullName || 'You'}
                            sx={{
                                width: 36,
                                height: 36,
                                flexShrink: 0,
                                ...DEFAULT_AVATAR_SX,
                            }}
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
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                },
                                '& .MuiInputLabel-root': { fontWeight: 700 },
                            }}
                            inputProps={{ maxLength: COMMENT_MAX_CHARS }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.25 }}>
                                        <IconButton
                                            aria-label="Send comment"
                                            onClick={submitComment}
                                            disabled={posting || !commentText.trim()}
                                            sx={SEND_BUTTON_SX}
                                        >
                                            {posting ? (
                                                <CircularProgress size={18} sx={{ color: 'inherit' }} />
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

                <RedditComments
                    postId={post.id}
                    refreshKey={commentsRefreshKey}
                    initialPageSize={50}
                    viewer={viewerUser}
                    postAuthor={postAuthor}
                    onOpenUserCard={handleOpenUserCard}
                    scrollToCommentId={location?.state?.scrollToCommentId}
                />
            </Paper>

            {/* Shared user card popover */}
            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={userForCard}
                isSelf={isSelfForCard}
                following={isFollowingForCard}
                onFollow={handleFollow}
                onViewProfile={handleViewProfile}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={viewerUser} post={post} />

            <EditCommunityPostDialog
                open={editOpen}
                postId={Number(post?.id || 0)}
                onClose={async () => {
                    setEditOpen(false);

                    // Always re-hydrate after the edit dialog closes so the Post Page stays current.
                    // (If the user cancelled, this is a harmless no-op update.)
                    const updated = await reloadPost({ showSpinner: false });

                    if (updated && updated.id != null) {
                        const pid = Number(updated.id);

                        const isEdited = Boolean(
                            updated?.edited_at ||
                            updated?.editedAt ||
                            updated?.has_edits ||
                            updated?.edits_count ||
                            updated?.editsCount
                        );

                        if (isEdited && Number.isFinite(pid) && pid > 0) {
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
                    }
                }}
            />

            <DeletePostConfirmDialog
                open={deleteConfirmOpen}
                postId={Number(post?.id || 0)}
                onClose={() => setDeleteConfirmOpen(false)}
                onDeleted={() => {
                    setDeleteConfirmOpen(false);

                    const deletedId = Number(post?.id || 0);
                    if (deletedId) {
                        try {
                            // Let CommunityPage/CommunityList/PostDetail clear selection + refetch.
                            window.dispatchEvent(
                                new CustomEvent('ll:communityPost:deleted', { detail: { postId: deletedId } })
                            );
                        } catch {
                            // ignore
                        }

                        try {
                            // If we navigate back to /community, avoid restoring a stale selectedPost from session cache.
                            sessionStorage.setItem('ll:community:pendingDeleteId', String(deletedId));
                            sessionStorage.setItem('ll:community:forceRefresh', '1');
                        } catch {
                            // ignore
                        }
                    }

                    try {
                        navigate('/community', { replace: true });
                    } catch {
                        // ignore
                    }
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
                <DialogTitle sx={{ fontWeight: 900 }}>Mark as Found</DialogTitle>
                <DialogContent sx={{ pt: 1 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                        Optionally add a short note (e.g., “Found near the park”).
                    </Typography>

                    <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        maxRows={6}
                        label="Message (optional)"
                        value={markFoundMessage}
                        onChange={(e) => setMarkFoundMessage(e.target.value)}
                        inputProps={{ maxLength: 500 }}
                    />

                    {markFoundError ? (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {markFoundError}
                        </Alert>
                    ) : null}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button
                        variant="outlined"
                        onClick={closeMarkFoundDialog}
                        disabled={markFoundSaving}
                        sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 900 }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={submitMarkFound}
                        disabled={markFoundSaving}
                        sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 900 }}
                        startIcon={<CheckCircleIcon />}
                    >
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
                            {historyRows.map((row, idxRow) => {
                                const snap = row?.snapshot || row?.snap || row?.data || row || {};
                                const version =
                                    row?.version != null
                                        ? row.version
                                        : row?.ver != null
                                            ? row.ver
                                            : historyRows.length - idxRow;

                                const editedAt = row?.edited_at || row?.editedAt || row?.updated_at || row?.updatedAt || snap?.edited_at || snap?.editedAt;
                                const editorHandleRaw = row?.editor_handle || row?.editorHandle || row?.handle || row?.edited_by_handle || row?.editedByHandle || '';
                                const editorHandle = editorHandleRaw
                                    ? String(editorHandleRaw).replace(/^@/, '')
                                    : '';

                                return (
                                    <Box
                                        key={row?.id || `${historyPostId || 'post'}-${version}-${idxRow}`}
                                        sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 2, p: 1.25 }}
                                    >
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                            Version {version}
                                            {editedAt ? ` • ${dateTimeLabelShort(editedAt)}` : ''}
                                            {editorHandle ? ` • @${editorHandle}` : ''}
                                        </Typography>

                                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                            {snap?.title || '(no title)'}
                                        </Typography>

                                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                            {snap?.description || ''}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    ) : null}
                </DialogContent>

            </Dialog>
        </Box>
    );
}

/* ---------- Local, lightweight carousel ---------- */
function Carousel({ photos, compact = false }) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (!Array.isArray(photos) || photos.length === 0) return;
        if (index > photos.length - 1) setIndex(0);
    }, [photos, index]);

    const prev = useCallback(() => setIndex((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
    const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length]);

    const current = photos[index] || photos[0];

    return (
        <Box sx={{ position: 'relative', mt: 2 }}>
            <Box
                sx={{
                    width: '100%',
                    height: compact ? { xs: 220, sm: 320 } : { xs: 260, sm: 420 },
                    borderRadius: 2,
                    boxShadow: compact ? '0 12px 34px rgba(0,0,0,0.10)' : '0 18px 50px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <Box
                    component="img"
                    key={current}
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
                    {/* Controls (count + arrows) */}
                    <Box
                        sx={{
                            mt: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                        }}
                    >
                        <IconButton
                            aria-label="Previous image"
                            onClick={prev}
                            sx={{
                                bgcolor: 'rgba(0,0,0,0.06)',
                                border: '1px solid rgba(0,0,0,0.10)',
                                '&:hover': { bgcolor: 'rgba(0,0,0,0.10)' },
                            }}
                        >
                            <ChevronLeftIcon />
                        </IconButton>

                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 900,
                                color: 'text.primary',
                                minWidth: compact ? 62 : 72,
                                textAlign: 'center',
                            }}
                        >
                            {index + 1} / {photos.length}
                        </Typography>

                        <IconButton
                            aria-label="Next image"
                            onClick={next}
                            sx={{
                                bgcolor: 'rgba(0,0,0,0.06)',
                                border: '1px solid rgba(0,0,0,0.10)',
                                '&:hover': { bgcolor: 'rgba(0,0,0,0.10)' },
                            }}
                        >
                            <ChevronRightIcon />
                        </IconButton>
                    </Box>

                    {/* Thumbnails */}
                    <Box
                        sx={{
                            mt: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 1,
                            overflowX: 'auto',
                            pb: 0.5,
                            WebkitOverflowScrolling: 'touch',
                            '&::-webkit-scrollbar': { height: 6 },
                            '&::-webkit-scrollbar-thumb': { borderRadius: 999, bgcolor: 'rgba(0,0,0,0.20)' },
                        }}
                    >
                        {photos.map((u, i) => {
                            const active = i === index;
                            return (
                                <Box
                                    key={`${u}-${i}`}
                                    component="img"
                                    src={u}
                                    alt=""
                                    loading="lazy"
                                    onClick={() => setIndex(i)}
                                    sx={{
                                        width: compact ? { xs: 48, sm: 56 } : { xs: 56, sm: 64 },
                                        height: compact ? { xs: 48, sm: 56 } : { xs: 56, sm: 64 },
                                        objectFit: 'cover',
                                        borderRadius: 1.5,
                                        cursor: 'pointer',
                                        flex: '0 0 auto',
                                        border: active ? '2px solid rgba(0,0,0,0.65)' : '1px solid rgba(0,0,0,0.15)',
                                        opacity: active ? 1 : 0.85,
                                    }}
                                />
                            );
                        })}
                    </Box>
                </>
            )}
        </Box>
    );
}

