// src/components/ActionBar.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    IconButton,
    Tooltip,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    RadioGroup,
    FormControlLabel,
    Radio,
    TextField,
    Snackbar,
} from '@mui/material';

import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import RepeatIcon from '@mui/icons-material/Repeat';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CloseIcon from '@mui/icons-material/Close';

import { useAuth } from './AuthModalContext';

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────────────── */

const fmtCount = (n = 0) => {
    const x = Number(n) || 0;
    if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x % 1_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
    if (x >= 1_000) return `${(x / 1_000).toFixed(x % 1_000 ? 1 : 0).replace(/\.0$/, '')}k`;
    return String(x);
};

const clamp0 = (v) => Math.max(0, Number.isFinite(v) ? v : 0);

async function tryPost(urls, body) {
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (res.ok) {
                try {
                    return await res.json();
                } catch {
                    return {};
                }
            }
        } catch {
            // try next
        }
    }
    return null;
}

/* Event bus to sync list + detail panes */
const LIKE_EVT = 'll:post:like-changed';
const REPOST_EVT = 'll:post:repost-changed';

function broadcast(evt, detail) {
    try {
        window.dispatchEvent(new CustomEvent(evt, { detail }));
    } catch {
        /* no-op */
    }
}

/* ────────────────────────────────────────────────────────────────────────────
   Report dialog (keeps your original behavior: X to close, no click-away)
   ─────────────────────────────────────────────────────────────────────────── */
function ReportDialog({ open, onClose, onSubmit }) {
    const [reason, setReason] = useState('spam');
    const [details, setDetails] = useState('');

    useEffect(() => {
        if (!open) {
            setReason('spam');
            setDetails('');
        }
    }, [open]);

    return (
        <Dialog
            open={open}
            onClose={(_, r) => {
                if (r === 'backdropClick' || r === 'escapeKeyDown') return;
                onClose();
            }}
            fullWidth
            maxWidth="xs"
            PaperProps={{ sx: { position: 'relative' } }}
        >
            <DialogTitle sx={{ pr: 7 }}>
                Report post
                <IconButton
                    aria-label="Close"
                    onClick={onClose}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
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

/* ────────────────────────────────────────────────────────────────────────────
   Component
   ─────────────────────────────────────────────────────────────────────────── */
export default function ActionBar({
                                      user,
                                      postId,
                                      initialLikes = 0,
                                      initiallyLiked = false,
                                      initialReposts = 0,
                                      initiallyReposted = false,
                                      commentsCount = 0,
                                      onComment,
                                      onShare,
                                      enableFlag = true,
                                      showLabels = false, // kept for API compatibility; UI remains icon-first as requested
                                      onLikeChange,
                                      onRepostChange,
                                  }) {
    const apiBase = ''; // same-origin
    const auth = useAuth();

    // state
    const [likes, setLikes] = useState(clamp0(initialLikes));
    const [liked, setLiked] = useState(Boolean(initiallyLiked));
    const [reposts, setReposts] = useState(clamp0(initialReposts));
    const [reposted, setReposted] = useState(Boolean(initiallyReposted));

    const [likeBusy, setLikeBusy] = useState(false);
    const [repostBusy, setRepostBusy] = useState(false);

    const [reportOpen, setReportOpen] = useState(false);
    const [toast, setToast] = useState({ open: false, msg: '' });

    // keep "latest" refs to avoid stale closures
    const likesRef = useRef(likes);
    const likedRef = useRef(liked);
    const repostsRef = useRef(reposts);
    const repostedRef = useRef(reposted);

    useEffect(() => { likesRef.current = likes; }, [likes]);
    useEffect(() => { likedRef.current = liked; }, [liked]);
    useEffect(() => { repostsRef.current = reposts; }, [reposts]);
    useEffect(() => { repostedRef.current = reposted; }, [reposted]);

    // sync when switching to a different post
    useEffect(() => {
        setLikes(clamp0(initialLikes));
        setLiked(Boolean(initiallyLiked));
        setReposts(clamp0(initialReposts));
        setReposted(Boolean(initiallyReposted));
    }, [postId, initialLikes, initiallyLiked, initialReposts, initiallyReposted]);

    // listen for global like/repost changes for this post
    useEffect(() => {
        const onLike = (e) => {
            const d = e?.detail;
            if (!d || String(d.postId) !== String(postId)) return;
            setLikes(clamp0(d.likes));
            setLiked(Boolean(d.liked));
        };
        const onRepost = (e) => {
            const d = e?.detail;
            if (!d || String(d.postId) !== String(postId)) return;
            setReposts(clamp0(d.reposts));
            setReposted(Boolean(d.reposted));
        };
        window.addEventListener(LIKE_EVT, onLike);
        window.addEventListener(REPOST_EVT, onRepost);
        return () => {
            window.removeEventListener(LIKE_EVT, onLike);
            window.removeEventListener(REPOST_EVT, onRepost);
        };
    }, [postId]);

    const openAuthUI = useCallback(() => {
        if (auth && typeof auth.open === 'function') auth.open();
        try {
            window.dispatchEvent(new CustomEvent('open-auth-modal'));
            window.dispatchEvent(new CustomEvent('open-login'));
            window.dispatchEvent(new CustomEvent('open-auth-dialog'));
            window.dispatchEvent(new CustomEvent('open-login-popup'));
        } catch {/* no-op */}
    }, [auth]);

    const requireAuth = useCallback(
        (cb) => {
            if (user && (user.id || user.handle)) return cb?.();
            openAuthUI();
            return undefined;
        },
        [user, openAuthUI]
    );

    /* ────────────────────────────────────────────────────────────────────────
       LIKE (sanitized optimistic update + authoritative server reconciliation)
       ──────────────────────────────────────────────────────────────────────── */
    const likeReqId = useRef(0);
    const handleLike = useCallback(() => {
        requireAuth(async () => {
            if (likeBusy) return;
            setLikeBusy(true);
            const reqId = ++likeReqId.current;

            // compute from latest refs, not stale closures
            const prevLiked = Boolean(likedRef.current);
            const prevLikes = clamp0(likesRef.current);
            const nextLiked = !prevLiked;
            const newLikes = clamp0(prevLikes + (nextLiked ? 1 : -1));

            // optimistic state + broadcast sanitized value
            setLiked(nextLiked);
            setLikes(newLikes);
            broadcast(LIKE_EVT, { postId, liked: nextLiked, likes: newLikes });
            onLikeChange?.({ postId, liked: nextLiked });

            // ask the server; accept whatever authoritative shape it returns
            const result = await tryPost(
                [
                    `/api/community/posts/${encodeURIComponent(postId)}/like`,
                    `/api/community/${encodeURIComponent(postId)}/like`,
                    `/api/posts/${encodeURIComponent(postId)}/like`,
                    `${apiBase}/api/posts/${encodeURIComponent(postId)}/like`,
                ],
                {}
            );

            // Only handle the most recent request
            if (reqId !== likeReqId.current) return;

            if (result) {
                const serverLiked =
                    result.viewerLiked ?? result.viewer_liked ?? result.is_liked ?? result.liked;
                const serverLikes =
                    result.likesCount ?? result.likes_count ?? result.like_count ?? result.count ?? result.likes;

                // If server provided values, sanitize, adopt, and rebroadcast
                if (serverLiked != null || serverLikes != null) {
                    const finalLiked = serverLiked != null ? Boolean(serverLiked) : nextLiked;
                    const finalLikes = clamp0(serverLikes != null ? Number(serverLikes) : newLikes);

                    setLiked(finalLiked);
                    setLikes(finalLikes);
                    broadcast(LIKE_EVT, { postId, liked: finalLiked, likes: finalLikes });
                    onLikeChange?.({ postId, liked: finalLiked });
                }
            }

            setLikeBusy(false);
        });
    }, [apiBase, postId, likeBusy, requireAuth, onLikeChange]);

    /* ────────────────────────────────────────────────────────────────────────
       REPOST (kept, mirrors like approach; not shown in screenshots, but intact)
       ──────────────────────────────────────────────────────────────────────── */
    const repostReqId = useRef(0);
    const handleRepost = useCallback(() => {
        requireAuth(async () => {
            if (repostBusy) return;
            setRepostBusy(true);
            const reqId = ++repostReqId.current;

            const prevReposted = Boolean(repostedRef.current);
            const prevReposts = clamp0(repostsRef.current);
            const nextReposted = !prevReposted;
            const newReposts = clamp0(prevReposts + (nextReposted ? 1 : -1));

            setReposted(nextReposted);
            setReposts(newReposts);
            broadcast(REPOST_EVT, { postId, reposted: nextReposted, reposts: newReposts });
            onRepostChange?.({ postId, reposted: nextReposted });

            const result = await tryPost(
                [
                    `/api/community/posts/${encodeURIComponent(postId)}/repost`,
                    `/api/community/${encodeURIComponent(postId)}/repost`,
                    `/api/posts/${encodeURIComponent(postId)}/repost`,
                    `${apiBase}/api/posts/${encodeURIComponent(postId)}/repost`,
                ],
                {}
            );

            if (reqId !== repostReqId.current) return;

            if (result) {
                const serverReposted =
                    result.viewerReposted ?? result.viewer_reposted ?? result.is_reposted ?? result.reposted;
                const serverReposts =
                    result.repostsCount ?? result.reposts_count ?? result.repost_count ?? result.count ?? result.reposts;

                if (serverReposted != null || serverReposts != null) {
                    const finalReposted = serverReposted != null ? Boolean(serverReposted) : nextReposted;
                    const finalReposts = clamp0(serverReposts != null ? Number(serverReposts) : newReposts);

                    setReposted(finalReposted);
                    setReposts(finalReposts);
                    broadcast(REPOST_EVT, { postId, reposted: finalReposted, reposts: finalReposts });
                    onRepostChange?.({ postId, reposted: finalReposted });
                }
            }

            setRepostBusy(false);
        });
    }, [apiBase, postId, repostBusy, requireAuth, onRepostChange]);

    /* ────────────────────────────────────────────────────────────────────────
       Report
       ──────────────────────────────────────────────────────────────────────── */
    const submitReport = useCallback(
        async ({ reason, details }) => {
            const ok = await tryPost(
                [
                    `/api/community/posts/${encodeURIComponent(postId)}/flag`,
                    `/api/community/${encodeURIComponent(postId)}/flag`,
                    `/api/posts/${encodeURIComponent(postId)}/flag`,
                    `${apiBase}/api/posts/${encodeURIComponent(postId)}/flag`,
                ],
                { reason, details }
            );
            setReportOpen(false);
            setToast({ open: true, msg: ok ? 'Thanks for the report.' : 'Could not send report. Please try again.' });
        },
        [apiBase, postId]
    );

    /* ────────────────────────────────────────────────────────────────────────
       Layout (icon-first — no extra text labels unless you flip showLabels)
       ──────────────────────────────────────────────────────────────────────── */
    return (
        <>
            <Box
                role="group"
                aria-label="Post actions"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                    justifyContent: 'left',
                }}
            >
                {/* Left: Like + Comment */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Tooltip title={liked ? 'Unlike' : 'Like'}>
                        <Box
                            onClick={handleLike}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleLike()) : null)}
                            tabIndex={0}
                            role="button"
                            aria-pressed={liked ? 'true' : 'false'}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 1,
                                py: 0.5,
                                borderRadius: 999,
                                bgcolor: liked ? 'primary.main' : 'transparent',
                                color: liked ? '#fff' : 'text.primary',
                                cursor: likeBusy ? 'default' : 'pointer',
                                '&:hover': { bgcolor: liked ? 'primary.dark' : 'action.hover' },
                            }}
                        >
                            {liked ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOffAltIcon fontSize="small" />}
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {fmtCount(likes)}
                            </Typography>
                        </Box>
                    </Tooltip>

                    <Tooltip title="Comments">
                        <Box
                            onClick={() => onComment?.()}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), onComment?.()) : null)}
                            tabIndex={0}
                            role="button"
                            aria-label="Open comments"
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 1,
                                py: 0.5,
                                borderRadius: 999,
                                cursor: likeBusy ? 'default' : 'pointer',
                                '&:hover': { bgcolor: 'action.hover' },
                            }}
                        >
                            <ChatBubbleOutlineIcon fontSize="small" />
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {fmtCount(commentsCount)}
                            </Typography>
                        </Box>
                    </Tooltip>
                </Box>

                {/* Right: Repost + Share + Report */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title={reposted ? 'Undo repost' : 'Repost'}>
                        <Box
                            onClick={handleRepost}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleRepost()) : null)}
                            tabIndex={0}
                            role="button"
                            aria-pressed={reposted ? 'true' : 'false'}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 1,
                                py: 0.5,
                                borderRadius: 999,
                                bgcolor: reposted ? 'success.main' : 'transparent',
                                cursor: likeBusy ? 'default' : 'pointer',
                                color: reposted ? '#fff' : 'text.primary',
                                '&:hover': { bgcolor: reposted ? 'success.dark' : 'action.hover' },
                            }}
                        >
                            <RepeatIcon fontSize="small" />
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {fmtCount(reposts)}
                            </Typography>
                        </Box>
                    </Tooltip>

                    <Tooltip title="Share">
                        <IconButton onClick={() => onShare?.()} size="small" aria-label="Share post">
                            <ShareOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    {enableFlag && (
                        <Tooltip title="Report">
                            <IconButton
                                onClick={() => requireAuth(() => setReportOpen(true))}
                                size="small"
                                aria-label="Report post"
                            >
                                <FlagOutlinedIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>

            {/* Report dialog */}
            <ReportDialog
                open={reportOpen}
                onClose={() => setReportOpen(false)}
                onSubmit={submitReport}
            />

            {/* Toast */}
            <Snackbar
                open={toast.open}
                autoHideDuration={3000}
                onClose={() => setToast({ open: false, msg: '' })}
                message={toast.msg}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
        </>
    );
}

ActionBar.propTypes = {
    user: PropTypes.any,
    postId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    initialLikes: PropTypes.number,
    initiallyLiked: PropTypes.bool,
    initialReposts: PropTypes.number,
    initiallyReposted: PropTypes.bool,
    commentsCount: PropTypes.number,
    onComment: PropTypes.func,
    onShare: PropTypes.func,
    enableFlag: PropTypes.bool,
    showLabels: PropTypes.bool,
    onLikeChange: PropTypes.func,
    onRepostChange: PropTypes.func,
};
