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
    ListItemIcon,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

function UserMiniCard({
                          user,
                          variant = 'row',
                          onViewProfile,
                          hideMenu = false,
                          // NEW:
                          isFollowing = false,
                          onFollow,
                          onUnfollow,
                          onMessage,
                          isSelf = false,
                      }) {
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
                    p: 1.25,
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: 1.25,
                    borderRadius: 2,
                }}
            >
                <Avatar
                    src={avatar}
                    alt={name}
                    variant="square"
                    sx={{ width: 96, height: 96, borderRadius: 1, cursor: 'pointer' }} // ← larger
                    onClick={goProfile}
                />
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

                {!hideMenu && (
                    <>
                        <IconButton size="small" onClick={openMenu} aria-label="Open actions">
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
                                <ListItemIcon>
                                    <AccountCircleIcon fontSize="small" />
                                </ListItemIcon>
                                View Profile
                            </MenuItem>

                            {!isSelf && (
                                <MenuItem
                                    onClick={() => {
                                        closeMenu();
                                        onMessage?.(user);
                                    }}
                                >
                                    <ListItemIcon>
                                        <MailOutlineIcon fontSize="small" />
                                    </ListItemIcon>
                                    Message
                                </MenuItem>
                            )}

                            {!isSelf &&
                                (isFollowing ? (
                                    <MenuItem
                                        onClick={() => {
                                            closeMenu();
                                            onUnfollow?.(user);
                                        }}
                                    >
                                        <ListItemIcon>
                                            <PersonRemoveIcon fontSize="small" />
                                        </ListItemIcon>
                                        Unfollow
                                    </MenuItem>
                                ) : (
                                    <MenuItem
                                        onClick={() => {
                                            closeMenu();
                                            onFollow?.(user);
                                        }}
                                    >
                                        <ListItemIcon>
                                            <PersonAddAlt1Icon fontSize="small" />
                                        </ListItemIcon>
                                        Follow
                                    </MenuItem>
                                ))}
                        </Menu>
                    </>
                )}
            </Paper>
        );
    }

    // Fallback "grid" tile (unchanged)
    return (
        <Paper
            variant="outlined"
            sx={{
                textAlign: 'center',
                p: 1,
                borderRadius: 2,
                borderColor: 'divider',
                cursor: 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                '&:hover': { boxShadow: 1 },
            }}
        >
            <Avatar
                src={avatar}
                alt={name}
                variant="square"
                sx={{ width: 88, height: 88, borderRadius: 1, mb: 1, cursor: 'pointer' }}
                onClick={goProfile}
            />
            <Typography variant="subtitle2" noWrap sx={{ cursor: 'pointer' }} onClick={goProfile} title={name}>
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
