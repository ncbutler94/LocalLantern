// src/components/Header/Header.jsx
// Header with visible text on white, quick actions, Messages button, and no destroy warnings.

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Box, Avatar, IconButton, Dialog, DialogContent, DialogTitle,
    Divider, Typography, Button, Menu
} from '@mui/material';
import MoreVertIcon  from '@mui/icons-material/MoreVert';
import PersonIcon    from '@mui/icons-material/Person';
import PublicIcon    from '@mui/icons-material/Public';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

import TabBar from '../TabBar/TabBar';
import defaultAvatar from '../../assets/profile/default-avatar.png';
import logo from '../../assets/LocalLanternLogo.png';
import communityMarker from '../../assets/mapMarkers/community/community-marker.png';
import businessMarker from '../../assets/mapMarkers/businesses/businesses-marker.png';

import LoginForm from '../Login/Login';
import { useAuthModal } from '../../contexts/AuthModalContext';
import MessageCenterDialog from '../messages/MessageCenterDialog';

const rawTabs = ['All', 'Community', 'Businesses', 'Events', 'Jobs', 'Services', 'Marketplace', 'Deals', 'Real Estate'];
const TABS = rawTabs.map((t) => {
    if (t === 'Community') {
        return { value: t, label: (
                <Box sx={{ display:'flex', alignItems:'center', gap:0.75 }}>
                    <Box component="img" src={communityMarker} alt="Community" sx={{ height: 28, width: 28 }} />{t}
                </Box>
            ) };
    }
    if (t === 'Businesses') {
        return { value: t, label: (
                <Box sx={{ display:'flex', alignItems:'center', gap:0.75 }}>
                    <Box component="img" src={businessMarker} alt="Businesses" sx={{ height: 28, width: 28 }} />{t}
                </Box>
            ) };
    }
    return { value: t, label: t };
});

export default function Header({ user, onLogin, onLogout, activeTab, onTabChange }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { open: openLogin, close: closeLogin, loginOpen } = useAuthModal();

    const [anchorEl, setAnchorEl] = useState(null);
    const [msgOpen, setMsgOpen] = useState(false);
    const menuOpen = Boolean(anchorEl);

    const avatarSrc = user?.avatar_url || user?.profile_picture || defaultAvatar;
    const slug = user ? (user.handle || user.public_id || user.id) : '';
    const profilePath = user ? `/u/${slug}` : '/login'; // keep /u/* route alive in app

    const onProfileRoute = /^\/u(\/|$)/.test(location.pathname);
    const onSocialRoute  = /^\/social(\/|$)/.test(location.pathname);

    useEffect(() => {
        if (onProfileRoute || onSocialRoute) onTabChange('');
    }, [onProfileRoute, onSocialRoute, onTabChange]);

    useEffect(() => {
        const h = () => setMsgOpen(true);
        window.addEventListener('open-message-center', h);
        return () => window.removeEventListener('open-message-center', h);
    }, []);

    const derivedActiveTab = useMemo(
        () => (onProfileRoute || onSocialRoute ? '' : activeTab),
        [activeTab, onProfileRoute, onSocialRoute]
    );

    const handleTabChange = (val) => {
        onTabChange(val);
        if (val === 'Businesses') navigate('/business'); else navigate('/');
    };

    const handleAvatarClick = (e) => { user ? setAnchorEl(e.currentTarget) : openLogin(); };
    const closeMenu = () => setAnchorEl(null);

    // Local, lightweight dialog wrapper so we don’t need a separate component file
    const AuthDialog = ({ title, open, onClose, children }) => (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ m:0, p:2, textAlign:'center' }}>
                <Typography variant="h6">{title}</Typography>
                <IconButton aria-label="close" onClick={onClose} sx={{ position:'absolute', right:8, top:8 }}>×</IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent dividers sx={{ p:2 }}>{children}</DialogContent>
        </Dialog>
    );

    return (
        <>
            <AppBar position="static" elevation={0} color="default" sx={{ bgcolor:'#fff', color:'text.primary', borderBottom:'1px solid', borderColor:'divider' }}>
                <Toolbar sx={{ minHeight: 88 }}>
                    <Box sx={{ flexGrow: 1 }} />
                    <Box sx={{ display:'flex', alignItems:'center', mx:'auto' }}>
                        <Box component="img" src={logo} alt="Local Lantern" sx={{ height:110, mr:2, cursor:'pointer' }}
                             onClick={() => { onTabChange('All'); navigate('/'); }} />
                        <TabBar tabs={TABS} activeTab={derivedActiveTab} onTabChange={handleTabChange} />
                    </Box>
                    <Box sx={{ flexGrow: 1 }} />

                    <Box
                        sx={{
                            display:'flex', alignItems:'center', border:1, borderColor:'divider', borderRadius:2,
                            p:1, pr:1.25, gap:1.25, bgcolor:'background.paper', color:'text.primary', cursor:'pointer',
                            '&:hover': { bgcolor:'action.hover' }
                        }}
                        onClick={handleAvatarClick}
                        aria-controls={menuOpen ? 'account-menu' : undefined}
                        aria-haspopup="true"
                        aria-expanded={menuOpen ? 'true' : undefined}
                    >
                        <Avatar src={avatarSrc} alt={user ? `${user.first_name} ${user.last_name}` : 'Guest'} sx={{ width:36, height:36 }} />
                        {user ? (
                            <Box sx={{ display:'flex', flexDirection:'column', alignItems:'flex-start', minWidth:0 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>Welcome, {user.first_name}</Typography>
                                <Box sx={{ display:'flex', gap:1, mt:0.5 }}>
                                    <Button size="small" startIcon={<PersonIcon />} variant={onProfileRoute ? 'contained' : 'outlined'} color="primary"
                                            sx={{ ...(onProfileRoute ? { color:'#fff' } : {}) }}
                                            onClick={(e) => { e.stopPropagation(); onTabChange(''); navigate(profilePath); }}>
                                        My Profile
                                    </Button>
                                    <Button size="small" startIcon={<PublicIcon />} variant={onSocialRoute ? 'contained' : 'outlined'} color="primary"
                                            sx={{ ...(onSocialRoute ? { color:'#fff' } : {}) }}
                                            onClick={(e) => { e.stopPropagation(); onTabChange(''); navigate('/social'); }}>
                                        Social
                                    </Button>
                                    <Button size="small" startIcon={<MailOutlineIcon />} variant="outlined" color="primary"
                                            onClick={(e) => { e.stopPropagation(); setMsgOpen(true); }}>
                                        Messages
                                    </Button>
                                </Box>
                            </Box>
                        ) : (
                            <>
                                <Button size="small" variant="outlined" color="primary" onClick={(e)=>{ e.stopPropagation(); openLogin(); }}>Login</Button>
                                <Button size="small" variant="contained" color="primary" onClick={(e)=>{ e.stopPropagation(); navigate('/register'); }}>Create an Account</Button>
                            </>
                        )}
                        <MoreVertIcon fontSize="small" />
                    </Box>
                </Toolbar>
            </AppBar>

            <AuthDialog title="Login" open={loginOpen} onClose={closeLogin}>
                <LoginForm onLogin={(u) => { onLogin(u); closeLogin(); }} onCancel={closeLogin} />
            </AuthDialog>

            {user && (
                <Menu id="account-menu" anchorEl={anchorEl} open={menuOpen} onClose={closeMenu}
                      anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
                      transformOrigin={{ vertical:'top', horizontal:'right' }}>
                    <Box sx={{ width: 220, height: 8 }} />
                </Menu>
            )}

            <MessageCenterDialog open={msgOpen} onClose={() => setMsgOpen(false)} viewer={user} />
        </>
    );
}
