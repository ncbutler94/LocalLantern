// src/components/Header/Header.jsx
// Header with visible text on white, quick actions, and Messages button that highlights when on /messages
// Updates in this version:
// - Removes Deals + Real Estate tabs from the header.
// - Adds gold marker variants for the ACTIVE tab (matches the header underline).
// - Uses location.pathname as a reliable fallback to determine the active tab (works on refresh / direct URLs).
// - Keeps all previous behavior intact (tabs, routes, account menu).
// - Listens for `me:updated` (CustomEvent) and a `localStorage` signal to refresh the header's user
//   object (and avatar) immediately after profile avatar changes without a full reload.
// - Polishes header UI: improves menu link readability, and visually separates the profile section.
// - Removes the Messages button from the profile section (messages route logic remains intact).
//
// Additional polish (requested next steps):
// - Empty states & onboarding hints: a small non-modal tip bar that appears once and can be dismissed (X top-right).
// - Micro-animations: subtle hover/press transitions for buttons, tabs container, and icon buttons.
// - Mobile header behavior: improved wrapping/scroll for tabs and tighter profile controls on small screens.
// - First-time user experience: guest hint + logged-in hint, both one-time per browser unless dismissed.

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
    IconButton,
    Divider
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonIcon from '@mui/icons-material/Person';
import PublicIcon from '@mui/icons-material/Public';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';

import TabBar from './TabBar';
import logo from '../../assets/LocalLanternLogo.png';

// Marker icons (GREEN default)
import communityMarkerGreen from '../../assets/mapMarkers/community/community-marker.png';
import businessMarkerGreen from '../../assets/mapMarkers/businesses/businesses-marker.png';
import eventsMarkerGreen from '../../assets/mapMarkers/events/events-marker.png';
import musicMarkerGreen from '../../assets/mapMarkers/music/music-marker.png';
import jobsMarkerGreen from '../../assets/mapMarkers/jobs/jobs-marker.png';
import servicesMarkerGreen from '../../assets/mapMarkers/services/services-marker.png';
import marketplaceMarkerGreen from '../../assets/mapMarkers/marketplace/marketplace-marker.png';

// Marker icons (GOLD active)
import communityMarkerGold from '../../assets/mapMarkers/community/community-marker-gold.png';
import businessMarkerGold from '../../assets/mapMarkers/businesses/businesses-marker-gold.png';
import eventsMarkerGold from '../../assets/mapMarkers/events/events-marker-gold.png';
import musicMarkerGold from '../../assets/mapMarkers/music/music-marker-gold.png';
import jobsMarkerGold from '../../assets/mapMarkers/jobs/jobs-marker-gold.png';
import servicesMarkerGold from '../../assets/mapMarkers/services/services-marker-gold.png';
import marketplaceMarkerGold from '../../assets/mapMarkers/marketplace/marketplace-marker-gold.png';

// Unified auth hook
import { useAuth } from '../AuthModalContext';

// Tabs (includes "Music" after "Events") - Deals + Real Estate removed
const rawTabs = ['All', 'Community', 'Businesses', 'Events', 'Music', 'Jobs', 'Services', 'Marketplace'];

// Tab -> marker mapping (GREEN / GOLD)
const markerByTab = {
    Community: { green: communityMarkerGreen, gold: communityMarkerGold },
    Businesses: { green: businessMarkerGreen, gold: businessMarkerGold },
    Events: { green: eventsMarkerGreen, gold: eventsMarkerGold },
    Music: { green: musicMarkerGreen, gold: musicMarkerGold },
    Jobs: { green: jobsMarkerGreen, gold: jobsMarkerGold },
    Services: { green: servicesMarkerGreen, gold: servicesMarkerGold },
    Marketplace: { green: marketplaceMarkerGreen, gold: marketplaceMarkerGold }
};

// Helper to produce API base if provided, else use relative (dev proxy)
const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

// Top-level route names that are **not** user profiles.
// Anything not in this set (and not empty) is treated as a profile route.
const KNOWN_ROOTS = new Set([
    '',
    'community',
    'events',
    'jobs',
    'business',
    'music',
    'services',
    'marketplace',
    // Keeping these even though tabs are removed so these routes are not misclassified as profile routes
    'deals',
    'real-estate',
    'social',
    'messages',
    'login',
    'register',
    'posts',
    'social-login-success',
    'social-signup',
    'u'
]);

// Utility: path matches a base segment (e.g., "/alice" or "/alice/...").
const pathIs = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

function tabFromPathname(pathname) {
    if (pathname === '/' || pathname === '') return 'All';
    if (/^\/community(\/|$)/.test(pathname)) return 'Community';
    if (/^\/business(\/|$)/.test(pathname)) return 'Businesses';
    if (/^\/events(\/|$)/.test(pathname)) return 'Events';
    if (/^\/music(\/|$)/.test(pathname)) return 'Music';
    if (/^\/jobs(\/|$)/.test(pathname)) return 'Jobs';
    if (/^\/services(\/|$)/.test(pathname)) return 'Services';
    if (/^\/marketplace(\/|$)/.test(pathname)) return 'Marketplace';
    return '';
}

const UI_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export default function Header({ user, activeTab, onTabChange }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { openLogin } = useAuth();

    // Anchor only opens from the three-dots button
    const [anchorEl, setAnchorEl] = useState(null);
    const menuOpen = Boolean(anchorEl);

    // Maintain an internal copy that can update via events even if parent prop hasn't re-rendered yet
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

    // Match profile page: do not force a custom fallback image
    const avatarSrc = u?.avatar_url || u?.profile_picture || undefined;
    const slug = u ? u.handle || u.public_id || u.id : '';
    // Navigate directly to the canonical profile route
    const profilePath = u ? `/${slug}` : '/login';

    // Route checks
    const firstSeg = (location.pathname.split('/')[1] || '').toLowerCase();
    const isBareProfileRoute = Boolean(firstSeg) && !KNOWN_ROOTS.has(firstSeg);
    const onLegacyProfileRoute = /^\/u(\/|$)/.test(location.pathname);
    const onAnyProfileRoute = isBareProfileRoute || onLegacyProfileRoute;

    // Only highlight "My Profile" when you're on **your own** profile
    const onMyProfileRoute = u ? pathIs(location.pathname, `/${slug}`) || pathIs(location.pathname, `/u/${slug}`) : false;

    const onSocialRoute = /^\/social(\/|$)/.test(location.pathname);
    const onMessagesRoute = /^\/messages(\/|$)/.test(location.pathname);

    // Clear activeTab whenever we’re on a non-tabbed route (profile, social, messages)
    useEffect(() => {
        if (onAnyProfileRoute || onSocialRoute || onMessagesRoute) onTabChange('');
    }, [onAnyProfileRoute, onSocialRoute, onMessagesRoute, onTabChange]);

    const derivedActiveTab = useMemo(
        () => (onAnyProfileRoute || onSocialRoute || onMessagesRoute ? '' : activeTab),
        [activeTab, onAnyProfileRoute, onSocialRoute, onMessagesRoute]
    );

    const resolvedTab = useMemo(() => {
        if (derivedActiveTab) return derivedActiveTab;
        if (onAnyProfileRoute || onSocialRoute || onMessagesRoute) return '';
        return tabFromPathname(location.pathname);
    }, [derivedActiveTab, location.pathname, onAnyProfileRoute, onSocialRoute, onMessagesRoute]);

    // Build TabBar config with dynamic icons (gold if active)
    const tabsForBar = useMemo(() => {
        return rawTabs.map((t) => {
            const iconSet = markerByTab[t];
            const isActive = resolvedTab === t;

            if (!iconSet) {
                return {
                    value: t,
                    label: (
                        <Typography
                            component="span"
                            sx={{
                                fontSize: { xs: 12, sm: 14 },
                                lineHeight: 1,
                                fontWeight: isActive ? 800 : 650,
                                color: isActive ? 'text.primary' : 'text.secondary',
                                transition: `color 160ms ${UI_EASE}, transform 160ms ${UI_EASE}`,
                                transform: isActive ? 'translateY(-0.5px)' : 'none'
                            }}
                        >
                            {t}
                        </Typography>
                    )
                };
            }

            const src = isActive ? iconSet.gold : iconSet.green;

            return {
                value: t,
                label: (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: { xs: 0.5, sm: 0.75 },
                            transition: `transform 160ms ${UI_EASE}`,
                            transform: isActive ? 'translateY(-0.5px)' : 'none'
                        }}
                    >
                        <Box
                            component="img"
                            src={src}
                            alt={`${t} marker`}
                            sx={{
                                height: { xs: 22, sm: 28 },
                                width: { xs: 22, sm: 28 },
                                display: 'block',
                                filter: isActive ? 'drop-shadow(0px 1px 0px rgba(0,0,0,0.08))' : 'none',
                                transition: `filter 160ms ${UI_EASE}`
                            }}
                        />
                        <Typography
                            component="span"
                            sx={{
                                fontSize: { xs: 12, sm: 14 },
                                lineHeight: 1,
                                fontWeight: isActive ? 800 : 650,
                                color: isActive ? 'text.primary' : 'text.secondary',
                                transition: `color 160ms ${UI_EASE}`
                            }}
                        >
                            {t}
                        </Typography>
                    </Box>
                )
            };
        });
    }, [resolvedTab]);

    const handleTabChange = (val) => {
        onTabChange(val);

        // Route by tab (added Music); Deals + Real Estate removed from header
        if (val === 'Businesses') navigate('/business');
        else if (val === 'Events') navigate('/events');
        else if (val === 'Music') navigate('/music');
        else if (val === 'Jobs') navigate('/jobs');
        else if (val === 'Services') navigate('/services');
        else if (val === 'Marketplace') navigate('/marketplace');
        else if (val === 'Community') {
            // When entering Community from the header, always reset the Community page
            // (no selected post, default filters, and the right-side tab set to Trending).
            try {
                sessionStorage.setItem('ll:community:forceRefresh', '1');
                sessionStorage.removeItem('ll:community:pendingDeleteId');
                sessionStorage.removeItem('ll:community:restore');
            } catch {
                // ignore
            }

            navigate('/community', { state: { llCommunityReset: Date.now() } });
        } else navigate('/');
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
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Toolbar
                    sx={{
                        minHeight: { xs: 84, sm: 104 },
                        px: { xs: 1, sm: 2 },
                        gap: { xs: 1, sm: 2 }
                    }}
                >
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
                            sx={{
                                height: { xs: 78, sm: 112 },
                                width: 'auto',
                                cursor: 'pointer',
                                flexShrink: 0,
                                display: 'block',
                                // If your PNG has extra transparent padding, this helps it read bigger.
                                transform: { xs: 'scale(1.06)', sm: 'scale(1.08)' },
                                transformOrigin: 'left center',
                                filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.12))',
                                transition: `transform 160ms ${UI_EASE}, filter 160ms ${UI_EASE}`,
                                '&:hover': {
                                    transform: { xs: 'scale(1.085)', sm: 'scale(1.10)' },
                                    filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.14))'
                                },
                                '&:active': {
                                    transform: { xs: 'scale(1.06)', sm: 'scale(1.08)' }
                                }
                            }}
                            onClick={() => {
                                onTabChange('All');
                                navigate('/');
                            }}
                        />

                        <Box
                            sx={{
                                minWidth: 0,
                                flex: '1 1 auto',
                                borderRadius: 999,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'rgba(255,255,255,0.55)',
                                px: { xs: 0.25, sm: 1.25 },
                                py: { xs: 0.15, sm: 0.35 },
                                overflowX: { xs: 'auto', sm: 'visible' },
                                WebkitOverflowScrolling: 'touch',
                                scrollbarWidth: 'none',
                                '&::-webkit-scrollbar': { display: 'none' },
                                transition: `box-shadow 180ms ${UI_EASE}, transform 180ms ${UI_EASE}`,
                                '&:hover': {
                                    boxShadow: '0px 2px 10px rgba(0,0,0,0.06)'
                                }
                            }}
                        >
                            <TabBar tabs={tabsForBar} activeTab={resolvedTab} onTabChange={handleTabChange} />
                        </Box>
                    </Box>

                    {/* Spacer pushes account actions to the far right */}
                    <Box sx={{ flexGrow: 1 }} />

                    {/* RIGHT group: account actions */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 999,
                            px: { xs: 1, sm: 1.25 },
                            py: { xs: 0.75, sm: 0.9 },
                            gap: { xs: 1, sm: 1.25 },
                            bgcolor: 'background.default',
                            boxShadow: '0px 1px 0px rgba(0,0,0,0.03)',
                            maxWidth: { xs: '100%', sm: 'unset' },
                            transition: `box-shadow 180ms ${UI_EASE}, transform 180ms ${UI_EASE}`,
                            '&:hover': {
                                boxShadow: '0px 2px 12px rgba(0,0,0,0.06)'
                            }
                        }}
                    >
                        <Avatar
                            src={avatarSrc}
                            alt={u ? `${u.first_name} ${u.last_name}` : 'Guest'}
                            sx={{
                                bgcolor: 'grey.600',
                                width: 36,
                                height: 36,
                                flexShrink: 0,
                                border: '1px solid rgba(0,0,0,0.08)'
                            }}
                        />

                        {u ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                                <Typography
                                    variant="body2"
                                    noWrap
                                    sx={{
                                        fontWeight: 800,
                                        letterSpacing: 0.2,
                                        color: 'text.primary',
                                        lineHeight: 1.1
                                    }}
                                >
                                    Welcome, {u.first_name}
                                </Typography>

                                <Box
                                    sx={{
                                        display: 'flex',
                                        gap: 1,
                                        mt: 0.6,
                                        flexWrap: 'wrap',
                                        flexDirection: { xs: 'column', sm: 'row' },
                                        alignItems: { xs: 'stretch', sm: 'center' },
                                        width: { xs: '100%', sm: 'auto' }
                                    }}
                                >
                                    <Button
                                        size="small"
                                        startIcon={<PersonIcon />}
                                        variant={onMyProfileRoute ? 'contained' : 'outlined'}
                                        color="primary"
                                        sx={{
                                            ...(onMyProfileRoute ? { color: '#fff' } : { bgcolor: 'rgba(0,0,0,0.02)' }),
                                            borderColor: 'rgba(0,0,0,0.18)',
                                            fontWeight: 800,
                                            textTransform: 'none',
                                            borderRadius: 999,
                                            px: 1.5,
                                            minHeight: 32,
                                            transition: `transform 140ms ${UI_EASE}, box-shadow 140ms ${UI_EASE}, background-color 140ms ${UI_EASE}`,
                                            '&:hover': {
                                                transform: 'translateY(-1px)',
                                                boxShadow: '0px 6px 16px rgba(0,0,0,0.08)'
                                            },
                                            '&:active': { transform: 'translateY(0px)' }
                                        }}
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
                                        sx={{
                                            ...(onSocialRoute ? { color: '#fff' } : { bgcolor: 'rgba(0,0,0,0.02)' }),
                                            borderColor: 'rgba(0,0,0,0.18)',
                                            fontWeight: 800,
                                            textTransform: 'none',
                                            borderRadius: 999,
                                            px: 1.5,
                                            minHeight: 32,
                                            transition: `transform 140ms ${UI_EASE}, box-shadow 140ms ${UI_EASE}, background-color 140ms ${UI_EASE}`,
                                            '&:hover': {
                                                transform: 'translateY(-1px)',
                                                boxShadow: '0px 6px 16px rgba(0,0,0,0.08)'
                                            },
                                            '&:active': { transform: 'translateY(0px)' }
                                        }}
                                        onClick={() => {
                                            onTabChange('');
                                            navigate('/social');
                                        }}
                                    >
                                        Social
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
                                    sx={{
                                        borderRadius: 999,
                                        textTransform: 'none',
                                        fontWeight: 800,
                                        transition: `transform 140ms ${UI_EASE}, box-shadow 140ms ${UI_EASE}`,
                                        '&:hover': { transform: 'translateY(-1px)', boxShadow: '0px 6px 16px rgba(0,0,0,0.08)' },
                                        '&:active': { transform: 'translateY(0px)' }
                                    }}
                                >
                                    Login
                                </Button>
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="primary"
                                    onClick={() => navigate('/register')}
                                    sx={{
                                        borderRadius: 999,
                                        textTransform: 'none',
                                        fontWeight: 900,
                                        transition: `transform 140ms ${UI_EASE}, box-shadow 140ms ${UI_EASE}`,
                                        '&:hover': { transform: 'translateY(-1px)', boxShadow: '0px 10px 22px rgba(0,0,0,0.10)' },
                                        '&:active': { transform: 'translateY(0px)' }
                                    }}
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
                                sx={{
                                    ml: { xs: 0, sm: 0.25 },
                                    border: '1px solid rgba(0,0,0,0.10)',
                                    borderRadius: 2,
                                    bgcolor: 'rgba(255,255,255,0.6)',
                                    transition: `transform 140ms ${UI_EASE}, box-shadow 140ms ${UI_EASE}, background-color 140ms ${UI_EASE}`,
                                    '&:hover': {
                                        transform: 'translateY(-1px)',
                                        boxShadow: '0px 10px 18px rgba(0,0,0,0.10)',
                                        bgcolor: 'rgba(255,255,255,0.85)'
                                    },
                                    '&:active': { transform: 'translateY(0px)' }
                                }}
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
                            minWidth: 260,
                            p: 1,
                            pt: 0.5,
                            borderRadius: 2
                        }
                    }}
                >
                    {/* X close button (popup rule) */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <IconButton size="small" aria-label="Close" onClick={() => closeMenu()} sx={{ alignSelf: 'flex-end' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    {/* Quick actions inside menu (helpful on mobile too) */}
                    <MenuItem
                        onClick={() => {
                            closeMenu();
                            onTabChange('');
                            navigate(profilePath);
                        }}
                    >
                        <ListItemIcon>
                            <PersonIcon fontSize="small" />
                        </ListItemIcon>
                        My Profile
                    </MenuItem>

                    <MenuItem
                        onClick={() => {
                            closeMenu();
                            onTabChange('');
                            navigate('/social');
                        }}
                    >
                        <ListItemIcon>
                            <PublicIcon fontSize="small" />
                        </ListItemIcon>
                        Social
                    </MenuItem>

                    <Divider sx={{ my: 0.75 }} />

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
