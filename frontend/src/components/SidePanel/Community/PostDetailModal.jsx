// src/components/SidePanel/Community/PostDetailModal.jsx
// ============================================================================
// Post detail (threaded replies) — stabilized & enhanced
// - Author block (avatar, name, @username) at top-left; date-only
// - Category pill above title
// - Comments pane always on the right
// - Rich editor restored (formatting, emoji, GIF, image)
// - Actions row sits right above the composer
// - Share opens SharePostDialog; clicking avatar/name/username opens UserCardPopover
// - Soft fallback to session user to avoid false "login required" when opened from Community
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Dialog, DialogContent, Box, Paper, Typography, Avatar, Button, IconButton,
    TextField, Link, MenuItem, Tooltip, Popover, InputBase
} from '@mui/material';

import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CommentIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon from '@mui/icons-material/Share';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import ImageIcon from '@mui/icons-material/Image';
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon';
import GifBoxIcon from '@mui/icons-material/GifBox';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';

import CampaignIcon from '@mui/icons-material/Campaign';
import ChatIcon from '@mui/icons-material/ChatBubble';
import ReportIcon from '@mui/icons-material/Report';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PanToolIcon from '@mui/icons-material/PanTool';
import SearchIcon from '@mui/icons-material/Search';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthModal } from '../../../contexts/AuthModalContext';

import SharePostDialog from '../../share/SharePostDialog';
import UserCardPopover from '../../Common/UserCardPopover';

const MAX_CHARS = 1000;
const SINGLE_IMAGE_MAX = 720;

/* helpers */
const surround = (txt, wrap) => `${wrap}${txt}${wrap}`;
const dateOnly = (d) => {
    const dt = new Date(d);
    return Number.isNaN(dt.valueOf()) ? '' : dt.toLocaleDateString();
};
const timeAgo = (d = '') => {
    const diff = Date.now() - new Date(d).getTime();
    const s = Math.floor(diff / 1000); if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d2 = Math.floor(h / 24); if (d2 < 30) return `${d2}d ago`;
    const mo = Math.floor(d2 / 30); if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};
const fmt = (n = 0) => {
    const x = Number(n) || 0;
    if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x % 1_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
    if (x >= 1_000) return `${(x / 1_000).toFixed(x % 1_000 ? 1 : 0).replace(/\.0$/, '')}k`;
    return String(x);
};

/* category -> pill look */
const BADGE = {
    announcement: { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion: { label: 'General Discussion', color: '#2e7d32', Icon: ChatIcon },
    'general-discussion': { label: 'General Discussion', color: '#2e7d32', Icon: ChatIcon },
    recommendation: { label: 'Tip', color: '#fdd835', Icon: LightbulbIcon },
    volunteer: { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests': { label: 'Volunteer', color: '#0097a7', Icon: PanToolIcon },
    'lost-found': { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'public-safety-alerts': { label: 'Alert', color: '#e53935', Icon: ReportIcon },
};
const Pill = ({ label, Icon, color }) => (
    <Box
        sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.25, bgcolor: color, color: '#fff', borderRadius: 12,
            fontSize: '0.75rem', fontWeight: 600, width: 'max-content',
        }}
    >
        <Icon sx={{ fontSize: 14 }} /> {label}
    </Box>
);

/* simple loader */
const LoadingDots = () => (
    <Box
        sx={{
            display: 'flex', gap: 1,
            '@keyframes b': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } },
        }}
    >
        {[0, 1, 2].map((i) => (
            <Box
                key={i}
                sx={{
                    width: 14, height: 14, borderRadius: '50%', bgcolor: 'primary.main',
                    animation: 'b 1.4s infinite ease-in-out', animationDelay: `${i * 0.2}s`,
                }}
            />
        ))}
    </Box>
);

/* Emoji + GIF pickers (lightweight) */
const COMMON_EMOJI = ['😀','😂','😍','👍','🙏','🎉','❤️','🔥','👏','😢','😮','🤔','😎','🙌','🫶','💯','🚀','🌟','😊','😅','😁'];

function EmojiPopover({ anchorEl, onClose, onPick }) {
    const open = Boolean(anchorEl);
    return (
        <Popover open={open} anchorEl={anchorEl} onClose={onClose}
                 anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                 transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
            <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 0.5 }}>
                {COMMON_EMOJI.map((e) => (
                    <Button key={e} onClick={() => { onPick(e); onClose(); }} sx={{ minWidth: 0, fontSize: 20, p: 0.5 }}>
                        {e}
                    </Button>
                ))}
            </Box>
        </Popover>
    );
}

function GifPopover({ anchorEl, onClose, onPick }) {
    const open = Boolean(anchorEl);
    const [q, setQ] = useState('');
    const [gifs, setGifs] = useState([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        let alive = true;
        (async () => {
            setBusy(true);
            try {
                const r = await fetch(`/api/tenor/search?q=${encodeURIComponent(q || 'trending')}&limit=20`);
                const j = await r.json();
                const arr = (j.results || []).map((r0) => ({
                    id: r0.id,
                    tiny: r0.media_formats?.tinygif?.url || r0.media_formats?.gif?.url,
                    gif: r0.media_formats?.gif?.url || r0.media_formats?.tinygif?.url,
                }));
                if (alive) setGifs(arr);
            } catch { /* ignore */ }
            if (alive) setBusy(false);
        })();
        return () => { alive = false; };
    }, [open, q]);

    return (
        <Popover
            open={open} anchorEl={anchorEl} onClose={onClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            PaperProps={{ sx: { width: 380, p: 1 } }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SearchIcon fontSize="small" />
                <InputBase placeholder="Search GIFs" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1 }} />
            </Box>
            {busy ? <LoadingDots /> : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0.5, maxHeight: 300, overflowY: 'auto' }}>
                    {gifs.map((g) => (
                        <Box key={g.id} component="img" src={g.tiny} alt=""
                             onClick={() => { onPick(g.gif || g.tiny); onClose(); }}
                             sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }} />
                    ))}
                </Box>
            )}
        </Popover>
    );
}

/* Inline ReplyEditor (rich) */
function InlineReplyEditor({ avatar, onSubmit, autoFocus = false, initialText = '', placeholder = 'Write a reply…', fullWidth = false }) {
    const [text, setText] = useState(initialText);
    const [file, setFile] = useState(null);
    const [gifUrl, setGifUrl] = useState('');
    const textRef = useRef();

    const [emojiEl, setEmojiEl] = useState(null);
    const [gifEl, setGifEl] = useState(null);

    const disabled = text.trim() === '' && !file && !gifUrl;

    useEffect(() => {
        if (autoFocus && textRef.current) {
            textRef.current.focus();
            const t = setTimeout(() => textRef.current?.focus(), 20);
            return () => clearTimeout(t);
        }
    }, [autoFocus]);

    const insertAtCursor = (snippet) => {
        const el = textRef.current; if (!el) { setText((t) => t + snippet); return; }
        const [s, e] = [el.selectionStart, el.selectionEnd];
        const next = text.slice(0, s) + snippet + text.slice(e);
        setText(next);
        setTimeout(() => { el.focus(); const pos = s + snippet.length; el.setSelectionRange(pos, pos); }, 0);
    };
    const wrap = (token) => {
        const el = textRef.current; if (!el) return;
        const [s, e] = [el.selectionStart, el.selectionEnd];
        const sel = text.slice(s, e) || 'text';
        const next = text.slice(0, s) + surround(sel, token) + text.slice(e);
        setText(next);
        setTimeout(() => el.setSelectionRange(s + token.length, e + token.length), 0);
    };

    const handleFile = (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        if (gifUrl) { alert('Remove the GIF to attach an image.'); return; }
        setFile(Object.assign(f, { preview: URL.createObjectURL(f) }));
    };

    const handlePickGif = (url) => {
        if (file) { alert('Remove the image to add a GIF.'); return; }
        if (gifUrl) return;
        setGifUrl(url);
        insertAtCursor(`\n![](${url})\n`);
    };
    const removeGif = () => {
        if (!gifUrl) return;
        setText((t) => t.replace(new RegExp(`\\!\\[]\\(${gifUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\)\\s*`, 'g'), ''));
        setGifUrl('');
    };

    const send = () => {
        if (disabled) return;
        const fd = new FormData();
        fd.append('content', text.trim());
        if (file) fd.append('image', file);
        onSubmit(fd, () => { setText(''); setFile(null); setGifUrl(''); });
    };

    return (
        <Box sx={{ display: 'flex', gap: 1, mt: 1, minWidth: 0 }}>
            <Avatar src={avatar} sx={{ width: 32, height: 32 }} />
            <Paper
                variant="outlined"
                sx={{
                    p: 1,
                    flex: fullWidth ? '1 1 auto' : '0 0 auto',
                    minWidth: fullWidth ? 0 : 400,
                    width: fullWidth ? '100%' : 'min(465px, 40vw)',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                    <Tooltip title="Bold"><IconButton size="small" onClick={() => wrap('**')}><FormatBoldIcon /></IconButton></Tooltip>
                    <Tooltip title="Italic"><IconButton size="small" onClick={() => wrap('_')}><FormatItalicIcon /></IconButton></Tooltip>
                    <Tooltip title="Strikethrough"><IconButton size="small" onClick={() => wrap('~~')}><StrikethroughSIcon /></IconButton></Tooltip>
                    <Tooltip title="Quote"><IconButton size="small" onClick={() => insertAtCursor('\n> ')}><FormatQuoteIcon /></IconButton></Tooltip>

                    <IconButton size="small" onClick={(e) => setEmojiEl(e.currentTarget)}><InsertEmoticonIcon /></IconButton>
                    <Tooltip title={gifUrl ? 'Remove GIF to add another' : 'Add GIF'}>
            <span>
              <IconButton size="small" disabled={Boolean(gifUrl)} onClick={(e) => setGifEl(e.currentTarget)}>
                <GifBoxIcon />
              </IconButton>
            </span>
                    </Tooltip>

                    <Tooltip title={gifUrl ? 'Remove GIF to attach image' : 'Attach image'}>
            <span>
              <IconButton size="small" component="label" disabled={Boolean(gifUrl)}>
                <ImageIcon />
                <input hidden type="file" accept="image/*" onChange={handleFile} />
              </IconButton>
            </span>
                    </Tooltip>

                    <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption">{MAX_CHARS - text.length}</Typography>
                        <IconButton color="primary" disabled={disabled} onClick={send}><SendIcon /></IconButton>
                    </Box>
                </Box>

                <TextField
                    inputRef={textRef}
                    multiline
                    minRows={2}
                    maxRows={6}
                    variant="standard"
                    fullWidth
                    InputProps={{ disableUnderline: true }}
                    placeholder={placeholder}
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                    autoFocus={autoFocus}
                />

                {file && (
                    <Box sx={{ mt: 1, position: 'relative', width: 140 }}>
                        <Box component="img" src={file.preview} alt="" sx={{ width: '100%', borderRadius: 1 }} />
                        <IconButton size="small" onClick={() => setFile(null)} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                )}
                {gifUrl && (
                    <Box sx={{ mt: 1, position: 'relative', width: 160 }}>
                        <Box component="img" src={gifUrl} alt="gif" sx={{ width: '100%', borderRadius: 1 }} />
                        <IconButton size="small" onClick={removeGif} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                )}

                <EmojiPopover anchorEl={emojiEl} onClose={() => setEmojiEl(null)} onPick={(e) => insertAtCursor(String(e))} />
                <GifPopover anchorEl={gifEl} onClose={() => setGifEl(null)} onPick={handlePickGif} />
            </Paper>
        </Box>
    );
}

/* main component */
export default function PostDetailModal({ open, post, onClose, user, currentUser }) {
    const { open: openAuth } = useAuthModal();

    // derive viewer directly from props (no local bounce)
    const viewerProp = useMemo(() => user || currentUser || null, [user, currentUser]);
    const [me, setMe] = useState(null); // fallback if modal opened w/out user prop

    // Soft-session fetch once per open to avoid false "login required"
    useEffect(() => {
        let alive = true;
        if (open && !viewerProp) {
            (async () => {
                try {
                    const r = await fetch('/api/auth/me', { credentials: 'include' });
                    if (!alive) return;
                    if (r.ok) setMe(await r.json());
                } catch { /* ignore */ }
            })();
        } else if (!open) {
            setMe(null);
        }
        return () => { alive = false; };
    }, [open, viewerProp]);
    const viewer = viewerProp || me;

    const {
        id: postId,
        user_id,
        first_name = '', last_name = '', avatar_url = '',
        handle = '',
        date_created = '', title = '', description = '',
        category = '', lost_or_found = '', photos = [],
        likesCount: likesRaw = 0, viewerLiked: viewerLikedRaw = 0,
    } = post ?? {};

    const [likes, setLikes] = useState(likesRaw);
    const [liked, setLiked] = useState(Boolean(viewerLikedRaw));
    const [sort, setSort] = useState('popular');
    const [comments, setComments] = useState([]);
    const [busyC, setBusyC] = useState(false);

    const [shareOpen, setShareOpen] = useState(false);
    const [userAnchor, setUserAnchor] = useState(null);

    // 💡 photos → pure derivation (stable; no update loop)
    const validPhotos = useMemo(
        () => (Array.isArray(photos) ? photos.filter(Boolean).slice(0, 8) : []),
        [photos]
    );

    const [idx, setIdx] = useState(0);
    const [lightbox, setLightbox] = useState(false);

    // remember which threads are expanded
    const [expanded, setExpanded] = useState(() => new Set());
    const isExpanded = (id) => expanded.has(id);
    const toggleExpanded = (id) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // fetch comments (abortable)
    useEffect(() => {
        if (!open || !postId) return;
        const ctrl = new AbortController();
        let alive = true;
        (async () => {
            setBusyC(true);
            try {
                const r = await fetch(`/api/posts/${postId}/comments?sort=${sort}`, { credentials: 'include', signal: ctrl.signal });
                if (!alive) return;
                const j = await r.json();
                setComments(Array.isArray(j) ? j : []);
            } catch (e) {
                if (e?.name !== 'AbortError') console.error(e);
            } finally {
                if (alive) setBusyC(false);
            }
        })();
        return () => { alive = false; ctrl.abort(); };
    }, [open, postId, sort]);

    // group by parent
    const kidsByParent = useMemo(() => {
        const m = new Map();
        (comments || []).forEach((c) => {
            const p = c.parent_id || 0;
            if (!m.has(p)) m.set(p, []);
            m.get(p).push(c);
        });
        return m;
    }, [comments]);
    const roots = kidsByParent.get(0) || [];

    // like handlers
    const togglePostLike = async () => {
        if (!viewer) { openAuth(); return; }
        const next = !liked;
        setLiked(next); setLikes((l) => l + (next ? 1 : -1));
        try { await fetch(`/api/posts/${postId}/like`, { method: 'POST', credentials: 'include' }); }
        catch (e) { console.error(e); }
    };
    const toggleCommentLike = async (cid) => {
        if (!viewer) { openAuth(); return; }
        setComments((cs) => cs.map((c) => (c.id === cid
            ? { ...c, viewerLiked: !c.viewerLiked, likesCount: c.likesCount + (c.viewerLiked ? -1 : 1) }
            : c)));
        try { await fetch(`/api/posts/comments/${cid}/like`, { method: 'POST', credentials: 'include' }); }
        catch (e) { console.error(e); }
    };

    // submit handlers
    const postComment = async (fd, done) => {
        if (!viewer) { openAuth(); return; }
        try {
            const r = await fetch(`/api/posts/${postId}/comments`, { method: 'POST', body: fd, credentials: 'include' });
            const j = await r.json();
            if (j && j.id) setComments((c) => [j, ...c]);
            done();
        } catch (e) { console.error(e); }
    };
    const postReply = (parentId, after) => (fd, done) => {
        fd.append('parent_id', parentId);
        postComment(fd, () => {
            setExpanded((prev) => { const next = new Set(prev); next.add(parentId); return next; });
            after?.(); done();
        });
    };

    const twoColumn = (validPhotos.length > 0) || ((description?.trim()?.length || 0) > 240);
    const dialogMaxWidth = twoColumn ? 'xl' : 'md';

    const pillMeta = lost_or_found
        ? { label: lost_or_found === 'found' ? 'Found' : 'Lost', color: '#fb8c00', Icon: SearchIcon }
        : BADGE[category] ?? { label: category || 'Other', color: '#777', Icon: ReportIcon };

    // image collage
    const Collage = ({ pics, onClick }) => {
        const n = pics.length;
        const tpl = n === 1 ? { c: '1fr', r: 'auto' } : n === 2 ? { c: '1fr 1fr', r: 'auto' }
            : n === 3 ? { c: '2fr 1fr', r: '1fr 1fr' } : { c: '1fr 1fr', r: '1fr 1fr' };
        const pos = (i) => (n !== 3 ? {} : i === 0 ? { gridRow: '1 / span 2', gridColumn: '1' } : i === 1 ? { gridRow: '1', gridColumn: '2' } : { gridRow: '2', gridColumn: '2' });

        const wrapperSx = n === 1
            ? { maxWidth: `${SINGLE_IMAGE_MAX}px`, mx: 'auto', width: '100%' }
            : { width: '100%' };

        return (
            <Box sx={{ ...wrapperSx, display: 'grid', gap: 0.5, gridTemplateColumns: tpl.c, gridTemplateRows: tpl.r }}>
                {pics.slice(0, 4).map((src, i) => (
                    <Box key={src} onClick={() => onClick(i)}
                         sx={{ position: 'relative', pb: n === 1 ? '66.66%' : '100%', overflow: 'hidden', cursor: 'pointer', borderRadius: 2, ...pos(i) }}>
                        <Box component="img" src={src} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    </Box>
                ))}
            </Box>
        );
    };

    /* into-view helper for reply editors */
    const commentsViewportRef = useRef(null);
    const ensureIntoView = (el) => {
        const vp = commentsViewportRef.current;
        if (!vp || !el) return;
        const v = vp.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const dx = r.right > v.right ? (r.right - v.right + 16) : r.left < v.left ? -(v.left - r.left + 16) : 0;
        const dy = r.bottom > v.bottom ? (r.bottom - v.bottom + 16) : r.top < v.top ? -(v.top - r.top + 16) : 0;
        if (dx || dy) vp.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
    };

    /* Comment node */
    const Comment = ({ c, depth = 0, replyingTo = '' }) => {
        const kids = kidsByParent.get(c.id) || [];
        const [replying, setReplying] = useState(false);
        const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const replyAnchorRef = useRef(null);

        const showKids = isExpanded(c.id);

        useEffect(() => {
            if (replying) {
                ensureIntoView(replyAnchorRef.current);
                const t = setTimeout(() => ensureIntoView(replyAnchorRef.current), 20);
                return () => clearTimeout(t);
            }
        }, [replying]);

        return (
            <Box sx={{ pl: depth ? 3 : 0, mt: 2, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Avatar src={c.avatar_url} sx={{ width: 30, height: 30 }}>{c.first_name?.[0]}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2">
                            {c.first_name} {c.last_name}{' '}
                            <Typography component="span" variant="caption" color="text.secondary">· {timeAgo(c.created_at)}</Typography>
                        </Typography>

                        {depth > 0 && replyingTo && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                Replying to{' '}
                                <Link component="button" underline="hover" color="primary">{replyingTo}</Link>
                            </Typography>
                        )}

                        {c.image && (
                            <Box component="img" src={c.image} alt="" sx={{ width: 220, borderRadius: 1, my: 1 }} />
                        )}

                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                img: ({ node, ...props }) => (
                                    <img {...props} alt="" style={{ maxWidth: '100%', width: 220, borderRadius: 4, display: 'block', margin: '8px 0' }} />
                                ),
                            }}
                        >
                            {c.content}
                        </ReactMarkdown>

                        {/* actions */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <IconButton size="small" onClick={() => toggleCommentLike(c.id)}>
                                    {c.viewerLiked ? <FavoriteIcon color="error" fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
                                </IconButton>
                                <Typography variant="caption">{fmt(c.likesCount)}</Typography>
                            </Box>

                            <Button size="small" sx={{ textTransform: 'none', p: 0 }} onClick={() => (viewer ? setReplying(true) : openAuth())}>
                                Reply
                            </Button>

                            {kids.length > 0 && (
                                <Button
                                    size="small"
                                    onClick={() => toggleExpanded(c.id)}
                                    sx={{ textTransform: 'none', p: 0, display: 'inline-flex', alignItems: 'center', gap: 0.25, whiteSpace: 'nowrap' }}
                                >
                                    <ExpandMoreIcon sx={{ fontSize: 18, transform: showKids ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                    {showKids ? 'Hide replies' : `Show replies (${kids.length})`}
                                </Button>
                            )}
                        </Box>

                        {/* inline composer */}
                        <Box ref={replyAnchorRef}>
                            {replying && viewer && (
                                <InlineReplyEditor
                                    avatar={viewer.avatar_url}
                                    onSubmit={postReply(c.id, () => {
                                        setExpanded((prev) => { const next = new Set(prev); next.add(c.id); return next; });
                                        ensureIntoView(replyAnchorRef.current);
                                    })}
                                    autoFocus
                                    initialText=""
                                    placeholder="Write a reply…"
                                />
                            )}
                        </Box>

                        {/* children */}
                        {showKids && kids.map((k) => (
                            <Box key={k.id} sx={{ mt: 1, ml: 2, borderLeft: '1px solid', borderColor: 'divider', pl: 2 }}>
                                <Comment c={k} depth={depth + 1} replyingTo={fullName} />
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>
        );
    };

    if (!open || !post) return null;
    const busy = busyC;

    return (
        <Dialog
            open={open}
            onClose={(_, reason) => reason !== 'backdropClick' && onClose()}
            maxWidth={dialogMaxWidth}
            fullWidth
            PaperProps={{ sx: { height: { xs: '90vh', md: '80vh' }, overflow: 'hidden' } }}
        >
            {/* close */}
            <IconButton
                onClick={onClose}
                sx={{
                    position: 'absolute', top: 8, right: 8, zIndex: 3,
                    bgcolor: 'rgba(0,0,0,0.05)', '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                }}
            >
                <CloseIcon />
            </IconButton>

            <DialogContent
                sx={{
                    p: 0, height: '100%', display: 'grid', overflow: 'hidden',
                    gridTemplateColumns: { xs: '1fr', md: twoColumn ? 'minmax(0,1fr) minmax(420px, 560px)' : '1fr' },
                    gridTemplateAreas: { xs: `"post" "comments"`, md: twoColumn ? `"post comments"` : `"post" "comments"` },
                    position: 'relative',
                }}
            >
                {busy && (
                    <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                        <LoadingDots />
                    </Box>
                )}

                {/* post column */}
                <Box sx={{ gridArea: 'post', overflowY: 'auto', px: 5, py: { xs: 3, md: 4 } }}>
                    <Box sx={{ mx: 'auto', display: 'flex', flexDirection: 'column', gap: validPhotos.length ? 3 : 2 }}>
                        {/* Author block (clickable to open user card) */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar src={avatar_url} sx={{ cursor: 'pointer' }} onClick={(e) => setUserAnchor(e.currentTarget)}>
                                {first_name[0]}
                            </Avatar>
                            <Box>
                                <Typography variant="subtitle1" fontWeight={600} sx={{ cursor: 'pointer' }} onClick={(e) => setUserAnchor(e.currentTarget)}>
                                    {first_name} {last_name}
                                </Typography>
                                {!!handle && (
                                    <Typography variant="caption" color="text.secondary" sx={{ cursor: 'pointer' }} onClick={(e) => setUserAnchor(e.currentTarget)}>
                                        @{handle}
                                    </Typography>
                                )}
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {dateOnly(date_created)}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Category pill above title */}
                        <Pill {...(lost_or_found
                            ? { label: lost_or_found === 'found' ? 'Found' : 'Lost', color: '#fb8c00', Icon: SearchIcon }
                            : BADGE[category] ?? { label: category || 'Other', color: '#777', Icon: ReportIcon })}
                        />

                        {title && <Typography variant="h5" fontWeight={700}>{title}</Typography>}
                        {description && <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{description}</Typography>}

                        {validPhotos.length > 0 && (
                            <Collage pics={validPhotos} onClick={(i) => { setIdx(i); setLightbox(true); }} />
                        )}
                    </Box>
                </Box>

                {/* comments column */}
                <Paper
                    elevation={0}
                    sx={{
                        gridArea: 'comments',
                        bgcolor: 'grey.50',
                        borderLeft: twoColumn ? '2px solid' : 'none',
                        borderColor: 'divider',
                        display: 'grid',
                        gridTemplateRows: 'auto 1fr auto auto',
                        minHeight: 0,
                    }}
                >
                    {/* header */}
                    <Box
                        sx={{
                            px: 2, pt: 2, pb: 1, pr: 12,
                            borderBottom: 1, borderColor: 'divider',
                            display: 'flex', alignItems: 'center', gap: 2,
                        }}
                    >
                        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
                            Comments ({fmt(roots.length)})
                        </Typography>
                        <TextField
                            select size="small" variant="standard" value={sort}
                            onChange={(e) => setSort(e.target.value)} sx={{ minWidth: 140 }}
                        >
                            <MenuItem value="popular">Most Liked</MenuItem>
                            <MenuItem value="newest">Newest</MenuItem>
                        </TextField>
                    </Box>

                    {/* thread viewport (scrolls) */}
                    <Box
                        ref={commentsViewportRef}
                        sx={{ overflowY: 'auto', overflowX: 'auto', px: 2, py: 1, pr: 3, scrollbarGutter: 'stable both-edges' }}
                    >
                        <Box sx={{ width: 'max-content', minWidth: '100%' }}>
                            {busyC
                                ? <LoadingDots />
                                : roots.length === 0
                                    ? <Typography variant="body2" color="text.secondary">No comments yet.</Typography>
                                    : roots.map((c) => <Comment key={c.id} c={c} />)
                            }
                        </Box>
                    </Box>

                    {/* actions row */}
                    <Box sx={{ borderTop: 1, borderColor: 'divider', px: 2, py: 1, display: 'flex', gap: 2, alignItems: 'center', bgcolor: 'background.paper' }}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton onClick={togglePostLike}>{liked ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}</IconButton>
                            <Typography variant="caption">{fmt(likes)}</Typography>
                        </Box>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton onClick={() => document.getElementById('post-reply-anchor')?.scrollIntoView({ behavior: 'smooth' })}><CommentIcon /></IconButton>
                            <Typography variant="caption">{fmt(roots.length)}</Typography>
                        </Box>
                        <IconButton onClick={() => setShareOpen(true)}><ShareIcon /></IconButton>
                    </Box>

                    {/* composer */}
                    <Box id="post-reply-anchor" sx={{ borderTop: 1, borderColor: 'divider', p: 1, bgcolor: 'background.paper' }}>
                        {viewer ? (
                            <InlineReplyEditor
                                avatar={viewer.avatar_url}
                                onSubmit={postComment}
                                initialText=""
                                placeholder="Leave a comment"
                                fullWidth={false}
                            />
                        ) : (
                            <Typography variant="body2">
                                <Link component="button" sx={{ fontWeight: 600 }} onClick={() => openAuth()}>
                                    Log in
                                </Link>{' '}to comment.
                            </Typography>
                        )}
                    </Box>
                </Paper>

                {/* lightbox */}
                <Dialog open={lightbox} onClose={() => setLightbox(false)} maxWidth="lg" fullWidth>
                    <DialogContent sx={{ p: 0, bgcolor: 'grey.900', position: 'relative' }}>
                        <IconButton
                            onClick={() => setLightbox(false)}
                            sx={{
                                position: 'absolute', top: 8, right: 8,
                                color: '#fff', bgcolor: 'rgba(0,0,0,0.45)', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' }, zIndex: 3, pointerEvents: 'auto',
                            }}
                        >
                            <CloseIcon sx={{ fontSize: 34 }} />
                        </IconButton>
                        {validPhotos.length > 0 && (
                            <Box sx={{ position: 'relative', height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Box component="img" src={validPhotos[idx]} alt="" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                {validPhotos.length > 1 && (
                                    <>
                                        <IconButton disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} sx={{ position: 'absolute', left: 16, color: '#fff', bgcolor: 'rgba(0,0,0,0.45)', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' } }}>
                                            <ArrowBackIosNewIcon />
                                        </IconButton>
                                        <IconButton disabled={idx === validPhotos.length - 1} onClick={() => setIdx((i) => i + 1)} sx={{ position: 'absolute', right: 16, color: '#fff', bgcolor: 'rgba(0,0,0,0.45)', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' } }}>
                                            <ArrowForwardIosIcon />
                                        </IconButton>
                                    </>
                                )}
                            </Box>
                        )}
                    </DialogContent>
                </Dialog>
            </DialogContent>

            {/* user card + share dialog */}
            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={{ id: user_id, first_name, last_name, handle, avatar_url }}
                isSelf={viewer && viewer.id === user_id}
                onFollow={() => {}}
                onMessage={() => window.dispatchEvent(new CustomEvent('open-message-center', { detail: { userId: user_id } }))}
                onViewProfile={(u) => window.location.assign(`/${u.handle || u.id}`)}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={viewer} post={post} />
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
