// src/components/ActionBar.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
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
    IconButton,
} from '@mui/material';

import CloseIcon from '@mui/icons-material/Close';

import { useAuth } from './AuthModalContext';

import likeIconDiscreet from '../assets/actionBar/like_icon_discreet.png';
import likeIconLit from '../assets/actionBar/like_icon_lit.png';

import commentIconDiscreet from '../assets/actionBar/comment_discreet.png';
import commentIconLit from '../assets/actionBar/comment_lit.png';

import repostIconDiscreet from '../assets/actionBar/repost_discreet.png';
import repostIconLit from '../assets/actionBar/repost_lit.png';

import shareIconDiscreet from '../assets/actionBar/share_discreet.png';
import shareIconLit from '../assets/actionBar/share_lit.png';

import reportIconDiscreet from '../assets/actionBar/report_discreet.png';
import reportIconLit from '../assets/actionBar/report_lit.png';

import boostIconLit from '../assets/actionBar/boost_lit.png';

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


/* Lightweight in-memory cache so optimistic like/repost doesn't revert on re-mount
   (e.g., switching tabs causes cards to unmount and mount with stale props). */
function getActionStateCache() {
    if (typeof window === 'undefined') return {};
    if (!window.__llPostActionState) window.__llPostActionState = {};
    return window.__llPostActionState;
}
function readCachedActionState(postId) {
    const cache = getActionStateCache();
    return cache && cache[String(postId)] ? cache[String(postId)] : null;
}
function writeCachedActionState(postId, patch) {
    const cache = getActionStateCache();
    const key = String(postId);
    const prev = cache[key] || {};
    cache[key] = { ...prev, ...patch, t: Date.now() };
}

function broadcast(evt, detail) {
    try {
        if (detail && (evt === LIKE_EVT || evt === REPOST_EVT)) {
            if (evt === LIKE_EVT) {
                writeCachedActionState(detail.postId, { liked: Boolean(detail.liked), likes: clamp0(detail.likes) });
            } else if (evt === REPOST_EVT) {
                writeCachedActionState(detail.postId, { reposted: Boolean(detail.reposted), reposts: clamp0(detail.reposts) });
            }
        }
        window.dispatchEvent(new CustomEvent(evt, { detail }));
    } catch {
        /* no-op */
    }
}

/* ────────────────────────────────────────────────────────────────────────────
   Report dialog (X to close, no click-away)
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
                <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
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

ReportDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
};

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
                                      onLikeChange,
                                      onRepostChange,
                                  }) {
    const apiBase = ''; // same-origin
    const auth = useAuth();

    // Use AuthModalContext as a fallback if caller forgot to pass `user`
    const viewer = user || auth?.user || null;

    // state
    const [likes, setLikes] = useState(clamp0(initialLikes));
    const [liked, setLiked] = useState(Boolean(initiallyLiked));
    const [reposts, setReposts] = useState(clamp0(initialReposts));
    const [reposted, setReposted] = useState(Boolean(initiallyReposted));

    const [likeBusy, setLikeBusy] = useState(false);
    const [repostBusy, setRepostBusy] = useState(false);

    const [reportOpen, setReportOpen] = useState(false);
    const [toast, setToast] = useState({ open: false, msg: '' });

    // Hover / burst (visual only)
    const [likeHover, setLikeHover] = useState(false);
    const [likeSuppressHover, setLikeSuppressHover] = useState(false);
    const [commentHover, setCommentHover] = useState(false);
    const [repostHover, setRepostHover] = useState(false);
    const [repostSuppressHover, setRepostSuppressHover] = useState(false);
    const [shareHover, setShareHover] = useState(false);
    const [reportHover, setReportHover] = useState(false);

    const [boostHover, setBoostHover] = useState(false);

    const [likeBurst, setLikeBurst] = useState(0);
    const [commentBurst, setCommentBurst] = useState(0);
    const [repostBurst, setRepostBurst] = useState(0);
    const [shareBurst, setShareBurst] = useState(0);
    const [reportBurst, setReportBurst] = useState(0);

    // keep "latest" refs to avoid stale closures
    const likesRef = useRef(likes);
    const likedRef = useRef(liked);
    const repostsRef = useRef(reposts);
    const repostedRef = useRef(reposted);

    useEffect(() => {
        likesRef.current = likes;
    }, [likes]);
    useEffect(() => {
        likedRef.current = liked;
    }, [liked]);
    useEffect(() => {
        repostsRef.current = reposts;
    }, [reposts]);
    useEffect(() => {
        repostedRef.current = reposted;
    }, [reposted]);

    // sync only when switching to a different postId (avoid reverting optimistic unlike/repost on parent re-renders)
    useEffect(() => {
        const cached = readCachedActionState(postId);

        setLikes(clamp0(cached && cached.likes != null ? cached.likes : initialLikes));
        setLiked(Boolean(cached && cached.liked != null ? cached.liked : initiallyLiked));
        setReposts(clamp0(cached && cached.reposts != null ? cached.reposts : initialReposts));
        setReposted(Boolean(cached && cached.reposted != null ? cached.reposted : initiallyReposted));

        setLikeHover(false);
        setLikeSuppressHover(false);
        setCommentHover(false);
        setRepostHover(false);
        setRepostSuppressHover(false);
        setShareHover(false);
        setReportHover(false);
        setBoostHover(false);
    }, [postId]);

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
        } catch {
            /* no-op */
        }
    }, [auth]);

    // treat user as logged in if either props.user OR auth.user exists
    const requireAuth = useCallback(
        (cb) => {
            const u = viewer;
            if (u && (u.id || u.handle)) return cb?.();
            openAuthUI();
            return undefined;
        },
        [viewer, openAuthUI]
    );

    /* ────────────────────────────────────────────────────────────────────────
       LIKE (optimistic + server reconciliation)
       ──────────────────────────────────────────────────────────────────────── */
    const likeReqId = useRef(0);

    const handleLike = useCallback(() => {
        requireAuth(async () => {
            if (likeBusy) return;
            setLikeBusy(true);
            const reqId = ++likeReqId.current;

            const prevLiked = Boolean(likedRef.current);
            const prevLikes = clamp0(likesRef.current);
            const nextLiked = !prevLiked;
            const newLikes = clamp0(prevLikes + (nextLiked ? 1 : -1));

            setLiked(nextLiked);
            setLikes(newLikes);

            // If they UN-like while still hovering/focused, force the discreet lantern until they leave.
            if (!nextLiked) setLikeSuppressHover(true);
            else setLikeSuppressHover(false);

            if (nextLiked) setLikeBurst((v) => v + 1);

            broadcast(LIKE_EVT, { postId, liked: nextLiked, likes: newLikes });
            onLikeChange?.({ postId, liked: nextLiked });

            const result = await tryPost(
                [
                    `/api/community/posts/${encodeURIComponent(postId)}/like`,
                    `/api/community/${encodeURIComponent(postId)}/like`,
                    `/api/posts/${encodeURIComponent(postId)}/like`,
                    `${apiBase}/api/posts/${encodeURIComponent(postId)}/like`,
                ],
                {}
            );

            if (reqId !== likeReqId.current) return;

            if (result) {
                const serverLiked = result.viewerLiked ?? result.viewer_liked ?? result.is_liked ?? result.liked;
                const serverLikes =
                    result.likesCount ??
                    result.likes_count ??
                    result.like_count ??
                    result.count ??
                    result.likes;

                if (serverLiked != null || serverLikes != null) {
                    const finalLiked = serverLiked != null ? Boolean(serverLiked) : nextLiked;
                    const finalLikes = clamp0(serverLikes != null ? Number(serverLikes) : newLikes);

                    setLiked(finalLiked);
                    setLikes(finalLikes);

                    if (finalLiked && !nextLiked) setLikeBurst((v) => v + 1);

                    broadcast(LIKE_EVT, { postId, liked: finalLiked, likes: finalLikes });
                    onLikeChange?.({ postId, liked: finalLiked });
                }
            }

            setLikeBusy(false);
        });
    }, [apiBase, postId, likeBusy, requireAuth, onLikeChange]);

    /* ────────────────────────────────────────────────────────────────────────
       REPOST (mirrors like)
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

            // If they UN-repost while still hovering/focused, force the discreet icon until they leave.
            if (!nextReposted) setRepostSuppressHover(true);
            else setRepostSuppressHover(false);

            if (nextReposted) setRepostBurst((v) => v + 1);

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
                    result.repostsCount ??
                    result.reposts_count ??
                    result.repost_count ??
                    result.count ??
                    result.reposts;

                if (serverReposted != null || serverReposts != null) {
                    const finalReposted = serverReposted != null ? Boolean(serverReposted) : nextReposted;
                    const finalReposts = clamp0(serverReposts != null ? Number(serverReposts) : newReposts);

                    setReposted(finalReposted);
                    setReposts(finalReposts);

                    if (finalReposted && !nextReposted) setRepostBurst((v) => v + 1);

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
            setToast({
                open: true,
                msg: ok ? 'Thanks for the report.' : 'Could not send report. Please try again.',
            });
        },
        [apiBase, postId]
    );

    const likeIconSrc = liked || (likeHover && !likeSuppressHover) ? likeIconLit : likeIconDiscreet;
    const likeTooltipTitle = liked ? 'Unlike' : 'Like';

    const commentIconSrc = commentHover ? commentIconLit : commentIconDiscreet;
    const repostIconSrc = reposted || (repostHover && !repostSuppressHover) ? repostIconLit : repostIconDiscreet;
    const repostTooltipTitle = reposted ? 'Undo repost' : 'Repost';
    const shareIconSrc = shareHover ? shareIconLit : shareIconDiscreet;
    const reportIconSrc = reportHover ? reportIconLit : reportIconDiscreet;

    const boostIconSrc = boostIconLit;

    const glowBg =
        'radial-gradient(circle, rgba(201,162,77,0.70) 0%, rgba(201,162,77,0.28) 40%, rgba(201,162,77,0.00) 72%)';

    const pillSx = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: { xs: 0.9, sm: 1 },
        py: 0.5,
        borderRadius: 999,
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        bgcolor: 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': {
            boxShadow: (t) => `0 0 0 4px ${t.palette.action.focus}`,
        },
        '@keyframes llActionGlow': {
            '0%': { transform: 'translate(-50%, -50%) scale(0.55)', opacity: 0.0 },
            '14%': { opacity: 0.95 },
            '60%': { opacity: 0.28 },
            '100%': { transform: 'translate(-50%, -50%) scale(1.55)', opacity: 0.0 },
        },
        '@media (prefers-reduced-motion: reduce)': {
            '@keyframes llActionGlow': {
                '0%': { opacity: 0.0 },
                '100%': { opacity: 0.0 },
            },
        },
    };

    const iconBoxSx = (kind) => ({
        position: 'relative',
        width:
            kind === 'like'
                ? { xs: 22, sm: 24 }
                : kind === 'boost'
                    ? { xs: 32, sm: 36 }
                    : { xs: 22, sm: 24 },
        height:
            kind === 'like'
                ? { xs: 32, sm: 35 }
                : kind === 'boost'
                    ? { xs: 32, sm: 36 }
                    : { xs: 22, sm: 24 },
        flexShrink: 0,
    });

    const iconImgSx = (hovered, scale = 1, yOffset = 0) => ({
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit: 'contain',
        filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.18))',
        transform: `translateY(${yOffset + (hovered ? -1 : 0)}px) scale(${scale})`,
        transition: 'transform 140ms ease, filter 140ms ease',
        pointerEvents: 'none',
    });

    const handleCommentClick = useCallback(() => {
        setCommentBurst((v) => v + 1);
        onComment?.();
    }, [onComment]);

    const handleShareClick = useCallback(() => {
        setShareBurst((v) => v + 1);
        onShare?.();
    }, [onShare]);

    const handleReportClick = useCallback(() => {
        requireAuth(() => {
            setReportBurst((v) => v + 1);
            setReportOpen(true);
        });
    }, [requireAuth]);

    return (
        <>
            <Box
                role="group"
                aria-label="Post actions"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    flexWrap: 'wrap',
                    justifyContent: 'flex-start',
                }}
            >
                {/* Left: Like + Comment */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                    <Tooltip title={likeTooltipTitle}>
                        <Box
                            onClick={handleLike}
                            onKeyDown={(e) =>
                                e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleLike()) : null
                            }
                            onMouseEnter={() => {
                                setLikeHover(true);
                                setLikeSuppressHover(false);
                            }}
                            onMouseLeave={() => {
                                setLikeHover(false);
                                setLikeSuppressHover(false);
                            }}
                            onFocus={() => {
                                setLikeHover(true);
                                setLikeSuppressHover(false);
                            }}
                            onBlur={() => {
                                setLikeHover(false);
                                setLikeSuppressHover(false);
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label={liked ? 'Unlike' : 'Like'}
                            aria-pressed={liked ? 'true' : 'false'}
                            sx={{
                                ...pillSx,
                                cursor: likeBusy ? 'default' : 'pointer',
                            }}
                        >
                            <Box sx={iconBoxSx('like')}>
                                {likeBurst > 0 && liked && (
                                    <Box
                                        key={`like-burst-${postId}-${likeBurst}`}
                                        aria-hidden="true"
                                        sx={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            width: { xs: 86, sm: 96 },
                                            height: { xs: 86, sm: 96 },
                                            transform: 'translate(-50%, -50%)',
                                            borderRadius: '50%',
                                            background: glowBg,
                                            filter: 'blur(0.2px)',
                                            animation: 'llActionGlow 600ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                )}

                                <Box
                                    component="img"
                                    src={likeIconSrc}
                                    alt=""
                                    draggable={false}
                                    sx={iconImgSx(likeHover || liked, 1, -3)}
                                />
                            </Box>

                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: 800,
                                    color: liked ? 'primary.main' : 'text.primary',
                                    lineHeight: 1,
                                    transform: 'translateY(-1px)',
                                }}
                            >
                                {fmtCount(likes)}
                            </Typography>
                        </Box>
                    </Tooltip>

                    <Tooltip title="Comments">
                        <Box
                            onClick={handleCommentClick}
                            onKeyDown={(e) =>
                                e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleCommentClick()) : null
                            }
                            onMouseEnter={() => setCommentHover(true)}
                            onMouseLeave={() => setCommentHover(false)}
                            onFocus={() => setCommentHover(true)}
                            onBlur={() => setCommentHover(false)}
                            tabIndex={0}
                            role="button"
                            aria-label="Open comments"
                            sx={pillSx}
                        >
                            <Box sx={iconBoxSx('boost')}>
                                {commentBurst > 0 && (
                                    <Box
                                        key={`comment-burst-${postId}-${commentBurst}`}
                                        aria-hidden="true"
                                        sx={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            width: { xs: 64, sm: 74 },
                                            height: { xs: 64, sm: 74 },
                                            transform: 'translate(-50%, -50%)',
                                            borderRadius: '50%',
                                            background: glowBg,
                                            filter: 'blur(0.2px)',
                                            animation: 'llActionGlow 520ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                )}

                                <Box
                                    component="img"
                                    src={commentIconSrc}
                                    alt=""
                                    draggable={false}
                                    sx={iconImgSx(commentHover, 0.93)}
                                />
                            </Box>

                            <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1, transform: 'translateY(-1px)' }}>
                                {fmtCount(commentsCount)}
                            </Typography>
                        </Box>
                    </Tooltip>
                </Box>

                {/* Right: Repost + Share + Report */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.15, flexWrap: 'wrap' }}>
                    <Tooltip title={repostTooltipTitle}>
                        <Box
                            onClick={handleRepost}
                            onKeyDown={(e) =>
                                e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleRepost()) : null
                            }
                            onMouseEnter={() => {
                                setRepostHover(true);
                                setRepostSuppressHover(false);
                            }}
                            onMouseLeave={() => {
                                setRepostHover(false);
                                setRepostSuppressHover(false);
                            }}
                            onFocus={() => {
                                setRepostHover(true);
                                setRepostSuppressHover(false);
                            }}
                            onBlur={() => {
                                setRepostHover(false);
                                setRepostSuppressHover(false);
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label={repostTooltipTitle}
                            aria-pressed={reposted ? 'true' : 'false'}
                            sx={{
                                ...pillSx,
                                cursor: repostBusy ? 'default' : 'pointer',
                            }}
                        >
                            <Box sx={iconBoxSx('other')}>
                                {repostBurst > 0 && reposted && (
                                    <Box
                                        key={`repost-burst-${postId}-${repostBurst}`}
                                        aria-hidden="true"
                                        sx={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            width: { xs: 78, sm: 88 },
                                            height: { xs: 78, sm: 88 },
                                            transform: 'translate(-50%, -50%)',
                                            borderRadius: '50%',
                                            background: glowBg,
                                            filter: 'blur(0.2px)',
                                            animation: 'llActionGlow 540ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                )}

                                <Box
                                    component="img"
                                    src={repostIconSrc}
                                    alt=""
                                    draggable={false}
                                    sx={iconImgSx(repostHover || reposted, 0.93)}
                                />
                            </Box>

                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: 800,
                                    color: reposted ? 'primary.main' : 'text.primary',
                                    lineHeight: 1,
                                    transform: 'translateY(-1px)',
                                }}
                            >
                                {fmtCount(reposts)}
                            </Typography>
                        </Box>
                    </Tooltip>

                    <Tooltip title="Share">
                        <Box
                            onClick={handleShareClick}
                            onKeyDown={(e) =>
                                e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleShareClick()) : null
                            }
                            onMouseEnter={() => setShareHover(true)}
                            onMouseLeave={() => setShareHover(false)}
                            onFocus={() => setShareHover(true)}
                            onBlur={() => setShareHover(false)}
                            tabIndex={0}
                            role="button"
                            aria-label="Share post"
                            sx={pillSx}
                        >
                            <Box sx={iconBoxSx('other')}>
                                {shareBurst > 0 && (
                                    <Box
                                        key={`share-burst-${postId}-${shareBurst}`}
                                        aria-hidden="true"
                                        sx={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            width: { xs: 78, sm: 88 },
                                            height: { xs: 78, sm: 88 },
                                            transform: 'translate(-50%, -50%)',
                                            borderRadius: '50%',
                                            background: glowBg,
                                            opacity: 0.7,
                                            filter: 'blur(0.2px)',
                                            animation: 'llActionGlow 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                )}

                                <Box
                                    component="img"
                                    src={shareIconSrc}
                                    alt=""
                                    draggable={false}
                                    sx={iconImgSx(shareHover, 0.86, -1)}
                                />
                            </Box>
                        </Box>
                    </Tooltip>


                    <Tooltip title="Boost Post">
                        <Box
                            onMouseEnter={() => setBoostHover(true)}
                            onMouseLeave={() => setBoostHover(false)}
                            onFocus={() => setBoostHover(true)}
                            onBlur={() => setBoostHover(false)}
                            tabIndex={0}
                            role="button"
                            aria-label="Boost post"
                            sx={pillSx}
                        >
                            <Box sx={iconBoxSx('boost')}>
                                <Box
                                    component="img"
                                    src={boostIconSrc}
                                    alt=""
                                    draggable={false}
                                    sx={iconImgSx(boostHover, 1.12, -1)}
                                />
                            </Box>
                        </Box>
                    </Tooltip>

                    {enableFlag && (
                        <Tooltip title="Report">
                            <Box
                                onClick={handleReportClick}
                                onKeyDown={(e) =>
                                    e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), handleReportClick()) : null
                                }
                                onMouseEnter={() => setReportHover(true)}
                                onMouseLeave={() => setReportHover(false)}
                                onFocus={() => setReportHover(true)}
                                onBlur={() => setReportHover(false)}
                                tabIndex={0}
                                role="button"
                                aria-label="Report post"
                                sx={pillSx}
                            >
                                <Box sx={iconBoxSx('other')}>
                                    {reportBurst > 0 && (
                                        <Box
                                            key={`report-burst-${postId}-${reportBurst}`}
                                            aria-hidden="true"
                                            sx={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                width: { xs: 58, sm: 68 },
                                                height: { xs: 58, sm: 68 },
                                                transform: 'translate(-50%, -50%)',
                                                borderRadius: '50%',
                                                background: glowBg,
                                                opacity: 0.6,
                                                filter: 'blur(0.2px)',
                                                animation: 'llActionGlow 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                    )}

                                    <Box
                                        component="img"
                                        src={reportIconSrc}
                                        alt=""
                                        draggable={false}
                                        sx={iconImgSx(reportHover, 0.84, -1)}
                                    />
                                </Box>
                            </Box>
                        </Tooltip>
                    )}
                </Box>
            </Box>

            <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} />

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
    onLikeChange: PropTypes.func,
    onRepostChange: PropTypes.func,
};