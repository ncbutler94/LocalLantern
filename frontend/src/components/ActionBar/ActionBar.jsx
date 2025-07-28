// src/components/ActionBar/ActionBar.jsx
import React, { useState } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon       from '@mui/icons-material/Favorite';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareOutlinedIcon     from '@mui/icons-material/ShareOutlined';
import { useAuthModal } from '../../contexts/AuthModalContext';

export default function ActionBar({
                                      user,
                                      postId,
                                      initialLikes,
                                      initiallyLiked,
                                      onComment,
                                      onShare
                                  }) {
    const { open: openAuth } = useAuthModal();
    const [likes, setLikes]   = useState(initialLikes);
    const [liked, setLiked]   = useState(initiallyLiked);

    /* --- toggle like with cookie --- */
    const handleLike = async () => {
        if (!user) return openAuth();

        const nextLiked = !liked;
        // optimistic UI
        setLiked(nextLiked);
        setLikes(l => l + (nextLiked ? +1 : -1));

        try {
            await fetch(`/api/posts/${postId}/like`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ category: 'community_post' }),
                credentials: 'include'        // << sends session cookie
            });
        } catch (err) {
            // rollback if request fails
            console.error(err);
            setLiked(!nextLiked);
            setLikes(l => l + (nextLiked ? -1 : +1));
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
            <Typography variant="caption">0</Typography>

            <Tooltip title="Share">
                <IconButton onClick={user ? onShare : openAuth}>
                    <ShareOutlinedIcon />
                </IconButton>
            </Tooltip>
            <Typography variant="caption">0</Typography>
        </Box>
    );
}
