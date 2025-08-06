// src/components/SidePanel/Community/PostDetailModal.jsx
// =============================================================================
// 2025‑08‑08  ✅ Replies added (no layout removed)
// 2025‑08‑11  🛠  Like‑state & counter fixes
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useRef, Fragment, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
    Dialog,
    DialogContent,
    Box,
    Paper,
    Typography,
    Avatar,
    Button,
    IconButton,
    TextField,
    Link,
} from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon       from '@mui/icons-material/Favorite';
import CommentIcon        from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon          from '@mui/icons-material/Share';
import SendIcon           from '@mui/icons-material/Send';
import CloseIcon          from '@mui/icons-material/Close';
import ArrowBackIosNew    from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIos    from '@mui/icons-material/ArrowForwardIos';

import CampaignIcon  from '@mui/icons-material/Campaign';
import ChatIcon      from '@mui/icons-material/ChatBubble';
import ReportIcon    from '@mui/icons-material/Report';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PanToolIcon   from '@mui/icons-material/PanTool';
import SearchIcon    from '@mui/icons-material/Search';

import { useAuthModal } from '../../../contexts/AuthModalContext';

/* ---------- helpers ---------- */
const MAX_LEN = 1000;
const safeNum = (v) => (Number.isFinite(+v) ? +v : 0);
const toBool  = (v) =>
    v === true ||
    v === 1 ||
    v === '1' ||
    v === 't' ||
    v === 'T' ||
    v === 'true' ||
    v === 'TRUE';

const timeAgo = (d = '') => {
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

/* ---------- badge map (unchanged) ---------- */
const BADGE = {
    announcement:            { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements:           { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion:              { label: 'Discussion',   color: '#2e7d32', Icon: ChatIcon },
    'general-discussion':    { label: 'Discussion',   color: '#2e7d32', Icon: ChatIcon },
    recommendation:          { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips':  { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    volunteer:               { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help':        { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests':    { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests':{label:'Volunteer',     color:'#0097a7', Icon: PanToolIcon },
    'lost-found':            { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'public-safety-alerts':  { label: 'Alert',        color: '#e53935', Icon: ReportIcon },
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
Pill.propTypes = { label: PropTypes.string, Icon: PropTypes.elementType, color: PropTypes.string };

/* tiny three‑dot loader */
const LoadingDots = () => (
    <Box
        sx={{
            display: 'flex',
            gap: 1,
            '@keyframes b': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1.0)' } },
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
);

/* 1‑4 image collage (unchanged) */
function Collage({ pics, onClick, onReady }) {
    const n = pics.length;
    const tpl = useMemo(
        () =>
            n === 1
                ? { c: '1fr', r: 'auto' }
                : n === 2
                    ? { c: '1fr 1fr', r: 'auto' }
                    : n === 3
                        ? { c: '2fr 1fr', r: '1fr 1fr' }
                        : { c: '1fr 1fr', r: '1fr 1fr' },
        [n],
    );
    const pos = (i) =>
        n !== 3
            ? {}
            : i === 0
                ? { gridRow: '1 / span 2', gridColumn: '1' }
                : i === 1
                    ? { gridRow: '1', gridColumn: '2' }
                    : { gridRow: '2', gridColumn: '2' };

    const once = useRef(false);
    const done = () => {
        if (!once.current) {
            once.current = true;
            onReady?.();
        }
    };

    return (
        <Box
            sx={{
                display: 'grid',
                gap: 0.5,
                gridTemplateColumns: tpl.c,
                gridTemplateRows: tpl.r,
                width: '100%',
            }}
        >
            {pics.slice(0, 4).map((src, i) => (
                <Box
                    key={src}
                    sx={{
                        position: 'relative',
                        width: '100%',
                        pb: n === 1 ? '66.66%' : '100%',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        borderRadius: 2,
                        ...pos(i),
                    }}
                    onClick={() => onClick(i)}
                >
                    <Box
                        component="img"
                        src={src}
                        alt=""
                        onLoad={done}
                        onError={done}
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                </Box>
            ))}
        </Box>
    );
}
Collage.propTypes = {
    pics: PropTypes.arrayOf(PropTypes.string).isRequired,
    onClick: PropTypes.func.isRequired,
    onReady: PropTypes.func,
};

/* ───────────────── component ───────────────── */
export default function PostDetailModal({ open, post, onClose, user, currentUser }) {
    const { open: openAuth } = useAuthModal();
    const viewer = user || currentUser || null;

    /* -------------------------------- unpack -------------------------------- */
    const {
        id: postId,
        first_name = '',
        last_name = '',
        avatar_url = '',
        date_created = '',
        title = '',
        description = '',
        category = '',
        lost_or_found = '',
        photos = [],
        likesCount: likesRawProp = 0,
        viewerLiked: viewerLikedProp = 0,
    } = post ?? {};

    /* -------------------------------- state -------------------------------- */
    const [likes, setLikes] = useState(0);
    const [liked, setLiked] = useState(false);

    /* keep state in sync whenever a different post is opened */
    useEffect(() => {
        setLikes(safeNum(likesRawProp));
        setLiked(toBool(viewerLikedProp));
    }, [likesRawProp, viewerLikedProp, postId]);

    /* comment / reply state (unchanged) */
    const [comments, setComments] = useState([]);
    const [loadingC, setLoadingC] = useState(false);
    const [showReplies, setShowReplies] = useState(() => new Set());
    const [replyEditorOpen, setReplyEditorOpen] = useState(() => new Set());
    const [replyDrafts, setReplyDrafts] = useState({});

    /* other state */
    const [imgReady, setImgReady] = useState(photos.length === 0);
    const [idx, setIdx] = useState(0);
    const [lightbox, setLightbox] = useState(false);
    const [expanded, setExpanded] = useState(() => new Set());
    const [comment, setComment] = useState('');
    const inputRef = useRef(null);

    /* -------------------------- fetch comments -------------------------- */
    useEffect(() => {
        if (!open || !postId) return;
        (async () => {
            setLoadingC(true);
            try {
                const r = await fetch(`/api/posts/${postId}/comments?category=community_post`, {
                    credentials: 'include',
                });
                setComments(await r.json());
            } catch (e) {
                console.error(e);
            }
            setLoadingC(false);
        })();
    }, [open, postId]);

    /* helpers to group replies */
    const repliesByParent = useMemo(() => {
        const m = new Map();
        comments.forEach((c) => {
            if (c.parent_id) {
                if (!m.has(c.parent_id)) m.set(c.parent_id, []);
                m.get(c.parent_id).push(c);
            }
        });
        return m;
    }, [comments]);
    const topLevel = comments.filter((c) => !c.parent_id);

    /* ------------------------------ likes ------------------------------ */
    const toggleLike = async () => {
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        const next = !liked;
        setLiked(next);
        setLikes((l) => Math.max(0, l + (next ? 1 : -1)));
        try {
            const res = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: 'community_post' }),
                credentials: 'include',
            });
            if (res.status === 401) {
                openAuth({ redirectTo: window.location.href });
                return;
            }
            const j = await res.json();
            setLikes(safeNum(j.likesCount));
            setLiked(toBool(j.liked));
        } catch (e) {
            console.error(e);
            /* revert optimistic update on failure */
            setLiked(!next);
            setLikes((l) => Math.max(0, l + (next ? -1 : 1)));
        }
    };

    /* ------------------------------ comments ------------------------------ */
    const submitComment = async () => {
        const txt = comment.trim();
        if (!txt) return;
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        try {
            const r = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: txt }),
                credentials: 'include',
            });
            if (r.status === 401) {
                openAuth({ redirectTo: window.location.href });
                return;
            }
            const newC = await r.json();
            setComments((a) => [...a, newC]);
            setComment('');
            inputRef.current?.focus();
        } catch (e) {
            console.error(e);
        }
    };

    const sendReply = async (parentId) => {
        const txt = (replyDrafts[parentId] || '').trim();
        if (!txt) return;
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        try {
            const r = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: txt, parent_id: parentId }),
                credentials: 'include',
            });
            if (r.status === 401) {
                openAuth({ redirectTo: window.location.href });
                return;
            }
            const newReply = await r.json();
            setComments((a) => [...a, newReply]);
            setReplyDrafts((d) => ({ ...d, [parentId]: '' }));
            setReplyEditorOpen((s) => {
                const n = new Set(s);
                n.delete(parentId);
                return n;
            });
            setShowReplies((s) => new Set(s).add(parentId));
        } catch (e) {
            console.error(e);
        }
    };

    /* badge */
    const pillMeta = lost_or_found
        ? { label: lost_or_found === 'found' ? 'Found' : 'Lost', color: '#fb8c00', Icon: SearchIcon }
        : BADGE[category] ?? { label: category || 'Other', color: '#777', Icon: ReportIcon };

    const busy = loadingC || !imgReady;
    if (!open || !post) return null;

    /* -------- comment component w/ replies -------- (unchanged) */
    const CommentBlock = ({ c, level = 0 }) => {
        const children = repliesByParent.get(c.id) || [];
        const show = showReplies.has(c.id);
        const replyOpen = replyEditorOpen.has(c.id);
        const long = (c.content ?? '').length > 200;
        const openLong = expanded.has(c.id);
        const display = openLong || !long ? c.content : `${c.content.slice(0, 200)}…`;

        return (
            <Box sx={{ display: 'flex', gap: 1.25, mb: 2, ml: level ? 4 : 0 }}>
                <Avatar src={c.avatar_url}>{c.first_name?.[0]}</Avatar>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">
                        {c.first_name} {c.last_name}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                        {display}
                        {long && (
                            <Button
                                size="small"
                                sx={{ ml: 0.5, p: 0, minWidth: 0, textTransform: 'none' }}
                                onClick={() =>
                                    setExpanded((s) => {
                                        const n = new Set(s);
                                        n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                                        return n;
                                    })
                                }
                            >
                                {openLong ? 'less' : 'more'}
                            </Button>
                        )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {timeAgo(c.created_at)}
                    </Typography>

                    {/* tiny action row */}
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        {viewer && (
                            <Button
                                size="small"
                                sx={{ p: 0, minWidth: 0, textTransform: 'none' }}
                                onClick={() =>
                                    setReplyEditorOpen((s) => {
                                        const n = new Set(s);
                                        n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                                        return n;
                                    })
                                }
                            >
                                Reply
                            </Button>
                        )}
                        {children.length > 0 && (
                            <Button
                                size="small"
                                sx={{ p: 0, minWidth: 0, textTransform: 'none' }}
                                onClick={() =>
                                    setShowReplies((s) => {
                                        const n = new Set(s);
                                        n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                                        return n;
                                    })
                                }
                            >
                                {show
                                    ? 'Hide replies'
                                    : `View ${children.length} ${children.length === 1 ? 'reply' : 'replies'}`}
                            </Button>
                        )}
                    </Box>

                    {/* reply composer */}
                    {replyOpen && viewer && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
                            <Avatar src={viewer.avatar_url} sx={{ width: 28, height: 28 }}>
                                {viewer.first_name?.[0]}
                            </Avatar>
                            <Box
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    border: 1,
                                    borderColor: 'divider',
                                    borderRadius: 2,
                                    px: 1,
                                }}
                            >
                                <TextField
                                    multiline
                                    fullWidth
                                    variant="standard"
                                    placeholder="Write a reply"
                                    InputProps={{ disableUnderline: true }}
                                    minRows={1}
                                    maxRows={3}
                                    value={replyDrafts[c.id] || ''}
                                    onChange={(e) =>
                                        setReplyDrafts((d) => ({
                                            ...d,
                                            [c.id]: e.target.value.slice(0, MAX_LEN),
                                        }))
                                    }
                                    sx={{ flex: 1 }}
                                />
                                <IconButton
                                    color="primary"
                                    disabled={!(replyDrafts[c.id] || '').trim()}
                                    onClick={() => sendReply(c.id)}
                                >
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </Box>
                    )}

                    {/* nested replies */}
                    {show && children.map((r) => <CommentBlock key={r.id} c={r} level={1} />)}
                </Box>
            </Box>
        );
    };
    CommentBlock.propTypes = { c: PropTypes.object.isRequired, level: PropTypes.number };

    /* ------------------------------ RENDER ------------------------------ */
    return (
        <Dialog
            open={open}
            onClose={(_, r) => r !== 'backdropClick' && onClose()}
            fullWidth
            maxWidth="xl"
            PaperProps={{ sx: { height: { xs: '90vh', md: '80vh' }, overflow: 'hidden' } }}
        >
            {/* X close */}
            <IconButton
                onClick={onClose}
                sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 3,
                    bgcolor: 'rgba(0,0,0,0.05)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                }}
            >
                <CloseIcon />
            </IconButton>

            <DialogContent
                sx={{
                    p: 0,
                    height: '100%',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 380px' },
                    gridTemplateAreas: { xs: `"post" "comments"`, md: `"post comments"` },
                    position: 'relative',
                }}
            >
                {busy && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            bgcolor: 'rgba(255,255,255,0.92)',
                            backdropFilter: 'blur(2px)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            zIndex: 2,
                        }}
                    >
                        <LoadingDots />
                    </Box>
                )}

                {/* post pane (unchanged layout) */}
                <Box sx={{ gridArea: 'post', overflowY: 'auto', px: 5, py: { xs: 3, md: 4 } }}>
                    <Box sx={{ maxWidth: '100%', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* author */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar src={avatar_url}>{first_name[0]}</Avatar>
                            <Box>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    {first_name} {last_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {timeAgo(date_created)}
                                </Typography>
                            </Box>
                        </Box>

                        <Pill {...pillMeta} />

                        {title && (
                            <Typography variant="h5" fontWeight={700}>
                                {title}
                            </Typography>
                        )}

                        <Typography
                            variant="body1"
                            sx={{ whiteSpace: 'pre-line', mt: 1, mb: 2, pl: 0.5, pr: 0.5 }}
                        >
                            {description}
                        </Typography>

                        {photos.length > 0 && (
                            <Box sx={{ mt: 1 }}>
                                <Collage
                                    pics={photos}
                                    onClick={(i) => {
                                        setIdx(i);
                                        setLightbox(true);
                                    }}
                                    onReady={() => setImgReady(true)}
                                />
                            </Box>
                        )}
                    </Box>
                </Box>

                {/* comments + replies pane */}
                <Paper
                    elevation={0}
                    sx={{
                        gridArea: 'comments',
                        bgcolor: 'grey.50',
                        borderLeft: { md: '2px solid' },
                        borderColor: 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                    }}
                >
                    <Box sx={{ px: 2, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                            Comments ({topLevel.length})
                        </Typography>
                    </Box>

                    <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1 }}>
                        {loadingC ? (
                            <LoadingDots />
                        ) : topLevel.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                No comments yet.
                            </Typography>
                        ) : (
                            topLevel.map((c) => <CommentBlock key={c.id} c={c} />)
                        )}
                    </Box>

                    {/* action bar (likes) */}
                    <Box
                        sx={{
                            borderTop: 1,
                            borderColor: 'divider',
                            px: 2,
                            py: 1,
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                            bgcolor: 'background.paper',
                        }}
                    >
                        <IconButton onClick={toggleLike}>
                            {liked ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
                        </IconButton>
                        <Typography variant="caption">{likes}</Typography>

                        <IconButton onClick={() => document.getElementById('comment-input')?.focus()}>
                            <CommentIcon />
                        </IconButton>
                        <Typography variant="caption">{topLevel.length}</Typography>

                        <IconButton
                            onClick={() =>
                                navigator.share?.({
                                    title,
                                    text: description.slice(0, 140),
                                    url: window.location.href,
                                })
                            }
                        >
                            <ShareIcon />
                        </IconButton>
                        <Typography variant="caption">0</Typography>
                    </Box>

                    {/* composer (unchanged) */}
                    <Box
                        sx={{
                            borderTop: 1,
                            borderColor: 'divider',
                            p: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                            bgcolor: 'background.paper',
                        }}
                    >
                        {viewer ? (
                            <Fragment>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                    <Avatar src={viewer.avatar_url}>{viewer.first_name?.[0]}</Avatar>
                                    <Box
                                        sx={{
                                            flex: 1,
                                            display: 'flex',
                                            alignItems: 'flex-end',
                                            border: 1,
                                            borderColor: 'divider',
                                            borderRadius: 2,
                                            px: 1,
                                        }}
                                    >
                                        <TextField
                                            id="comment-input"
                                            multiline
                                            fullWidth
                                            variant="standard"
                                            placeholder="Leave a comment"
                                            InputProps={{ disableUnderline: true }}
                                            inputRef={inputRef}
                                            value={comment}
                                            onChange={(e) => setComment(e.target.value.slice(0, MAX_LEN))}
                                            minRows={1}
                                            maxRows={4}
                                            sx={{ flex: 1 }}
                                        />
                                        <IconButton
                                            color="primary"
                                            disabled={comment.trim() === ''}
                                            onClick={submitComment}
                                        >
                                            <SendIcon />
                                        </IconButton>
                                    </Box>
                                </Box>
                                {comment && (
                                    <Typography variant="caption" align="right" sx={{ pr: 1 }}>
                                        {MAX_LEN - comment.length} characters left
                                    </Typography>
                                )}
                            </Fragment>
                        ) : (
                            <Typography variant="body2">
                                <Link
                                    component="button"
                                    onClick={() => openAuth({ redirectTo: window.location.href })}
                                    sx={{ fontWeight: 600 }}
                                >
                                    Log in
                                </Link>{' '}
                                to leave a comment.
                            </Typography>
                        )}
                    </Box>
                </Paper>
            </DialogContent>

            {/* light‑box (unchanged) */}
            <Dialog open={lightbox} onClose={() => setLightbox(false)} maxWidth="lg" fullWidth>
                <DialogContent sx={{ p: 0, bgcolor: 'grey.900', position: 'relative' }}>
                    <IconButton
                        onClick={() => setLightbox(false)}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            color: '#fff',
                            bgcolor: 'rgba(0,0,0,0.45)',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                        }}
                    >
                        <CloseIcon sx={{ fontSize: 34 }} />
                    </IconButton>
                    {photos.length > 0 && (
                        <Box
                            sx={{
                                position: 'relative',
                                height: '80vh',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Box
                                component="img"
                                src={photos[idx]}
                                alt=""
                                sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            />
                            {photos.length > 1 && (
                                <>
                                    <IconButton
                                        size="large"
                                        disabled={idx === 0}
                                        onClick={() => setIdx((i) => i - 1)}
                                        sx={{
                                            position: 'absolute',
                                            left: 16,
                                            color: '#fff',
                                            bgcolor: 'rgba(0,0,0,0.45)',
                                            '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                                        }}
                                    >
                                        <ArrowBackIosNew />
                                    </IconButton>
                                    <IconButton
                                        size="large"
                                        disabled={idx === photos.length - 1}
                                        onClick={() => setIdx((i) => i + 1)}
                                        sx={{
                                            position: 'absolute',
                                            right: 16,
                                            color: '#fff',
                                            bgcolor: 'rgba(0,0,0,0.45)',
                                            '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                                        }}
                                    >
                                        <ArrowForwardIos />
                                    </IconButton>
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}

PostDetailModal.propTypes = {
    open: PropTypes.bool.isRequired,
    post: PropTypes.object,
    onClose: PropTypes.func.isRequired,
    user: PropTypes.object,
    currentUser: PropTypes.object,
};
