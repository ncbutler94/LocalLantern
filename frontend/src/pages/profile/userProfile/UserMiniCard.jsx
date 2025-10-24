// src/pages/profile/userProfile/UserMiniCard.jsx
import React from 'react';
import { Avatar, Box, IconButton, Typography } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';

/**
 * Compact user card used in the profile "Followers & Following" section
 * - variant="grid": square avatar above, name + @username centered beneath (used in 3-up grid)
 * - variant="row":  square avatar left, text right, and optional 3-dots (used in dialogs if desired)
 */
function UserMiniCard({ user, onMenu, variant = 'grid' }) {
    const name =
        `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
        (user.handle ? `@${user.handle}` : 'User');
    const username = user.handle || user.username || '';
    const avatar = user.avatar_url || user.profile_picture || '';

    const goProfile = () => {
        const path = user.handle ? `/${user.handle}` : `/${user.public_id || user.id}`;
        window.location.assign(path);
    };

    if (variant === 'row') {
        return (
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5
                }}
            >
                <Avatar src={avatar} variant="square" sx={{ width: 48, height: 48, borderRadius: 1 }} />
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>@{username}</Typography>
                </Box>
                {onMenu && (
                    <IconButton size="small" onClick={onMenu}>
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                )}
            </Box>
        );
    }

    // Default: grid variant (3-up tiles)
    return (
        <Box
            onClick={goProfile}
            sx={{
                textAlign: 'center',
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                '&:hover': { boxShadow: 1 }
            }}
        >
            <Avatar
                src={avatar}
                variant="square"
                sx={{ width: 96, height: 96, borderRadius: 1, mb: 1 }}
            />
            <Typography variant="subtitle2" noWrap>{name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
                @{username}
            </Typography>
        </Box>
    );
}

export default React.memo(UserMiniCard);
