// src/pages/profile/userProfile/UserMiniCard.jsx
import React from 'react';
import { Avatar, Box, IconButton, Typography } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';

function UserMiniCard({ user, onMenu }) {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || (user.handle ? `@${user.handle}` : 'User');
    const avatar = user.avatar_url || user.profile_picture || '';
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
                borderRadius: 1.5,
            }}
        >
            <Avatar src={avatar} sx={{ width: 40, height: 40 }} />
            <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
            </Typography>
            <IconButton size="small" onClick={onMenu}>
                <MoreVertIcon fontSize="small" />
            </IconButton>
        </Box>
    );
}

export default React.memo(UserMiniCard);
