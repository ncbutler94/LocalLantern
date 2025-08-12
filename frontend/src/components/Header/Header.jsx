// src/components/Header/Header.jsx
// -----------------------------------------------------------------------------
// Community-marker and Business-marker icons before text, both 28 px.
// Adds explicit routing so “Businesses” goes to /business.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AppBar        from '@mui/material/AppBar';
import Toolbar       from '@mui/material/Toolbar';
import Box           from '@mui/material/Box';
import Avatar        from '@mui/material/Avatar';
import IconButton    from '@mui/material/IconButton';
import Dialog        from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle   from '@mui/material/DialogTitle';
import Divider       from '@mui/material/Divider';
import Typography    from '@mui/material/Typography';
import Button        from '@mui/material/Button';
import Menu          from '@mui/material/Menu';
import MenuItem      from '@mui/material/MenuItem';

import TabBar        from '../TabBar/TabBar';
import defaultAvatar from '../../assets/profile/default-avatar.png';
import logo          from '../../assets/LocalLanternLogo.png';
import communityMarker from '../../assets/mapMarkers/community/community-marker.png';
import businessMarker  from '../../assets/mapMarkers/businesses/businesses-marker.png';

import LoginForm     from '../Login/Login';
import { useAuthModal } from '../../contexts/AuthModalContext';

/* -------------------------------------------------------------------------- */
// Tab definitions — Community & Businesses tabs get inline markers.
/* -------------------------------------------------------------------------- */
const rawTabs = [
    'All',
    'Community',
    'Businesses', // updated text
    'Events',
    'Jobs',
    'Services',
    'Marketplace',
    'Deals',
    'Real Estate',
];

const TABS = rawTabs.map((t) => {
    if (t === 'Community') {
        return {
            value: t,
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box component="img" src={communityMarker} alt="Community marker icon" sx={{ height: 28, width: 28 }} />
                    {t}
                </Box>
            ),
        };
    }
    if (t === 'Businesses') {
        return {
            value: t,
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box component="img" src={businessMarker} alt="Business marker icon" sx={{ height: 28, width: 28 }} />
                    {t}
                </Box>
            ),
        };
    }
    return { value: t, label: t };
});

export default function Header({ user, onLogin, onLogout, activeTab, onTabChange }) {
    const navigate = useNavigate();
    const { open: openLogin, close: closeLogin, loginOpen } = useAuthModal();

    /* ----------------------------- account menu ----------------------------- */
    const [anchorEl, setAnchorEl] = useState(null);
    const menuOpen = Boolean(anchorEl);

    const handleAvatarClick = (e) => {
        if (user) {
            setAnchorEl(e.currentTarget);
        } else {
            openLogin();
        }
    };
    const closeMenu = () => setAnchorEl(null);

    const handleLogoutClick = () => {
        closeMenu();
        onLogout();
        navigate('/');
    };

    const handleNav = (path) => {
        closeMenu();
        navigate(path);
    };

    /* -------------------------- tab navigation glue ------------------------- */
    const handleTabChange = (val) => {
        onTabChange(val);
        // Only Businesses lives on its own route; all other tabs live on "/"
        if (val === 'Businesses') {
            navigate('/business');
        } else {
            navigate('/'); // Home hosts All/Community/Events/Jobs/...
        }
    };

    /* ------------------------------ auth dialog ------------------------------ */
    const AuthDialog = ({ title, open, onClose, children }) => (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ m: 0, p: 2, textAlign: 'center' }}>
                <Typography variant="h6">{title}</Typography>
                <IconButton aria-label="close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
                    ×
                </IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent dividers sx={{ p: 2 }}>
                {children}
            </DialogContent>
        </Dialog>
    );

    /* ------------------------------------------------------------------------ */
    return (
        <>
            <AppBar position="static" elevation={0} sx={{ bgcolor: '#fff' }}>
                <Toolbar>
                    {/* 1) left spacer */}
                    <Box sx={{ flexGrow: 1 }} />

                    {/* 2) centre logo + tabs */}
                    <Box sx={{ display: 'flex', alignItems: 'center', mx: 'auto' }}>
                        <Box
                            component="img"
                            src={logo}
                            alt="Local Lantern Logo"
                            sx={{ height: 110, mr: 2, cursor: 'pointer' }}
                            onClick={() => {
                                onTabChange('All');
                                navigate('/');
                            }}
                        />
                        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />
                    </Box>

                    {/* 3) right spacer */}
                    <Box sx={{ flexGrow: 1 }} />

                    {/* 4) user section */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 2,
                            p: 1,
                            gap: 1,
                            cursor: 'pointer',
                        }}
                        onClick={handleAvatarClick}
                    >
                        <Avatar
                            src={user?.avatar_url || defaultAvatar}
                            alt={user ? `${user.first_name} ${user.last_name}` : 'Guest'}
                        />
                        {user ? (
                            <Typography variant="body1">
                                {user.first_name} {user.last_name}
                            </Typography>
                        ) : (
                            <>
                                <Button size="small" onClick={(e) => { e.stopPropagation(); openLogin(); }}>
                                    Login
                                </Button>
                                <Button size="small" onClick={(e) => { e.stopPropagation(); navigate('/register'); }}>
                                    Create an Account
                                </Button>
                            </>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>

            {/* login dialog */}
            <AuthDialog title="Login" open={loginOpen} onClose={closeLogin}>
                <LoginForm
                    onLogin={(u) => {
                        onLogin(u);
                        closeLogin();
                    }}
                    onCancel={closeLogin}
                />
            </AuthDialog>

            {/* account menu */}
            {user && (
                <Menu
                    anchorEl={anchorEl}
                    open={menuOpen}
                    onClose={closeMenu}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                    <MenuItem onClick={() => handleNav('/profile')}>My Profile</MenuItem>
                    <MenuItem onClick={() => handleNav('/settings')}>Account Settings</MenuItem>
                    <Divider />
                    <MenuItem onClick={handleLogoutClick}>Logout</MenuItem>
                </Menu>
            )}
        </>
    );
}
