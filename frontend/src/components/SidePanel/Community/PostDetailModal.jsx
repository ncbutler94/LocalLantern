// src/components/SidePanel/Community/PostDetailModal.jsx
// =============================================================================
// 2025-08-06  ✨  Comment likes + “Most Liked / Newest” sort
//             • <IconButton> ♥ on every comment & reply
//             • optimistic UI with login gate identical to post-like
//             • ?sort=popular|newest query; default popular
//             • small selector above thread
// -----------------------------------------------------------------------------

import React, {
    useState,
    useEffect,
    useRef,
    useMemo,
    Fragment,
} from 'react';
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
    MenuItem,
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


/* ───────────────── helpers ───────────────── */
const MAX_LEN = 1_000;
const safeNum = (v) => (Number.isFinite(+v) ? +v : 0);
const toBool  = (v) =>
    v === true || v === 1 || v === '1' || v === 't' ||
    v === 'T'   || v === 'true' || v === 'TRUE';

const timeAgo = (d = '') => {
    const diff = Date.now() - new Date(d).getTime();
    const s  = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m  = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h  = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d2 = Math.floor(h / 24);
    if (d2 < 30) return `${d2}d ago`;
    const mo = Math.floor(d2 / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};

/* ───────────────── badge map ───────────────── */
const BADGE = {
    announcement:              { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion:                { label: 'Discussion',   color: '#2e7d32', Icon: ChatIcon },
    recommendation:            { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    volunteer:                 { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help':          { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests':      { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests': { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'lost-found':              { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'public-safety-alerts':    { label: 'Alert',        color: '#e53935', Icon: ReportIcon },
};

const Pill = ({ label, Icon, color }) => (
    <Box
        sx={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            0.5,
            px:             1,
            py:             0.25,
            bgcolor:        color,
            color:          '#fff',
            borderRadius:   12,
            fontSize:       '0.75rem',
            fontWeight:     600,
            width:          'max-content',
        }}
    >
        <Icon sx={{ fontSize: 14 }} /> {label}
    </Box>
);
Pill.propTypes = { label: PropTypes.string, Icon: PropTypes.elementType, color: PropTypes.string };

/* tiny loader */
const LoadingDots = () => (
    <Box sx={{
        display: 'flex', gap: 1,
        '@keyframes b': {
            '0%,80%,100%': { transform: 'scale(0)' },
            '40%':         { transform: 'scale(1)' },
        },
    }}>
        {[0, 1, 2].map(i => (
            <Box key={i} sx={{
                width:      14,
                height:     14,
                borderRadius: '50%',
                bgcolor:    'primary.main',
                animation:  'b 1.4s infinite ease-in-out',
                animationDelay: `${i * 0.2}s`,
            }} />
        ))}
    </Box>
);

/* collage */
const Collage = ({ pics, onClick }) => {
    const n   = pics.length;
    const tpl = useMemo(
        () =>
            n === 1 ? { c: '1fr',     r: 'auto'     }
                : n === 2 ? { c: '1fr 1fr', r: 'auto'     }
                    : n === 3 ? { c: '2fr 1fr', r: '1fr 1fr' }
                        :           { c: '1fr 1fr', r: '1fr 1fr' },
        [n],
    );
    const pos = (i) =>
        n !== 3 ? {} :
            i === 0 ? { gridRow: '1 / span 2', gridColumn: '1' } :
                i === 1 ? { gridRow: '1', gridColumn: '2' } :
                    { gridRow: '2', gridColumn: '2' };
    return (
        <Box
            sx={{
                display:             'grid',
                gap:                 0.5,
                gridTemplateColumns: tpl.c,
                gridTemplateRows:    tpl.r,
                width:               '100%',
            }}
        >
            {pics.slice(0, 4).map((src, i) => (
                <Box
                    key={src}
                    onClick={() => onClick(i)}
                    sx={{
                        position:   'relative',
                        width:      '100%',
                        pb:         n === 1 ? '66.66%' : '100%',
                        overflow:   'hidden',
                        cursor:     'pointer',
                        borderRadius: 2,
                        ...pos(i),
                    }}
                >
                    <Box
                        component="img"
                        src={src}
                        alt=""
                        sx={{
                            position: 'absolute',
                            inset:    0,
                            width:    '100%',
                            height:   '100%',
                            objectFit: 'cover',
                        }}
                    />
                </Box>
            ))}
        </Box>
    );
};
Collage.propTypes = { pics: PropTypes.array.isRequired, onClick: PropTypes.func.isRequired };

/* ───────────────── component ───────────────── */
export default function PostDetailModal({ open, post, onClose, user, currentUser }) {
    const { open: openAuth } = useAuthModal();
    const viewer = user || currentUser || null;

    /* unpack post */
    const {
        id:            postId,
        first_name = '', last_name = '', avatar_url = '',
        date_created = '', title = '', description = '',
        category = '',   lost_or_found = '', photos = [],
        likesCount: likesRaw = 0, viewerLiked: viewerLikedRaw = 0,
    } = post ?? {};

    /* state */
    const [likes, setLikes]               = useState(0);
    const [liked, setLiked]               = useState(false);

    const [comments, setComments]         = useState([]);
    const [loadingC, setLoadingC]         = useState(false);
    const [sortKey, setSortKey]           = useState('popular');        // <─ NEW
    const [showReplies, setShowReplies]   = useState(() => new Set());
    const [replyOpen, setReplyOpen]       = useState(() => new Set());

    const [validPhotos, setValidPhotos]   = useState([]);
    const [imgChecked, setImgChecked]     = useState(false);

    const [idx, setIdx]                   = useState(0);
    const [lightbox, setLightbox]         = useState(false);
    const [comment, setComment]           = useState('');
    const inputRef                         = useRef(null);

    /* like sync (post) */
    useEffect(() => {
        setLikes(safeNum(likesRaw));
        setLiked(toBool(viewerLikedRaw));
    }, [likesRaw, viewerLikedRaw, postId]);

    /* pre-validate images */
    useEffect(() => {
        let cancel = false;
        if (!photos || photos.length === 0) {
            setValidPhotos([]);
            setImgChecked(true);
            return;
        }
        setImgChecked(false);
        let ok = [], processed = 0;
        photos.forEach((src) => {
            const img = new Image();
            const done = () => {
                if (++processed === photos.length && !cancel) {
                    setValidPhotos(ok);
                    setImgChecked(true);
                }
            };
            img.onload  = () => { ok.push(src); done(); };
            img.onerror = done;
            img.src     = src;
        });
        return () => { cancel = true; };
    }, [photos, postId]);

    /* fetch comments */
    useEffect(() => {
        if (!open || !postId) return;
        (async () => {
            setLoadingC(true);
            try {
                const r = await fetch(
                    `/api/posts/${postId}/comments?category=community_post&sort=${sortKey}`,
                    { credentials: 'include' },
                );
                setComments(await r.json());
            } catch (e) { console.error(e); }
            setLoadingC(false);
        })();
    }, [open, postId, sortKey]);

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

    /* like handler (post) */
    const toggleLike = async () => {
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        const next = !liked;
        setLiked(next);
        setLikes((l) => Math.max(0, l + (next ? 1 : -1)));
        try {
            const r = await fetch(`/api/posts/${postId}/like`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ category: 'community_post' }),
                credentials: 'include',
            });
            if (r.status === 401) { openAuth({ redirectTo: window.location.href }); return; }
            const j = await r.json();
            setLikes(safeNum(j.likesCount));
            setLiked(toBool(j.liked));
        } catch (e) {
            console.error(e);
            setLiked(!next);
            setLikes((l) => Math.max(0, l + (next ? -1 : 1)));
        }
    };

    /* toggle comment like (NEW) */
    const toggleCommentLike = async (commentId) => {
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        setComments((cs) =>
            cs.map((c) =>
                c.id === commentId
                    ? {
                        ...c,
                        viewerLiked: !c.viewerLiked,
                        likesCount:  Math.max(0, c.likesCount + (c.viewerLiked ? -1 : 1)),
                    }
                    : c,
            ),
        );
        try {
            const r = await fetch(`/api/posts/comments/${commentId}/like`, {
                method: 'POST',
                credentials: 'include',
            });
            if (r.status === 401) { openAuth({ redirectTo: window.location.href }); return; }
            const j = await r.json();
            setComments((cs) =>
                cs.map((c) =>
                    c.id === commentId
                        ? {
                            ...c,
                            viewerLiked: j.liked,
                            likesCount:  safeNum(j.likesCount),
                        }
                        : c,
                ),
            );
        } catch (e) { console.error(e); }
    };

    /* new comment */
    const postComment = async () => {
        const txt = comment.trim();
        if (!txt) return;
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        try {
            const r = await fetch(`/api/posts/${postId}/comments`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ content: txt, category: 'community_post' }),
                credentials: 'include',
            });
            if (r.status === 401) { openAuth({ redirectTo: window.location.href }); return; }
            const newC = await r.json();
            setComments((c) => [newC, ...c]);
            setComment('');
            inputRef.current?.focus();
        } catch (e) { console.error(e); }
    };

    /* reply submission */
    const postReply = async (parentId, txt, resetDraft) => {
        const content = txt.trim();
        if (!content) return;
        if (!viewer) return openAuth({ redirectTo: window.location.href });
        try {
            const r = await fetch(`/api/posts/${postId}/comments`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ content, parent_id: parentId, category: 'community_post' }),
                credentials: 'include',
            });
            if (r.status === 401) { openAuth({ redirectTo: window.location.href }); return; }
            const newR = await r.json();
            setComments((c) => [newR, ...c]);
            resetDraft('');
            setReplyOpen((s) => { const n = new Set(s); n.delete(parentId); return n; });
            setShowReplies((s) => new Set(s).add(parentId));
        } catch (e) { console.error(e); }
    };

    /* badge props */
    const pillMeta = lost_or_found
        ? { label: lost_or_found === 'found' ? 'Found' : 'Lost', color: '#fb8c00', Icon: SearchIcon }
        : BADGE[category] ?? { label: category || 'Other', color: '#777', Icon: ReportIcon };

    /* comment component */
    const CommentBlock = ({ c, level = 0 }) => {
        const kids   = repliesByParent.get(c.id) || [];
        const show   = showReplies.has(c.id);
        const editor = replyOpen.has(c.id);
        const [draft, setDraft] = useState('');

        return (
            <Box sx={{ display: 'flex', gap: 1.25, mb: 2, ml: level ? 4 : 0 }}>
                <Avatar src={c.avatar_url}>{c.first_name?.[0]}</Avatar>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">
                        {c.first_name} {c.last_name}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {c.content}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {timeAgo(c.created_at)}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                        {/* like button (NEW) */}
                        <IconButton
                            size="small"
                            onClick={() => toggleCommentLike(c.id)}
                        >
                            {c.viewerLiked ? (
                                <FavoriteIcon color="error" fontSize="small" />
                            ) : (
                                <FavoriteBorderIcon fontSize="small" />
                            )}
                        </IconButton>
                        <Typography variant="caption">{c.likesCount}</Typography>

                        <Button
                            size="small"
                            sx={{ p: 0, minWidth: 0, textTransform: 'none' }}
                            onClick={() => {
                                if (!viewer) {
                                    openAuth({ redirectTo: window.location.href });
                                    return;
                                }
                                setReplyOpen((s) => {
                                    const n = new Set(s);
                                    n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                                    return n;
                                });
                            }}
                        >
                            Reply
                        </Button>

                        {kids.length > 0 && (
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
                                {show ? `Hide replies (${kids.length})` : `Replies (${kids.length})`}
                            </Button>
                        )}
                    </Box>

                    {editor && viewer && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                            <Avatar src={viewer.avatar_url} sx={{ width: 28, height: 28 }}>
                                {viewer.first_name?.[0]}
                            </Avatar>
                            <Box
                                sx={{
                                    flex:          1,
                                    display:       'flex',
                                    alignItems:    'flex-start',
                                    border:        1,
                                    borderColor:   'divider',
                                    borderRadius:  2,
                                    px:            1,
                                }}
                            >
                                <textarea
                                    value={draft}
                                    placeholder="Write a reply"
                                    rows={1}
                                    onChange={(e) =>
                                        setDraft(e.target.value.slice(0, MAX_LEN))
                                    }
                                    style={{
                                        flex:       1,
                                        font:       'inherit',
                                        border:     'none',
                                        outline:    'none',
                                        resize:     'none',
                                        padding:    '6px 0',
                                        lineHeight: '1.5',
                                        background: 'transparent',
                                    }}
                                />
                                <IconButton
                                    color="primary"
                                    disabled={draft.trim() === ''}
                                    onClick={() => postReply(c.id, draft, setDraft)}
                                >
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </Box>
                    )}

                    {show && kids.map((k) => (
                        <CommentBlock key={k.id} c={k} level={1} />
                    ))}
                </Box>
            </Box>
        );
    };
    CommentBlock.propTypes = { c: PropTypes.object.isRequired, level: PropTypes.number };

    if (!open || !post) return null;
    const busy = loadingC || !imgChecked;

    return (
        <Dialog
            open={open}
            onClose={(_, r) => r !== 'backdropClick' && onClose()}
            maxWidth="xl"
            fullWidth
            PaperProps={{ sx: { height: { xs: '90vh', md: '80vh' }, overflow: 'hidden' } }}
        >
            <IconButton
                onClick={onClose}
                sx={{
                    position:  'absolute',
                    top:       8,
                    right:     8,
                    zIndex:    3,
                    bgcolor:   'rgba(0,0,0,0.05)',
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
                    gridTemplateColumns: {
                        xs: '1fr',
                        md: 'minmax(0,1fr) 380px',
                    },
                    gridTemplateAreas: {
                        xs: `"post" "comments"`,
                        md: `"post comments"`,
                    },
                    position: 'relative',
                }}
            >
                {busy && (
                    <Box
                        sx={{
                            position:         'absolute',
                            inset:             0,
                            bgcolor:           'rgba(255,255,255,0.92)',
                            backdropFilter:   'blur(2px)',
                            display:          'flex',
                            alignItems:       'center',
                            justifyContent:   'center',
                            zIndex:            2,
                        }}
                    >
                        <LoadingDots />
                    </Box>
                )}

                {/* post column -------------------------------------------------- */}
                <Box
                    sx={{
                        gridArea:     'post',
                        overflowY:    'auto',
                        px:           5,
                        py:           { xs: 3, md: 4 },
                    }}
                >
                    <Box
                        sx={{
                            maxWidth:        '100%',
                            mx:              'auto',
                            display:         'flex',
                            flexDirection:   'column',
                            gap:             validPhotos.length ? 3 : 2,
                        }}
                    >
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

                        {description && (
                            <Typography
                                variant="body1"
                                sx={{ whiteSpace: 'pre-line' }}
                            >
                                {description}
                            </Typography>
                        )}

                        {validPhotos.length > 0 && (
                            <Collage
                                pics={validPhotos}
                                onClick={(i) => {
                                    setIdx(i);
                                    setLightbox(true);
                                }}
                            />
                        )}
                    </Box>
                </Box>

                {/* comments column --------------------------------------------- */}
                <Paper
                    elevation={0}
                    sx={{
                        gridArea:    'comments',
                        bgcolor:     'grey.50',
                        borderLeft:  { md: '2px solid' },
                        borderColor: 'divider',
                        display:     'flex',
                        flexDirection: 'column',
                        minHeight:   0,
                    }}
                >
                    {/* header + sort selector */}
                    <Box
                        sx={{
                            px: 2,
                            pt: 2,
                            pb: 1,
                            borderBottom: 1,
                            borderColor:  'divider',
                            display:      'flex',
                            alignItems:   'center',
                            gap:          2,
                        }}
                    >
                        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
                            Comments ({topLevel.length})
                        </Typography>

                        <TextField
                            select
                            size="small"
                            variant="standard"
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value)}
                            sx={{ minWidth: 120 }}
                        >
                            <MenuItem value="popular">Most Liked</MenuItem>
                            <MenuItem value="newest">Newest</MenuItem>
                        </TextField>
                    </Box>

                    {/* thread */}
                    <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1 }}>
                        {loadingC ? (
                            <LoadingDots />
                        ) : topLevel.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No comments yet.
                            </Typography>
                        ) : (
                            topLevel.map((c) => <CommentBlock key={c.id} c={c} />)
                        )}
                    </Box>

                    {/* action bar ------------------------------------------------ */}
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
                            {liked ? (
                                <FavoriteIcon color="error" />
                            ) : (
                                <FavoriteBorderIcon />
                            )}
                        </IconButton>
                        <Typography variant="caption">{likes}</Typography>

                        <IconButton
                            onClick={() =>
                                document.getElementById('comment-input')?.focus()
                            }
                        >
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
                    </Box>

                    {/* composer -------------------------------------------------- */}
                    <Box
                        sx={{
                            borderTop:   1,
                            borderColor: 'divider',
                            p:           1,
                            display:     'flex',
                            flexDirection: 'column',
                            gap:         0.5,
                            bgcolor:     'background.paper',
                        }}
                    >
                        {viewer ? (
                            <Fragment>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Avatar src={viewer.avatar_url}>
                                        {viewer.first_name?.[0]}
                                    </Avatar>
                                    <Box
                                        sx={{
                                            flex:          1,
                                            display:       'flex',
                                            alignItems:    'flex-end',
                                            border:        1,
                                            borderColor:   'divider',
                                            borderRadius:  2,
                                            px:            1,
                                        }}
                                    >
                                        <TextField
                                            id="comment-input"
                                            multiline
                                            variant="standard"
                                            fullWidth
                                            placeholder="Leave a comment"
                                            InputProps={{ disableUnderline: true }}
                                            inputRef={inputRef}
                                            value={comment}
                                            onChange={(e) =>
                                                setComment(
                                                    e.target.value.slice(0, MAX_LEN),
                                                )
                                            }
                                            minRows={1}
                                            maxRows={4}
                                            sx={{ flex: 1 }}
                                        />
                                        <IconButton
                                            color="primary"
                                            disabled={comment.trim() === ''}
                                            onClick={postComment}
                                        >
                                            <SendIcon />
                                        </IconButton>
                                    </Box>
                                </Box>
                                {comment && (
                                    <Typography variant="caption" align="right">
                                        {MAX_LEN - comment.length} characters left
                                    </Typography>
                                )}
                            </Fragment>
                        ) : (
                            <Typography variant="body2">
                                <Link
                                    component="button"
                                    sx={{ fontWeight: 600 }}
                                    onClick={() =>
                                        openAuth({ redirectTo: window.location.href })
                                    }
                                >
                                    Log in
                                </Link>{' '}
                                to leave a comment.
                            </Typography>
                        )}
                    </Box>
                </Paper>

                {/* lightbox ---------------------------------------------------- */}
                <Dialog
                    open={lightbox}
                    onClose={() => setLightbox(false)}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogContent
                        sx={{
                            p: 0,
                            bgcolor:  'grey.900',
                            position: 'relative',
                        }}
                    >
                        <IconButton
                            onClick={() => setLightbox(false)}
                            sx={{
                                position:  'absolute',
                                top:       8,
                                right:     8,
                                color:     '#fff',
                                bgcolor:   'rgba(0,0,0,0.45)',
                                '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                            }}
                        >
                            <CloseIcon sx={{ fontSize: 34 }} />
                        </IconButton>
                        {validPhotos.length > 0 && (
                            <Box
                                sx={{
                                    position:     'relative',
                                    height:       '80vh',
                                    display:      'flex',
                                    alignItems:   'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Box
                                    component="img"
                                    src={validPhotos[idx]}
                                    alt=""
                                    sx={{
                                        maxWidth:  '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                    }}
                                />
                                {validPhotos.length > 1 && (
                                    <>
                                        <IconButton
                                            disabled={idx === 0}
                                            onClick={() => setIdx((i) => i - 1)}
                                            sx={{
                                                position:  'absolute',
                                                left:      16,
                                                color:     '#fff',
                                                bgcolor:   'rgba(0,0,0,0.45)',
                                                '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                                            }}
                                        >
                                            <ArrowBackIosNew />
                                        </IconButton>
                                        <IconButton
                                            disabled={idx === validPhotos.length - 1}
                                            onClick={() => setIdx((i) => i + 1)}
                                            sx={{
                                                position:  'absolute',
                                                right:     16,
                                                color:     '#fff',
                                                bgcolor:   'rgba(0,0,0,0.45)',
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
            </DialogContent>
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
