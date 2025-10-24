// src/components/common/UserCardPopover.jsx
import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Divider,
    Popover,
    Typography,
} from '@mui/material';

export default function UserCardPopover({
                                            anchorEl,
                                            onClose,
                                            user,              // { id, first_name, last_name, handle, avatar_url }
                                            isSelf = false,
                                            onFollow,
                                            onMessage,
                                            onViewProfile,
                                            following = false,
                                        }) {
    const open = Boolean(anchorEl);
    const id = open ? 'user-card-popover' : undefined;

    if (!user) return null;
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const handle = user.handle ? `@${user.handle}` : '';

    return (
        <Popover
            id={id}
            open={open}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{ sx: { width: 280, p: 1.25 } }}
        >
            <Box sx={{ display: 'flex', gap: 1 }}>
                <Avatar src={user.avatar_url} sx={{ width: 48, height: 48 }} />
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                        {name || 'User'}
                    </Typography>
                    {handle && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                            {handle}
                        </Typography>
                    )}
                </Box>
            </Box>

            <Divider sx={{ my: 1 }} />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {!isSelf && (
                    <Button
                        fullWidth
                        variant={following ? 'outlined' : 'contained'}
                        color={following ? 'inherit' : 'primary'}
                        onClick={() => { onFollow?.(user); onClose?.(); }}
                    >
                        {following ? 'Following' : 'Follow'}
                    </Button>
                )}
                {!isSelf && (
                    <Button fullWidth variant="outlined" onClick={() => { onMessage?.(user); onClose?.(); }}>
                        Message
                    </Button>
                )}
                <Button fullWidth onClick={() => { onViewProfile?.(user); onClose?.(); }}>
                    View Profile
                </Button>
            </Box>
        </Popover>
    );
}
