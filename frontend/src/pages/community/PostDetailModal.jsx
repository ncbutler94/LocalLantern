import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
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
} from '@mui/material';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import ReportIcon from '@mui/icons-material/Report';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PanToolIcon from '@mui/icons-material/PanTool';
import SearchIcon from '@mui/icons-material/Search';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CloseIcon from '@mui/icons-material/Close';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ReplyRoundedIcon from '@mui/icons-material/ReplyRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import PersonIcon from '@mui/icons-material/Person';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

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
    if (s < 60) return 'just now';

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

/* ---------- category/badge helpers ---------- */
const BADGE = {
    announcement: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion: { label: 'Discussion', color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion': { label: 'Discussion', color: '#2e7d32', Icon: ChatBubbleIcon },
    recommendation: { label: 'Tip', color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips': { label: 'Tip', color: '#fdd835', Icon: LightbulbIcon },
    // Help / Volunteer (Community)
    'help-requests': { label: 'Help Request', color: '#00796b', Icon: PanToolIcon },
    volunteers: { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'lost-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'lost-and-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'public-safety-alerts': { label: 'Safety Alert', color: '#e53935', Icon: ReportIcon },
};

// Some legacy data used a combined volunteer/help category.
// We "derive" the display category based on request_kind for a cleaner UX.
const deriveSplitCategory = (post) => {
    if (!post) return '';
    const rawCat = String(post.category || '').trim().toLowerCase();
    if (!rawCat) return '';

    // New categories are already split
    if (rawCat === 'help-requests' || rawCat === 'volunteers') return rawCat;

    // Legacy / combined buckets
    if (rawCat === 'volunteer-requests' || rawCat === 'volunteer-help' || rawCat === 'volunteer-help-requests') {
        const kind = String(post.request_kind || post.requestKind || '').trim().toLowerCase();
        if (kind === 'help') return 'help-requests';
        if (kind === 'volunteer') return 'volunteers';
        return 'volunteer-requests';
    }

    return rawCat;
};
const buildBadgeFor = (post) => {
    if (!post) return null;
    if (post.category === 'public-safety-alerts') return BADGE['public-safety-alerts'];
    if (post.lost_or_found) {
        return {
            label: post.lost_or_found === 'found' ? 'Found' : 'Lost',
            color: '#fb8c00',
            Icon: SearchIcon,
        };
    }
    const derived = deriveSplitCategory(post);
    return BADGE[derived] || BADGE[post.category] || null;
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

const CONTACT_METHOD_LABELS = {
    either: 'Either',
    text: 'Text',
    call: 'Call',
    email: 'Email',
};

const formatLocalDate = (input) => {
    if (!input) return '';
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.valueOf())) return String(input);
    return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

function HelpVolunteerDetailsPanel({ post, derivedCategory, viewerUser, onRequireLogin, onMessageAuthor, authorUser }) {
    const isHelpRequest = derivedCategory === 'help-requests';
    const isVolunteerOffer = derivedCategory === 'volunteers' || derivedCategory === 'volunteer-requests';

    const helpType = String(post?.help_type || '').trim().toLowerCase();
    const helpTypeOther = String(post?.help_type_other || post?.other_help_type || '').trim();
    const helpTypeLabel = helpType
        ? helpType === 'other'
            ? helpTypeOther
                ? `Other: ${helpTypeOther}`
                : 'Other'
            : HELP_TYPE_LABELS[helpType] || helpType
        : '';

    const neededDate = post?.needed_date || post?.date_needed;
    const neededTime = String(post?.needed_time || '').trim();
    const helpersNeeded = post?.helpers_needed;
    const urgency = String(post?.urgency || '').trim().toLowerCase();
    const availability = String(post?.availability || '').trim();
    const travelRadius = String(post?.travel_radius || '').trim().toLowerCase();
    const contact = String(post?.contact || '').trim();
    const contactMethod = String(post?.contact_method || '').trim().toLowerCase();
    const [copied, setCopied] = useState(false);

    const contactHref = useMemo(() => {
        if (!contact) return '';
        const raw = String(contact).trim();
        if (!raw) return '';
        if (raw.includes('@')) return `mailto:${raw}`;
        const digits = raw.replace(/[^\d+]/g, '');
        if (digits.length >= 7) return `tel:${digits}`;
        return '';
    }, [contact]);

    if (!isHelpRequest && !isVolunteerOffer) return null;

    const dateChipLabel = neededDate
        ? `${isVolunteerOffer ? 'Available' : 'Needed'}: ${formatLocalDate(neededDate)}`
        : '';

    const copyContact = async () => {
        if (!contact) return;
        try {
            await navigator.clipboard.writeText(contact);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore
        }
    };

    const messageAuthor = () => {
        if (!viewerUser) {
            if (typeof onRequireLogin === 'function') onRequireLogin();
            return;
        }
        if (typeof onMessageAuthor === 'function' && authorUser?.id) onMessageAuthor(authorUser);
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                mt: 1.25,
                p: 1.25,
                borderRadius: 2,
                borderColor: 'divider',
                bgcolor: 'background.paper',
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                        {isVolunteerOffer ? 'Volunteer Offer Details' : 'Help Request Details'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {isVolunteerOffer
                            ? 'What this person can help with & how to connect.'
                            : 'What’s needed & how to connect with the requester.'}
                    </Typography>
                </Box>

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
            </Box>

            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {dateChipLabel ? <Chip size="small" label={dateChipLabel} sx={{ fontWeight: 700 }} /> : null}
                {isHelpRequest && urgency ? (
                    <Chip
                        size="small"
                        label={`Urgency: ${URGENCY_LABELS[urgency] || urgency}`}
                        sx={{ fontWeight: 700 }}
                    />
                ) : null}
                {isHelpRequest && helpersNeeded ? (
                    <Chip size="small" label={`Helpers: ${helpersNeeded}`} sx={{ fontWeight: 700 }} />
                ) : null}
                {isHelpRequest && neededTime ? (
                    <Chip size="small" label={`Time: ${neededTime}`} sx={{ fontWeight: 700 }} />
                ) : null}
                {isVolunteerOffer && availability ? (
                    <Chip size="small" label={`Availability: ${availability}`} sx={{ fontWeight: 700 }} />
                ) : null}
                {isVolunteerOffer && travelRadius ? (
                    <Chip
                        size="small"
                        label={`Travel: ${TRAVEL_RADIUS_LABELS[travelRadius] || travelRadius}`}
                        sx={{ fontWeight: 700 }}
                    />
                ) : null}
            </Box>

            {contact ? (
                <>
                    <Divider sx={{ my: 1.25 }} />
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            alignItems: { xs: 'stretch', sm: 'center' },
                            justifyContent: 'space-between',
                            gap: 1.25,
                        }}
                    >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                                Contact
                            </Typography>

                            <Typography variant="body2" sx={{ wordBreak: 'break-word', fontWeight: 800 }}>
                                {contactHref ? (
                                    <Link href={contactHref} underline="hover">
                                        {contact}
                                    </Link>
                                ) : (
                                    contact
                                )}
                            </Typography>

                            {CONTACT_METHOD_LABELS[contactMethod] ? (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    Preferred: {CONTACT_METHOD_LABELS[contactMethod]}
                                </Typography>
                            ) : null}
                        </Box>

                        <Box
                            sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 1,
                                justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                            }}
                        >
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<ContentCopyIcon />}
                                onClick={copyContact}
                                sx={{ fontWeight: 800, borderRadius: 999, px: 2 }}
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </Button>

                            <Button
                                size="small"
                                variant="contained"
                                onClick={messageAuthor}
                                sx={{ fontWeight: 800, borderRadius: 999, px: 2 }}
                            >
                                Message
                            </Button>
                        </Box>
                    </Box>
                </>
            ) : null}
        </Paper>
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

    const openLogin = () => {
        try {
            window.dispatchEvent(new CustomEvent('open-login'));
            window.dispatchEvent(new CustomEvent('open-auth-dialog'));
            window.dispatchEvent(new CustomEvent('open-login-popup'));
        } catch {}
    };

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

    const CommentItem = ({ node, depth = 0 }) => {
        const name = `${node.first_name || ''} ${node.last_name || ''}`.trim() || 'User';
        const ts = node.created_at ? timeAgo(node.created_at) : '';
        const hasReplies = Array.isArray(node.replies) && node.replies.length > 0;
        const open = !!expanded[node.id];

        // text expand state (per comment)
        const [showFull, setShowFull] = useState(false);

        // Robust author detection (for "Author" badge)
        const nameNorm = name.toLowerCase().replace(/\s+/g, ' ').trim();
        const authorId = postAuthor?.id != null ? String(postAuthor.id) : null;
        const authorHandle = (postAuthor?.handle || '').toLowerCase();
        const authorPublicId = postAuthor?.public_id != null ? String(postAuthor.public_id) : null;
        const authorNameNorm = (postAuthor?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const nodeId = node.user_id != null ? String(node.user_id) : null;
        const nodeHandle = (node.handle || '').toLowerCase();
        const nodePub = node.public_id != null ? String(node.public_id) : null;

        const isAuthor =
            (authorId && nodeId && nodeId === authorId) ||
            (authorHandle && nodeHandle && nodeHandle === authorHandle) ||
            (authorPublicId && nodePub && nodePub === authorPublicId) ||
            (!!authorNameNorm && !!nameNorm && authorNameNorm === nameNorm);

        // local state for like/flag UI
        const [liked, setLiked] = useState(Boolean(node.viewer_liked));
        const [likes, setLikes] = useState(Number(node.likes || 0));
        const [flagged, setFlagged] = useState(Boolean(node.viewer_flagged));
        useEffect(() => {
            setLiked(Boolean(node.viewer_liked));
            setLikes(Number(node.likes || 0));
            setFlagged(Boolean(node.viewer_flagged));
        }, [node.viewer_liked, node.viewer_flagged, node.likes]);

        // reply composer
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

        // Replies paging (25 at a time)
        const REPLY_BATCH = 25;
        const [visibleReplies, setVisibleReplies] = useState(REPLY_BATCH);
        useEffect(() => {
            if (open) setVisibleReplies(REPLY_BATCH);
        }, [open]);

        const repliesToShow = hasReplies ? node.replies.slice(0, visibleReplies) : [];

        // Rendered comment text with preview + "more"
        const needsTruncate = !!node.text && node.text.length > COMMENT_PREVIEW_CHARS;
        const displayText =
            !node.text
                ? ''
                : showFull || !needsTruncate
                    ? node.text
                    : `${node.text.slice(0, COMMENT_PREVIEW_CHARS)}...`;

        return (
            <Box sx={{ pl: depth ? 2 : 0, borderLeft: depth ? '2px solid rgba(0,0,0,0.08)' : 'none', ml: depth ? 1 : 0 }}>
                <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 1.25 }}>
                    <Avatar
                        src={hasNodeAvatar ? node.avatar : undefined}
                        sx={{ width: 44, height: 44, cursor: 'pointer' }}
                        onClick={openCard}
                    >
                        {!hasNodeAvatar ? <PersonIcon /> : null}
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 1,
                                flexWrap: 'wrap',
                            }}
                        >
                            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography
                                    variant="subtitle2"
                                    sx={{ fontWeight: 700, cursor: 'pointer' }}
                                    onClick={openCard}
                                    noWrap
                                >
                                    {name}
                                </Typography>

                                {/* Author marker */}
                                {isAuthor && (
                                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 6, height: 6, bgcolor: 'text.secondary', borderRadius: '50%' }} />
                                        <Typography variant="caption" color="text.secondary">
                                            Author
                                        </Typography>
                                    </Box>
                                )}

                                {/* Dot + time next to the name */}
                                {ts ? (
                                    <>
                                        <Box sx={{ width: 4, height: 4, bgcolor: 'text.disabled', borderRadius: '50%' }} />
                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                            {ts}
                                        </Typography>
                                    </>
                                ) : null}
                            </Box>
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
                                {!showFull && needsTruncate && (
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
                            </Typography>
                        ) : null}

                        {/* actions: like / reply / report */}
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
                                startIcon={liked ? <ThumbUpAltIcon /> : <ThumbUpOffAltIcon />}
                                onClick={() => likeComment(node.id, liked, setLiked, setLikes)}
                                sx={{ textTransform: 'none', minWidth: 0 }}
                            >
                                {likes > 0 ? `Like · ${likes}` : 'Like'}
                            </Button>

                            <Button
                                variant="text"
                                size="small"
                                startIcon={<ReplyRoundedIcon />}
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

                        {/* inline reply composer */}
                        {replyOpen && (
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Write a reply…"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={onReplyKeyDown}
                                    inputProps={{ maxLength: COMMENT_MAX_CHARS }}
                                />
                                <IconButton
                                    aria-label="Send reply"
                                    onClick={sendReply}
                                    disabled={!replyText.trim()}
                                    sx={{
                                        bgcolor: 'primary.main',
                                        color: '#fff',
                                        '&:hover': { bgcolor: 'primary.dark' },
                                        alignSelf: 'center',
                                    }}
                                >
                                    <ArrowForwardRoundedIcon />
                                </IconButton>
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
                                onClick={() => toggle(node.id)}
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
                                    bgcolor: 'transparent',
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

                {/* replies (25 at a time) */}
                {hasReplies && open && (
                    <>
                        <Box sx={{ mt: 0.5 }}>
                            {repliesToShow.map((r) => (
                                <CommentItem key={r.id} node={r} depth={depth + 1} />
                            ))}
                        </Box>
                        {node.replies.length > repliesToShow.length && (
                            <Box sx={{ pl: 2, mt: 0.5 }}>
                                <Link
                                    component="button"
                                    type="button"
                                    underline="hover"
                                    onClick={() =>
                                        setVisibleReplies((n) => Math.min(n + REPLY_BATCH, node.replies.length))
                                    }
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
                                <CommentItem key={t.id} node={t} depth={0} />
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

    const photos = useMemo(() => extractPhotos(post || {}), [post]);
    const badgeMeta = useMemo(() => buildBadgeFor(post || {}), [post]);
    const derivedCategory = useMemo(() => deriveSplitCategory(post || {}), [post]);

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
            // if unauthenticated, prompt login
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

    const handleMessage = (targetUser) => {
        const tid = Number(targetUser?.id || userForCard?.id);
        if (!tid) return;
        requireAuth(() => {
            window.dispatchEvent(new CustomEvent('open-message-center', { detail: { userId: tid } }));
        });
    };

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

    return (
        <Box sx={outerSx}>
            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2 }}>
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
                        src={authorAvatar ? authorAvatar : undefined}
                        alt={post.first_name || ''}
                        sx={{ width: 44, height: 44, cursor: 'pointer' }}
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

                            {postDate ? (
                                <>
                                    <Box sx={{ width: 4, height: 4, bgcolor: 'text.disabled', borderRadius: '50%' }} />
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                        {timeAgo(postDate)}
                                    </Typography>
                                </>
                            ) : null}
                        </Box>

                        {/* Second row: @handle (only) */}
                        {post.handle ? (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                sx={{ cursor: 'pointer' }}
                                onClick={openTopCard}
                            >
                                @{post.handle}
                            </Typography>
                        ) : null}
                    </Box>

                    <Box sx={{ ml: 'auto' }}>
                        {(() => {
                            const meta = badgeMeta;
                            return (
                                meta && (
                                    <Chip
                                        size="small"
                                        label={meta.label}
                                        sx={{
                                            bgcolor: meta.color,
                                            color: '#fff',
                                            '& .MuiChip-label': { fontWeight: 600 },
                                            '& .MuiChip-icon': { color: '#fff !important' },
                                        }}
                                        icon={<meta.Icon sx={{ color: '#fff !important' }} />}
                                    />
                                )
                            );
                        })()}
                    </Box>
                </Box>

                {/* Title + Description */}
                {post.title ? (
                    <Typography variant="h5" sx={{ mt: 1.5, wordBreak: 'break-word' }}>
                        {post.title}
                    </Typography>
                ) : null}

                <HelpVolunteerDetailsPanel
                    post={post}
                    derivedCategory={derivedCategory}
                    viewerUser={viewerUser}
                    onRequireLogin={openLoginPopup}
                    onMessageAuthor={handleMessage}
                    authorUser={authorUser}
                />

                {post.description ? (
                    <Typography variant="body1" sx={{ mt: 1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {String(post.description)}
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
                        mt: 1.5,
                        p: 1,
                        borderRadius: 1.5,
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
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
                        sx={{ mt: 2.5, display: 'flex', alignItems: 'flex-start', gap: 1.25, flexWrap: 'nowrap' }}
                    >
                        <Avatar
                            src={avatarUrl ? avatarUrl : undefined}
                            alt={fullName || 'You'}
                            sx={{ width: 48, height: 48, flex: '0 0 auto' }}
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
                                            sx={{
                                                bgcolor: 'primary.main',
                                                color: '#fff',
                                                '&:hover': { bgcolor: 'primary.dark' },
                                                ml: 0.5,
                                            }}
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
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>
                        You need to{' '}
                        <Link href="/login" onClick={openLoginPopup} underline="hover">
                            log in
                        </Link>{' '}
                        to comment.
                    </Typography>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Comments */}
                <RedditComments
                    postId={post.id}
                    refreshKey={commentsRefreshKey}
                    initialPageSize={50} // 50 top-level comments per batch
                    viewer={viewerUser}
                    postAuthor={postAuthor}
                    onOpenUserCard={handleOpenUserCard}
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
                onMessage={handleMessage}
                onViewProfile={handleViewProfile}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={viewerUser} post={post} />
        </Box>
    );
}

/* ---------- Local, lightweight carousel ---------- */
function Carousel({ photos }) {
    const [index, setIndex] = useState(0);

    const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length);
    const next = () => setIndex((i) => (i + 1) % photos.length);

    const current = photos[index];

    return (
        <Box sx={{ position: 'relative', mt: 1.5 }}>
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
                            bgcolor: 'rgba(0,0,0,0.5)',
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
                            bgcolor: 'rgba(0,0,0,0.5)',
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
                            bgcolor: 'rgba(0,0,0,0.7)',
                            color: '#fff',
                            fontSize: 12,
                        }}
                    >
                        {index + 1} / {photos.length}
                    </Box>
                </>
            )}
        </Box>
    );
}
