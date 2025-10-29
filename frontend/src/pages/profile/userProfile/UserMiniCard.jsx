// src/pages/profile/userProfile/UserMiniCard.jsx
import React from 'react';
import {
    Avatar,
    Box,
    Typography,
    IconButton,
    Menu,
    MenuItem,
    Paper,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';

/**
 * Compact user card used in the “Followers & Following” surfaces.
 *
 * Variants:
 * - "grid": vertical tile (avatar above, text below) for the left-rail 3-up grid.
 *           Only the avatar, name, or username navigates. No background/tile click.
 * - "row" : horizontal card (avatar left, text center, 3-dots on right) for lists.
 *           Only the avatar, name, or username navigates. 3-dots menu → "View Profile".
 *
 * Props:
 * - user: { id, handle, username, first_name, last_name, avatar_url, profile_picture, public_id }
 * - variant: "grid" | "row"
 * - onViewProfile?: optional handler; if provided, it's used instead of window.location.assign
 */
function UserMiniCard({ user, variant = 'grid', onViewProfile }) {
    const [menuAnchor, setMenuAnchor] = React.useState(null);

    const name =
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
        user?.display_name ||
        user?.name ||
        user?.handle ||
        'User';

    const username = user?.handle || user?.username || '';
    const avatar = user?.avatar_url || user?.profile_picture || '';

    const goProfile = () => {
        if (!user) return;
        if (onViewProfile) return onViewProfile(user);
        const path = user.handle ? `/${user.handle}` : `/${user.public_id || user.id}`;
        window.location.assign(path);
    };

    const openMenu = (e) => {
        e.stopPropagation();
        setMenuAnchor(e.currentTarget);
    };
    const closeMenu = () => setMenuAnchor(null);

    if (variant === 'row') {
        return (
            <Paper
                variant="outlined"
                sx={{
                    p: 1,
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: 1,
                    borderRadius: 2,
                    cursor: 'default', // background is not clickable
                }}
            >
                {/* Avatar (clickable) */}
                <Avatar
                    src={avatar}
                    alt={name}
                    variant="square"
                    sx={{ width: 72, height: 72, borderRadius: 1, cursor: 'pointer' }}
                    onClick={goProfile}
                />

                {/* Name + username (clickable) */}
                <Box sx={{ minWidth: 0 }}>
                    <Typography
                        variant="subtitle2"
                        noWrap
                        sx={{ cursor: 'pointer' }}
                        onClick={goProfile}
                        title={name}
                    >
                        {name}
                    </Typography>
                    {username && (
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                            sx={{ cursor: 'pointer' }}
                            onClick={goProfile}
                            title={`@${username}`}
                        >
                            @{username}
                        </Typography>
                    )}
                </Box>

                {/* 3-dots menu (no background click) */}
                <IconButton size="small" onClick={openMenu}>
                    <MoreVertIcon fontSize="small" />
                </IconButton>

                <Menu
                    open={Boolean(menuAnchor)}
                    anchorEl={menuAnchor}
                    onClose={closeMenu}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                    <MenuItem
                        onClick={() => {
                            closeMenu();
                            goProfile();
                        }}
                    >
                        View Profile
                    </MenuItem>
                </Menu>
            </Paper>
        );
    }

    // Default: "grid" variant (3-up tiles in the left rail)
    return (
        <Paper
            variant="outlined"
            sx={{
                textAlign: 'center',
                p: 1,
                borderRadius: 2,
                borderColor: 'divider',
                cursor: 'default', // tile background is not clickable
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                '&:hover': { boxShadow: 1 },
            }}
        >
            {/* Avatar (clickable) */}
            <Avatar
                src={avatar}
                alt={name}
                variant="square"
                sx={{ width: 88, height: 88, borderRadius: 1, mb: 1, cursor: 'pointer' }}
                onClick={goProfile}
            />

            {/* Name + username (each clickable) */}
            <Typography
                variant="subtitle2"
                noWrap
                sx={{ cursor: 'pointer' }}
                onClick={goProfile}
                title={name}
            >
                {name}
            </Typography>
            {username && (
                <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ cursor: 'pointer' }}
                    onClick={goProfile}
                    title={`@${username}`}
                >
                    @{username}
                </Typography>
            )}
        </Paper>
    );
}

export default React.memo(UserMiniCard);
