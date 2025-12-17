// src/components/UserCardPopover.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Box, Button, IconButton, Popover, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Lightweight user card popover with Follow/Following, Message, and View Profile.
 * - Has an "X" in the top-right.
 * - Does NOT close on outside click (backdrop) — only via the X or ESC.
 * - Follow disables immediately and shows "Following" (optimistic).
 * - If `isSelf` is true, Follow/Message are hidden.
 */
export default function UserCardPopover({
                                            anchorEl,
                                            onClose,
                                            user,
                                            isSelf = false,
                                            following = false,
                                            onFollow,
                                            onMessage,
                                            onViewProfile,
                                        }) {
    const open = Boolean(anchorEl);
    const id = open ? 'user-card-popover' : undefined;

    const name =
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
        user?.display_name ||
        user?.name ||
        'User';

    const username = user?.handle || user?.username || '';
    const avatar = user?.avatar_url || user?.profile_picture || '';

    // Local optimistic state so the button disables instantly
    const [forcedFollowing, setForcedFollowing] = useState(false);

    useEffect(() => {
        // Sync from prop when it becomes true, and reset when popover closes
        if (following) setForcedFollowing(true);
        if (!open) setForcedFollowing(false);
    }, [following, open]);

    const isFollowing = useMemo(
        () => Boolean(following || forcedFollowing),
        [following, forcedFollowing]
    );

    const handleFollow = () => {
        if (!isFollowing) {
            setForcedFollowing(true); // flip immediately
            onFollow?.(user);         // parent will persist to server
        }
    };

    return (
        <Popover
            id={id}
            open={open}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{
                sx: {
                    width: { xs: '92vw', sm: 320 },
                    maxWidth: { xs: '92vw', sm: 320 },
                    borderRadius: 2,
                    boxShadow: '0 4px 18px rgba(0,0,0,0.15)',
                },
            }}
        >
            <Box sx={{ p: 2, display: 'grid', gap: 1 }}>
                {/* Header with avatar/name and X */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Avatar src={avatar} alt={name} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle1" noWrap title={name}>
                                {name}
                            </Typography>
                            {username && (
                                <Typography variant="caption" color="text.secondary" noWrap>
                                    @{username}
                                </Typography>
                            )}
                        </Box>
                    </Box>

                    <IconButton size="small" aria-label="Close" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>

                {!isSelf && (
                    <Button
                        fullWidth
                        variant="contained"
                        onClick={handleFollow}
                        disabled={isFollowing}
                        sx={isFollowing ? { bgcolor: 'action.disabledBackground', color: 'text.disabled' } : undefined}
                    >
                        {isFollowing ? 'Following' : 'Follow'}
                    </Button>
                )}

                {!isSelf && (
                    <Button fullWidth variant="outlined" onClick={() => onMessage?.(user)}>
                        Message
                    </Button>
                )}

                <Button fullWidth variant="text" onClick={() => onViewProfile?.(user)}>
                    View Profile
                </Button>
            </Box>
        </Popover>
    );
}
