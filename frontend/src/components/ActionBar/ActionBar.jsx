// src/components/ActionBar/ActionBar.jsx
import React, { useState } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon       from '@mui/icons-material/Favorite';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareOutlinedIcon     from '@mui/icons-material/ShareOutlined';
import RepeatIcon            from '@mui/icons-material/Repeat';
import { useAuthModal } from '../../contexts/AuthModalContext';

export default function ActionBar({
                                      user,
                                      postId,
                                      initialLikes = 0,
                                      initiallyLiked = false,
                                      initialReposts = 0,
                                      initiallyReposted = false,
                                      onComment,
                                      onShare,       // ← REQUIRED: opens SharePostDialog in parent
                                  }) {
    const { open: openAuth } = useAuthModal();
    const [likes, setLikes]       = useState(initialLikes);
    const [liked, setLiked]       = useState(Boolean(initiallyLiked));
    const [reposts, setReposts]   = useState(initialReposts);
    const [reposted, setReposted] = useState(Boolean(initiallyReposted));

    const handleLike = async () => {
        if (!user) return openAuth();
        const next = !liked;
        setLiked(next); setLikes((v) => v + (next ? +1 : -1));
        window.dispatchEvent(new CustomEvent('post-like-changed', { detail: { postId, liked: next, likes: (likes + (next ? 1 : -1)) } }));
        try {
            await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: 'community_post' }),
                credentials: 'include'
            });
        } catch (err) {
            setLiked(!next); setLikes((v) => v + (next ? -1 : +1));
        }
    };

    const handleRepost = async () => {
        if (!user) return openAuth();
        const next = !reposted;
        setReposted(next); setReposts((v) => v + (next ? +1 : -1));
        try {
            await fetch(`/api/posts/${postId}/repost`, { method: 'POST', credentials: 'include' });
        } catch (err) {
            setReposted(!next); setReposts((v) => v + (next ? -1 : +1));
        }
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title={liked ? 'Unlike' : 'Like'}>
                <IconButton onClick={handleLike}>
                    {liked ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
                </IconButton>
            </Tooltip>
            <Typography variant="caption">{likes}</Typography>

            <Tooltip title="Comment">
                <IconButton onClick={user ? onComment : openAuth}>
                    <ChatBubbleOutlineIcon />
                </IconButton>
            </Tooltip>

            <Tooltip title={reposted ? 'Undo Repost' : 'Repost'}>
                <IconButton onClick={handleRepost}>
                    <RepeatIcon color={reposted ? 'primary' : 'inherit'} />
                </IconButton>
            </Tooltip>
            <Typography variant="caption">{reposts}</Typography>

            <Tooltip title="Share">
                <IconButton onClick={user ? onShare : openAuth}>
                    <ShareOutlinedIcon />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
