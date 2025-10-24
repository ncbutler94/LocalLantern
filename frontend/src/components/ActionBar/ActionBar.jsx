// src/components/ActionBar/ActionBar.jsx
import React, { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import RepeatIcon from '@mui/icons-material/Repeat';
import { useAuthModal } from '../../contexts/AuthModalContext';

/**
 * Robust, self-contained action bar used by both:
 *  - Community page cards
 *  - User profile right-rail cards (standalone list)
 *
 * Features:
 *  - Optimistic updates with rollback on failure
 *  - Guards against double-click spamming (in-flight flags)
 *  - Emits a small window event so other open lists can stay in sync
 *  - Optional auth modal via context; safe fallback if not provided
 *  - A11y labels + tooltips
 */
export default function ActionBar({
                                      user,
                                      postId,
                                      initialLikes = 0,
                                      initiallyLiked = false,
                                      initialReposts = 0,
                                      initiallyReposted = false,
                                      commentsCount = 0,
                                      onComment,
                                      onShare, // parent opens SharePostDialog
                                  }) {
    const apiBase = ''; // keep relative (/api/...) to match existing routes

    // ✅ Hooks must be called at the top level (fixes ESLint rules-of-hooks)
    const auth = useAuthModal();

    const [likes, setLikes] = useState(Number.isFinite(initialLikes) ? initialLikes : 0);
    const [liked, setLiked] = useState(Boolean(initiallyLiked));

    const [reposts, setReposts] = useState(
        Number.isFinite(initialReposts) ? initialReposts : 0
    );
    const [reposted, setReposted] = useState(Boolean(initiallyReposted));

    const likeInFlight = useRef(false);
    const repostInFlight = useRef(false);

    const openAuthUI = useCallback(() => {
        if (auth && typeof auth.open === 'function') {
            auth.open();
            return;
        }
        // Fallbacks if the AuthModal context isn't wired in this page
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

    const emitSync = useCallback((type, payload) => {
        try {
            window.dispatchEvent(new CustomEvent(type, { detail: payload }));
        } catch {
            // no-op if CustomEvent not available
        }
    }, []);

    const handleLike = useCallback(() => {
        requireAuth(async () => {
            if (likeInFlight.current) return;
            likeInFlight.current = true;

            const next = !liked;

            // optimistic UI + emit inside functional updater (no stale closures)
            setLiked(next);
            setLikes((prev) => {
                const updated = prev + (next ? 1 : -1);
                emitSync('post-like-changed', { postId, liked: next, likes: updated });
                return updated;
            });

            try {
                const res = await fetch(`${apiBase}/api/posts/${postId}/like`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ category: 'community_post' }),
                });
                if (!res.ok) throw new Error('Like failed');
            } catch {
                // rollback
                setLiked(!next);
                setLikes((prev) => {
                    const updated = prev + (next ? -1 : 1);
                    emitSync('post-like-changed', { postId, liked: !next, likes: updated });
                    return updated;
                });
            } finally {
                likeInFlight.current = false;
            }
        });
    }, [requireAuth, liked, postId, apiBase, emitSync]);

    const handleRepost = useCallback(() => {
        requireAuth(async () => {
            if (repostInFlight.current) return;
            repostInFlight.current = true;

            const next = !reposted;

            // optimistic UI
            setReposted(next);
            setReposts((prev) => prev + (next ? 1 : -1));

            try {
                const res = await fetch(`${apiBase}/api/posts/${postId}/repost`, {
                    method: 'POST',
                    credentials: 'include',
                });
                if (!res.ok) throw new Error('Repost failed');
            } catch {
                // rollback
                setReposted(!next);
                setReposts((prev) => prev + (next ? -1 : 1));
            } finally {
                repostInFlight.current = false;
            }
        });
    }, [requireAuth, reposted, postId, apiBase]);

    const handleComment = useCallback(() => {
        requireAuth(() => onComment?.());
    }, [requireAuth, onComment]);

    const handleShare = useCallback(() => {
        requireAuth(() => onShare?.());
    }, [requireAuth, onShare]);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Like */}
            <Tooltip title={liked ? 'Unlike' : 'Like'}>
                <IconButton
                    aria-label={liked ? 'Unlike post' : 'Like post'}
                    onClick={handleLike}
                    disabled={likeInFlight.current}
                    size="small"
                >
                    {liked ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
                </IconButton>
            </Tooltip>
            <Typography variant="caption" component="span">
                {Math.max(0, Number.isFinite(likes) ? likes : 0)}
            </Typography>

            {/* Comment */}
            <Tooltip title="Comment">
                <IconButton
                    aria-label="Comment on post"
                    onClick={handleComment}
                    size="small"
                >
                    <ChatBubbleOutlineIcon />
                </IconButton>
            </Tooltip>
            <Typography variant="caption" component="span">
                {Math.max(0, Number.isFinite(commentsCount) ? commentsCount : 0)}
            </Typography>

            {/* Repost */}
            <Tooltip title={reposted ? 'Undo Repost' : 'Repost'}>
                <IconButton
                    aria-label={reposted ? 'Undo repost' : 'Repost'}
                    onClick={handleRepost}
                    disabled={repostInFlight.current}
                    size="small"
                >
                    <RepeatIcon color={reposted ? 'primary' : 'inherit'} />
                </IconButton>
            </Tooltip>
            <Typography variant="caption" component="span">
                {Math.max(0, Number.isFinite(reposts) ? reposts : 0)}
            </Typography>

            {/* Share */}
            <Tooltip title="Share">
                <IconButton
                    aria-label="Share post"
                    onClick={handleShare}
                    size="small"
                >
                    <ShareOutlinedIcon />
                </IconButton>
            </Tooltip>
        </Box>
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
};
