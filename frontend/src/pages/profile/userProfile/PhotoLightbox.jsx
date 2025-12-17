// src/pages/profile/userProfile/PhotoLightbox.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar, Box, Button, Dialog, DialogContent, IconButton, InputBase,
    MenuItem, Paper, Select, Tooltip, Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon from '@mui/icons-material/Share';
import ImageIcon from '@mui/icons-material/Image';
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon';
import GifBoxIcon from '@mui/icons-material/GifBox';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import SendIcon from '@mui/icons-material/Send';

import axios from 'axios';
import SharePhotoDialog from './SharePhotoDialog';
import { useAuth } from '../../../components/AuthModalContext';

const api = process.env.REACT_APP_API_URL;
const MAX_CHARS = 1000;

/* ──────────────────────────────────────────────────────────────────────────
   Lightweight rate limiter with block window (client‑side UX guard)
   ────────────────────────────────────────────────────────────────────────── */
function useRateLimiter({ limit, perMs, blockMs }) {
    const [blockedUntil, setBlockedUntil] = useState(0);
    const recentRef = useRef([]);

    // prune timestamps on render
    const now = Date.now();
    recentRef.current = recentRef.current.filter((t) => now - t < perMs);

    const canSend = now >= blockedUntil && recentRef.current.length < limit;
    const msRemaining = Math.max(0, blockedUntil - now);

    const bump = () => {
        const cur = Date.now();
        const recent = recentRef.current.filter((t) => cur - t < perMs);
        recent.push(cur);
        recentRef.current = recent;
        if (recent.length > limit) {
            setBlockedUntil(cur + blockMs);
            recentRef.current = []; // reset after block
        }
    };

    // clear any scheduled timers on unmount (none used—state is time math)
    useEffect(() => () => {}, []);

    return { canSend, msRemaining, bump, blocked: now < blockedUntil };
}

/* ──────────────────────────────────────────────────────────────────────────
   Inline composer (PostDetail parity)
   ────────────────────────────────────────────────────────────────────────── */
function InlineComposer({ avatar, onSubmit, disabled, disabledTooltip, placeholder = 'Write a comment…' }) {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const [gifUrl, setGifUrl] = useState('');
    const iptRef = useRef();

    const surround = (src, wrap) => `${wrap}${src}${wrap}`;
    const wrap = (token) => {
        const el = iptRef.current; if (!el) return;
        const [s, e] = [el.selectionStart, el.selectionEnd];
        const sel = text.slice(s, e) || 'text';
        const next = text.slice(0, s) + surround(sel, token) + text.slice(e);
        setText(next);
        setTimeout(() => el.setSelectionRange(s + token.length, e + token.length), 0);
    };

    const choose = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type?.startsWith('image/')) return;
        setFile(Object.assign(f, { preview: URL.createObjectURL(f) }));
    };
    const removeFile = () => { if (file?.preview) URL.revokeObjectURL(file.preview); setFile(null); };
    useEffect(() => () => { if (file?.preview) URL.revokeObjectURL(file.preview); }, [file]);

    const send = () => {
        const content = text.trim();
        if (!content && !file && !gifUrl) return;
        const fd = new FormData();
        fd.append('content', content);
        if (file) fd.append('image', file);
        if (gifUrl) fd.append('gif', gifUrl);
        onSubmit(fd, () => { setText(''); removeFile(); setGifUrl(''); });
    };

    const toolbar = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Tooltip title="Bold"><span><IconButton size="small" onClick={() => wrap('**')}><FormatBoldIcon /></IconButton></span></Tooltip>
            <Tooltip title="Italic"><span><IconButton size="small" onClick={() => wrap('_')}><FormatItalicIcon /></IconButton></span></Tooltip>
            <Tooltip title="Strikethrough"><span><IconButton size="small" onClick={() => wrap('~~')}><StrikethroughSIcon /></IconButton></span></Tooltip>
            <Tooltip title="Quote"><span><IconButton size="small" onClick={() => { const el = iptRef.current; if (!el) return; const [s] = [el.selectionStart]; const next = text.slice(0, s) + '\n> ' + text.slice(s); setText(next); }}><FormatQuoteIcon /></IconButton></span></Tooltip>
            <Tooltip title="Emoji (type directly 🙂)"><span><IconButton size="small"><InsertEmoticonIcon /></IconButton></span></Tooltip>
            <Tooltip title={gifUrl ? 'Remove GIF to add another' : 'Attach GIF'}>
        <span>
          <IconButton size="small" disabled={Boolean(gifUrl)} onClick={() => setGifUrl('')}>
            <GifBoxIcon />
          </IconButton>
        </span>
            </Tooltip>
            <Tooltip title={gifUrl ? 'Remove GIF to attach image' : 'Attach image'}>
        <span>
          <IconButton size="small" component="label" disabled={Boolean(gifUrl)}>
            <ImageIcon />
            <input hidden type="file" accept="image/*" onChange={choose} />
          </IconButton>
        </span>
            </Tooltip>
            <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption">{MAX_CHARS - text.length}</Typography>
                <Tooltip title={disabled ? (disabledTooltip || '') : 'Send'}>
          <span>
            <IconButton color="primary" disabled={disabled || (!text.trim() && !file && !gifUrl)} onClick={send}>
              <SendIcon />
            </IconButton>
          </span>
                </Tooltip>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', gap: 1 }}>
            <Avatar src={avatar} sx={{ width: 32, height: 32 }} />
            <Paper
                variant="outlined"
                sx={{
                    p: 1,
                    flex: '1 1 auto',
                    minWidth: 0,
                    width: '100%',
                }}
            >
                {toolbar}
                <InputBase
                    inputRef={iptRef}
                    multiline
                    minRows={2}
                    maxRows={8}
                    fullWidth
                    placeholder="Write a comment…"
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                    sx={{ mt: 0.5, px: 1 }}
                />

                {file && (
                    <Box sx={{ mt: 1, position: 'relative', width: 140 }}>
                        <Box component="img" src={file.preview} alt="" sx={{ width: '100%', borderRadius: 1 }} />
                        <IconButton size="small" onClick={removeFile} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}

/* ────────────────────────────────────────────────────────────────────────── */

export default function PhotoLightbox({ open, onClose, photos = [], startIndex = 0, viewer }) {
    const [idx, setIdx] = useState(startIndex);
    const [likes, setLikes] = useState(0);
    const [liked, setLiked] = useState(false);
    const [comments, setComments] = useState([]);
    const [sort, setSort] = useState('newest');
    const [shareOpen, setShareOpen] = useState(false);

    const { open: openAuth } = useAuth?.() || { open: () => {} };

    const current = photos[idx] || null;
    const pid = current?.id;

    // rate limiters
    const commentLimiter = useRateLimiter({ limit: 10, perMs: 120_000, blockMs: 300_000 }); // 10/2m → 5m block
    const replyLimiter   = useRateLimiter({ limit: 25, perMs: 120_000, blockMs: 300_000 }); // 25/2m → 5m block

    // keep index aligned when opener provides different start
    useEffect(() => { if (open) setIdx(startIndex); }, [startIndex, open]);

    // load counts & comments for current photo
    useEffect(() => {
        if (!open || !pid) return;
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            try {
                // Fetch state without altering (use a dedicated endpoint if you prefer)
                const [s, cmts] = await Promise.all([
                    axios.get(`${api}/users/photos/${pid}/like-state`, { withCredentials: true, validateStatus: () => true }).catch(() => ({ data: null })),
                    axios.get(`${api}/users/photos/${pid}/comments?sort=${sort}`, { signal: ctrl.signal, withCredentials: true }),
                ]);
                if (!alive) return;
                const data = s?.data;
                if (data && typeof data.liked === 'boolean') {
                    setLiked(Boolean(data.liked));
                    setLikes(Number(data.likes || 0));
                }
                setComments(Array.isArray(cmts.data) ? cmts.data : []);
            } catch {
                /* ignore */
            }
        })();
        return () => { alive = false; ctrl.abort(); };
    }, [open, pid, sort]);

    const next = () => setIdx((i) => (i + 1) % Math.max(1, photos.length));
    const prev = () => setIdx((i) => (i - 1 + Math.max(1, photos.length)) % Math.max(1, photos.length));

    const toggleLike = async () => {
        if (!viewer) return openAuth();
        try {
            const r = await axios.post(`${api}/users/photos/${pid}/like`, {}, { withCredentials: true });
            setLiked(Boolean(r.data.liked));
            setLikes(Number(r.data.likes || 0));
        } catch {
            /* ignore */
        }
    };

    // group threaded comments if backend returns parent_id
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

    const refreshComments = async () => {
        if (!pid) return;
        try {
            const cmts = await axios.get(`${api}/users/photos/${pid}/comments?sort=${sort}`, { withCredentials: true });
            setComments(Array.isArray(cmts.data) ? cmts.data : []);
        } catch {
            /* ignore */
        }
    };

    const postComment = async (fd, done) => {
        if (!viewer) return openAuth();
        if (!commentLimiter.canSend) return;
        try {
            await axios.post(`${api}/users/photos/${pid}/comments`, fd, { withCredentials: true });
            commentLimiter.bump();
            await refreshComments();
            done?.();
        } catch {
            /* ignore */
        }
    };

    const postReply = (parentId) => async (fd, done) => {
        if (!viewer) return openAuth();
        if (!replyLimiter.canSend) return;
        fd.append('parent_id', parentId);
        try {
            await axios.post(`${api}/users/photos/${pid}/comments`, fd, { withCredentials: true });
            replyLimiter.bump();
            await refreshComments();
            done?.();
        } catch {
            /* ignore */
        }
    };

    const avatar = viewer?.avatar_url || viewer?.profile_picture || '';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogContent
                sx={{
                    p: 0,
                    height: '86vh',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) minmax(420px,560px)' }, // post left / comments right
                    gap: 0,
                }}
            >
                {/* Left: photo */}
                <Box sx={{ position: 'relative', bgcolor: 'grey.900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Close button */}
                    <IconButton
                        onClick={onClose}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            color: '#fff',
                            bgcolor: 'rgba(0,0,0,0.45)',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                            zIndex: 3,
                        }}
                    >
                        <CloseIcon sx={{ fontSize: 34 }} />
                    </IconButton>

                    {/* Image */}
                    {current && (
                        <Box component="img" src={current.url} alt="" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    )}

                    {/* Prev/Next */}
                    {photos.length > 1 && (
                        <>
                            <IconButton
                                onClick={prev}
                                sx={{
                                    position: 'absolute',
                                    left: 16,
                                    color: '#fff',
                                    bgcolor: 'rgba(0,0,0,0.45)',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                                }}
                            >
                                <ArrowBackIosNewIcon />
                            </IconButton>
                            <IconButton
                                onClick={next}
                                sx={{
                                    position: 'absolute',
                                    right: 16,
                                    color: '#fff',
                                    bgcolor: 'rgba(0,0,0,0.45)',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
                                }}
                            >
                                <ArrowForwardIosIcon />
                            </IconButton>
                        </>
                    )}
                </Box>

                {/* Right: comments */}
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
                    {/* Header: sort */}
                    <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider', gap: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            Comments
                        </Typography>
                        <Box sx={{ ml: 'auto' }}>
                            <Select size="small" value={sort} onChange={(e) => setSort(e.target.value)}>
                                <MenuItem value="newest">Newest first</MenuItem>
                                <MenuItem value="oldest">Oldest first</MenuItem>
                            </Select>
                        </Box>
                    </Box>

                    {/* List */}
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1 }}>
                        {roots.length === 0 ? (
                            <Typography color="text.secondary">Be the first to comment.</Typography>
                        ) : (
                            roots.map((c) => {
                                const kids = kidsByParent.get(c.id) || [];
                                const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                                const handle = c.handle || c.username ? `@${c.handle || c.username}` : '';
                                return (
                                    <Box key={c.id} sx={{ display: 'flex', gap: 1.25, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                                        <Avatar src={c.avatar_url} sx={{ width: 32, height: 32 }}>{c.first_name?.[0]}</Avatar>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="subtitle2">{name || 'User'}</Typography>
                                            {handle && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25 }}>
                                                    {handle}
                                                </Typography>
                                            )}
                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                                                {c.content}
                                            </Typography>

                                            {/* Simple reply hook (optional; uses the reply limiter) */}
                                            {viewer && (
                                                <Box sx={{ mt: 1 }}>
                                                    <InlineComposer
                                                        avatar={avatar}
                                                        onSubmit={postReply(c.id)}
                                                        disabled={!replyLimiter.canSend}
                                                        disabledTooltip={
                                                            replyLimiter.blocked
                                                                ? 'To prevent spam on our posts, we limit the number of comments made quickly. Please try again in 5 minutes.'
                                                                : ''
                                                        }
                                                        placeholder="Write a reply…"
                                                    />
                                                </Box>
                                            )}

                                            {/* kids */}
                                            {kids.length > 0 && (
                                                <Box sx={{ mt: 1.25, pl: 3, borderLeft: '2px solid', borderColor: 'divider' }}>
                                                    {kids.map((r) => {
                                                        const rn = `${r.first_name || ''} ${r.last_name || ''}`.trim();
                                                        const rh = r.handle || r.username ? `@${r.handle || r.username}` : '';
                                                        return (
                                                            <Box key={r.id} sx={{ display: 'flex', gap: 1.25, py: 1 }}>
                                                                <Avatar src={r.avatar_url} sx={{ width: 28, height: 28 }}>{r.first_name?.[0]}</Avatar>
                                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                                    <Typography variant="subtitle2">{rn || 'User'}</Typography>
                                                                    {rh && (
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25 }}>
                                                                            {rh}
                                                                        </Typography>
                                                                    )}
                                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                                                                        {r.content}
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        );
                                                    })}
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })
                        )}
                    </Box>

                    {/* Actions + composer (bottom) */}
                    <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.25 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Tooltip title={liked ? 'Unlike' : 'Like'}>
                                <IconButton onClick={toggleLike}>
                                    {liked ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
                                </IconButton>
                            </Tooltip>
                            <Typography variant="caption">{likes}</Typography>

                            <Tooltip title="Comment">
                                <IconButton>
                                    <ChatBubbleOutlineIcon />
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Share">
                                <IconButton onClick={() => setShareOpen(true)}>
                                    <ShareIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        {viewer ? (
                            <InlineComposer
                                avatar={avatar}
                                onSubmit={postComment}
                                disabled={!commentLimiter.canSend}
                                disabledTooltip={
                                    commentLimiter.blocked
                                        ? 'To prevent spam on our posts, we limit the number of comments made quickly. Please try again in 5 minutes.'
                                        : ''
                                }
                            />
                        ) : (
                            <Typography variant="body2" sx={{ px: 0.5 }}>
                                <Button size="small" onClick={openAuth}>Log in</Button> to comment.
                            </Typography>
                        )}
                    </Box>
                </Box>
            </DialogContent>

            {/* Share */}
            <SharePhotoDialog
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                viewer={viewer}
                photo={current}
            />
        </Dialog>
    );
}
