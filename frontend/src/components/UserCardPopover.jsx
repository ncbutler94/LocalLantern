import React from 'react';
import PropTypes from 'prop-types';
import {
    Avatar,
    Box,
    Button,
    ClickAwayListener,
    Divider,
    IconButton,
    Paper,
    Popper,
    Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';

/**
 * User mini card (popover).
 * - Has an X in the top-right.
 * - Per request: closes when clicking anywhere outside of the card.
 */
export default function UserCardPopover(props) {
    const {
        anchorEl,
        onClose,
        user,
        isSelf,
        following,
        onFollow,
        onViewProfile,
    } = props;

    const open = Boolean(anchorEl) && Boolean(user);
    const id = open ? 'user-card-popper' : undefined;

    const firstName = user?.first_name || user?.firstName || '';
    const lastName = user?.last_name || user?.lastName || '';
    const handle = user?.handle || user?.username || '';
    const avatarUrl =
        user?.avatar_url ||
        user?.avatarUrl ||
        user?.profile_picture ||
        user?.profilePicture ||
        '';

    const displayName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim() || handle || 'User';
    const hasAvatar = Boolean(String(avatarUrl || '').trim());

    const safeClose = () => {
        if (typeof onClose === 'function') onClose();
    };

    const handleCloseClick = (e) => {
        e.stopPropagation();
        safeClose();
    };

    const handleView = () => {
        if (!user) return;
        if (typeof onViewProfile === 'function') onViewProfile(user);
        safeClose();
    };

    const handleFollowClick = () => {
        if (!user) return;
        if (typeof onFollow === 'function') onFollow(user);
    };

    return (
        <Popper
            id={id}
            open={open}
            anchorEl={anchorEl}
            placement="bottom-start"
            modifiers={[
                { name: 'offset', options: { offset: [0, 10] } },
                { name: 'preventOverflow', options: { padding: 8 } },
            ]}
            sx={{ zIndex: 2200 }}
        >
            {/* Needed because Popper is portaled; click-away should still work. */}
            <ClickAwayListener onClickAway={safeClose} disableReactTree>
                <Box
                    sx={{ maxWidth: '92vw' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <Paper
                        elevation={0}
                        sx={{
                            width: { xs: 304, sm: 344 },
                            borderRadius: 3,
                            overflow: 'hidden',
                            border: '1px solid',
                            borderColor: (t) => alpha(t.palette.primary.main, 0.16),
                            bgcolor: (t) => alpha(t.palette.background.paper, 0.94),
                            backdropFilter: 'saturate(140%) blur(10px)',
                            backgroundImage: 'none',
                            boxShadow: (t) => `0 14px 40px ${alpha(t.palette.common.black, 0.16)}`,
                        }}
                        role="dialog"
                        aria-label="User card"
                    >
                        <Box sx={{ p: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                                <Avatar
                                    src={hasAvatar ? avatarUrl : undefined}
                                    alt={displayName}
                                    sx={{
                                        width: 46,
                                        height: 46,
                                        flexShrink: 0,
                                        bgcolor: hasAvatar ? 'transparent' : 'grey.600',
                                        color: hasAvatar ? 'inherit' : '#fff',
                                        border: '1px solid',
                                        borderColor: (t) => alpha(t.palette.common.black, 0.10),
                                    }}
                                    imgProps={{ referrerPolicy: 'no-referrer' }}
                                >
                                    {!hasAvatar ? <PersonIcon fontSize="small" /> : null}
                                </Avatar>

                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                        variant="subtitle1"
                                        sx={{
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {displayName}
                                    </Typography>
                                    {handle ? (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: 'text.secondary',
                                                display: 'block',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            @{handle}
                                        </Typography>
                                    ) : null}
                                </Box>

                                <IconButton
                                    aria-label="Close"
                                    onClick={handleCloseClick}
                                    size="small"
                                    sx={{
                                        ml: 0.25,
                                        borderRadius: 2,
                                        color: 'text.secondary',
                                        '&:hover': {
                                            bgcolor: (t) => alpha(t.palette.common.black, 0.06),
                                            color: 'text.primary',
                                        },
                                    }}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        </Box>

                        <Divider />

                        <Box
                            sx={{
                                p: 1.25,
                                display: 'flex',
                                gap: 1,
                                flexDirection: { xs: 'column', sm: 'row' },
                            }}
                        >
                            {!isSelf ? (
                                <Button
                                    onClick={handleFollowClick}
                                    variant={following ? 'outlined' : 'contained'}
                                    fullWidth
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 800,
                                        borderRadius: 999,
                                        py: 1,
                                        ...(following
                                            ? {
                                                borderColor: (t) => alpha(t.palette.primary.main, 0.35),
                                                color: 'primary.main',
                                            }
                                            : {}),
                                    }}
                                >
                                    {following ? 'Following' : 'Follow'}
                                </Button>
                            ) : null}

                            <Button
                                onClick={handleView}
                                variant="contained"
                                fullWidth
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 900,
                                    borderRadius: 999,
                                    py: 1,
                                    boxShadow: 'none',
                                }}
                            >
                                View Profile
                            </Button>
                        </Box>
                    </Paper>
                </Box>
            </ClickAwayListener>
        </Popper>
    );
}

UserCardPopover.propTypes = {
    anchorEl: PropTypes.any,
    onClose: PropTypes.func,
    user: PropTypes.object,
    isSelf: PropTypes.bool,
    following: PropTypes.bool,
    onFollow: PropTypes.func,
    onViewProfile: PropTypes.func,
};
