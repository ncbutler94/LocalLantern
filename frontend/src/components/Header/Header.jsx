// src/components/Header/Header.jsx
// Header with visible text on white, quick actions, and Messages button that highlights when on /messages
// Updates in this version:
// - NEW: Listens for `me:updated` (CustomEvent) and a `localStorage` signal to refresh the header's user
//        object (and avatar) immediately after profile avatar changes without a full reload.
// - Keeps all previous behavior intact (tabs, routes, account menu).

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    AppBar,
    Toolbar,
    Box,
    Avatar,
    Typography,
    Button,
    Menu,
    MenuItem,
    ListItemIcon,
    IconButton
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonIcon from '@mui/icons-material/Person';
import PublicIcon from '@mui/icons-material/Public';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';

import TabBar from './TabBar';
// ❌ Removed green default image fallback import to match profile page behavior
// import defaultAvatar from '../../assets/profile/default-avatar.png';
import logo from '../../assets/LocalLanternLogo.png';

// Marker icons
import communityMarker   from '../../assets/mapMarkers/community/community-marker.png';
import businessMarker    from '../../assets/mapMarkers/businesses/businesses-marker.png';
import eventsMarker      from '../../assets/mapMarkers/events/events-marker.png';
import musicMarker       from '../../assets/mapMarkers/music/music-marker.png';
import jobsMarker        from '../../assets/mapMarkers/jobs/jobs-marker.png';
import servicesMarker    from '../../assets/mapMarkers/services/services-marker.png';
import marketplaceMarker from '../../assets/mapMarkers/marketplace/marketplace-marker.png';
import dealsMarker       from '../../assets/mapMarkers/deals/deals-marker.png';
import realEstateMarker  from '../../assets/mapMarkers/realEstate/real-estate-marker.png';

// Unified auth hook
import { useAuth } from '../AuthModalContext';

// Tabs (includes "Music" after "Events")
const rawTabs = [
    'All',
    'Community',
    'Businesses',
    'Events',
    'Music',
    'Jobs',
    'Services',
    'Marketplace',
    'Deals',
    'Real Estate'
];

// Tab -> marker mapping
const markerByTab = {
    Community: communityMarker,
    Businesses: businessMarker,
    Events: eventsMarker,
    Music: musicMarker,
    Jobs: jobsMarker,
    Services: servicesMarker,
    Marketplace: marketplaceMarker,
    Deals: dealsMarker,
    'Real Estate': realEstateMarker
};

// Build TabBar config with icons + text
const TABS = rawTabs.map((t) => {
    const icon = markerByTab[t];
    if (icon) {
        return {
            value: t,
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 0.75 } }}>
                    <Box
                        component="img"
                        src={icon}
                        alt={`${t} marker`}
                        sx={{
                            height: { xs: 22, sm: 28 },
                            width:  { xs: 22, sm: 28 },
                            display: 'block'
                        }}
                    />
                    <Typography component="span" sx={{ fontSize: { xs: 12, sm: 14 }, lineHeight: 1 }}>
                        {t}
                    </Typography>
                </Box>
            )
        };
    }
    // "All" (no icon)
    return {
        value: t,
        label: (
            <Typography component="span" sx={{ fontSize: { xs: 12, sm: 14 }, lineHeight: 1 }}>
                {t}
            </Typography>
        )
    };
});

// Helper to produce API base if provided, else use relative (dev proxy)
const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

// Top-level route names that are **not** user profiles.
// Anything not in this set (and not empty) is treated as a profile route.
const KNOWN_ROOTS = new Set([
    '', 'community', 'events', 'jobs', 'business', 'music', 'services',
    'marketplace', 'deals', 'real-estate', 'social', 'messages',
    'login', 'register', 'posts', 'social-login-success', 'social-signup', 'u'
]);

// Utility: path matches a base segment (e.g., "/alice" or "/alice/...").
const pathIs = (pathname, base) =>
    pathname === base || pathname.startsWith(`${base}/`);

export default function Header({ user, activeTab, onTabChange }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { openLogin } = useAuth();

    // Anchor only opens from the three-dots button
    const [anchorEl, setAnchorEl] = useState(null);
    const menuOpen = Boolean(anchorEl);

    // 🆕 Maintain an internal copy that can update via events even if parent prop hasn't re-rendered yet
    const [headerUser, setHeaderUser] = useState(user || null);

    // Keep in sync with prop when it changes
    useEffect(() => {
        setHeaderUser(user || null);
    }, [user]);

    // Listen for profile updates from the profile page (same-tab + cross-tab)
    useEffect(() => {
        const onMeUpdated = (e) => {
            const next = e?.detail?.user || e?.detail || null;
            if (!next) return;
            setHeaderUser((prev) => ({ ...(prev || {}), ...next }));
        };
        const onStorage = (ev) => {
            if (ev.key === 'll:me:updated' && ev.newValue) {
                try {
                    const parsed = JSON.parse(ev.newValue);
                    const next = parsed?.user || null;
                    if (next) setHeaderUser((prev) => ({ ...(prev || {}), ...next }));
                } catch {
                    /* ignore */
                }
            }
        };
        window.addEventListener('me:updated', onMeUpdated);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener('me:updated', onMeUpdated);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    // Prefer the live-updated user object
    const u = headerUser || user;

    // ✅ Match profile page: do not force a custom fallback image
    const avatarSrc   = u?.avatar_url || u?.profile_picture || undefined;
    const slug        = u ? (u.handle || u.public_id || u.id) : '';
    // Navigate directly to the canonical profile route
    const profilePath = u ? `/${slug}` : '/login';

    // Route checks
    const firstSeg = (location.pathname.split('/')[1] || '').toLowerCase();
    const isBareProfileRoute = Boolean(firstSeg) && !KNOWN_ROOTS.has(firstSeg);
    const onLegacyProfileRoute = /^\/u(\/|$)/.test(location.pathname);
    const onAnyProfileRoute = isBareProfileRoute || onLegacyProfileRoute;

    // Only highlight "My Profile" when you're on **your own** profile
    const onMyProfileRoute = u
        ? pathIs(location.pathname, `/${slug}`) || pathIs(location.pathname, `/u/${slug}`)
        : false;

    const onSocialRoute   = /^\/social(\/|$)/.test(location.pathname);
    const onMessagesRoute = /^\/messages(\/|$)/.test(location.pathname);

    // Clear activeTab whenever we’re on a non-tabbed route (profile, social, messages)
    useEffect(() => {
        if (onAnyProfileRoute || onSocialRoute || onMessagesRoute) onTabChange('');
    }, [onAnyProfileRoute, onSocialRoute, onMessagesRoute, onTabChange]);

    const derivedActiveTab = useMemo(
        () => (onAnyProfileRoute || onSocialRoute || onMessagesRoute ? '' : activeTab),
        [activeTab, onAnyProfileRoute, onSocialRoute, onMessagesRoute]
    );

    const handleTabChange = (val) => {
        onTabChange(val);

        // Route by tab (added Music); keep existing routes
        if (val === 'Businesses')       navigate('/business');
        else if (val === 'Events')      navigate('/events');
        else if (val === 'Music')       navigate('/music');
        else if (val === 'Jobs')        navigate('/jobs');
        else if (val === 'Services')    navigate('/services');
        else if (val === 'Marketplace') navigate('/marketplace');
        else if (val === 'Deals')       navigate('/deals');
        else if (val === 'Real Estate') navigate('/real-estate');
        else if (val === 'Community')   navigate('/community');
        else                            navigate('/');
    };

    // Open the dropdown only from the three-dots button
    const handleDotsClick = (e) => {
        e.stopPropagation();
        if (!u) {
            openLogin();
            return;
        }
        setAnchorEl(e.currentTarget);
    };

    const closeMenu = () => setAnchorEl(null);

    // Do not close the menu on outside click; allow ESC to close.
    const handleMenuClose = (_event, reason) => {
        if (reason === 'backdropClick') return;
        closeMenu();
    };

    // Sign out by calling backend and then reloading the SPA
    const handleSignOut = async () => {
        try {
            const url = API_BASE ? `${API_BASE}/auth/logout` : '/auth/logout';
            await fetch(url, { method: 'POST', credentials: 'include' });
        } catch (err) {
            // Non-fatal: even if the request fails, proceed to clear UI state
            // eslint-disable-next-line no-console
            console.error('Logout error:', err);
        } finally {
            closeMenu();
            // Navigate home and hard-reload so any user state is cleared
            navigate('/', { replace: true });
            window.setTimeout(() => window.location.reload(), 0);
        }
    };

    return (
        <>
            <AppBar
                position="static"
                elevation={0}
                color="default"
                sx={{
                    bgcolor: 'background.paper', // themed (was #fff)
                    color: 'text.primary',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Toolbar sx={{ minHeight: { xs: 72, sm: 88 }, px: { xs: 1, sm: 2 } }}>
                    {/* LEFT group: logo + tabs (now left-aligned) */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: { xs: 1, sm: 2 },
                            minWidth: 0,
                            flexShrink: 1
                        }}
                    >
                        <Box
                            component="img"
                            src={logo}
                            alt="Local Lantern"
                            sx={{ height: { xs: 64, sm: 96 }, cursor: 'pointer', flexShrink: 0 }}
                            onClick={() => {
                                onTabChange('All');
                                navigate('/');
                            }}
                        />
                        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                            <TabBar tabs={TABS} activeTab={derivedActiveTab} onTabChange={handleTabChange} />
                        </Box>
                    </Box>

                    {/* Spacer pushes account actions to the far right */}
                    <Box sx={{ flexGrow: 1 }} />

                    {/* RIGHT group: account actions */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 2,
                            p: 1,
                            pr: 1.25,
                            gap: 1.25,
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            maxWidth: { xs: '100%', sm: 'unset' }
                        }}
                    >
                        <Avatar
                            src={avatarSrc}
                            alt={u ? `${u.first_name} ${u.last_name}` : 'Guest'}
                            sx={{ width: 36, height: 36, flexShrink: 0 }}
                        />

                        {u ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                                    Welcome, {u.first_name}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                                    <Button
                                        size="small"
                                        startIcon={<PersonIcon />}
                                        variant={onMyProfileRoute ? 'contained' : 'outlined'}
                                        color="primary"
                                        sx={{ ...(onMyProfileRoute ? { color: '#fff' } : {}) }}
                                        onClick={() => {
                                            onTabChange('');
                                            navigate(profilePath);
                                        }}
                                    >
                                        My Profile
                                    </Button>
                                    <Button
                                        size="small"
                                        startIcon={<PublicIcon />}
                                        variant={onSocialRoute ? 'contained' : 'outlined'}
                                        color="primary"
                                        sx={{ ...(onSocialRoute ? { color: '#fff' } : {}) }}
                                        onClick={() => {
                                            onTabChange('');
                                            navigate('/social');
                                        }}
                                    >
                                        Social
                                    </Button>
                                    <Button
                                        size="small"
                                        startIcon={<MailOutlineIcon />}
                                        variant={onMessagesRoute ? 'contained' : 'outlined'}
                                        color="primary"
                                        sx={{ ...(onMessagesRoute ? { color: '#fff' } : {}) }}
                                        onClick={() => {
                                            onTabChange('');
                                            navigate('/messages', { state: { viewer: u } });
                                        }}
                                    >
                                        Messages
                                    </Button>
                                </Box>
                            </Box>
                        ) : (
                            <>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    onClick={openLogin}
                                >
                                    Login
                                </Button>
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="primary"
                                    onClick={() => navigate('/register')}
                                >
                                    Create an Account
                                </Button>
                            </>
                        )}

                        {/* Only show the dots when a user is logged in */}
                        {u && (
                            <IconButton
                                size="small"
                                aria-label="Account options"
                                aria-controls={menuOpen ? 'account-menu' : undefined}
                                aria-haspopup="true"
                                aria-expanded={menuOpen ? 'true' : undefined}
                                onClick={handleDotsClick}
                            >
                                <MoreVertIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>

            {u && (
                <Menu
                    id="account-menu"
                    anchorEl={anchorEl}
                    open={menuOpen}
                    onClose={handleMenuClose}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    MenuListProps={{ disablePadding: true }}
                    PaperProps={{
                        sx: {
                            minWidth: 240,
                            p: 1,
                            pt: 0.5
                        }
                    }}
                >
                    {/* X close button (popup rule) */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <IconButton
                            size="small"
                            aria-label="Close"
                            onClick={() => closeMenu()}
                            sx={{ alignSelf: 'flex-end' }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    {/* Dropdown items */}
                    <MenuItem onClick={handleSignOut}>
                        <ListItemIcon>
                            <LogoutIcon fontSize="small" />
                        </ListItemIcon>
                        Sign Out
                    </MenuItem>
                </Menu>
            )}
        </>
    );
}
