// src/pages/profile/userProfile/FollowsSection.jsx
import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import {
    Avatar,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Tab,
    Tabs,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import axios from 'axios';
import UserMiniCard from './UserMiniCard';
import MessageDialog from './MessageDialog';

const api = process.env.REACT_APP_API_URL;

function idKey(u) {
    // normalize id for Set membership checks
    return String(u?.id ?? '');
}

export default forwardRef(function FollowsSection(
    {
        viewer,
        profileId,
        profileHandle,
        profileAvatar,
        profileName,          // shows in popup header (bold)
        profileUsername,      // shows in popup header (bold)
        onFlash,
        isFollowingProfile,
        onToggleFollowProfile,
        showFollowingTabInSection = true, // hide "Following" tab in the section if false
    },
    ref
) {
    // 0 = Followers, 1 = Following
    const [tab, setTab] = useState(0);

    const [loading, setLoading] = useState(true);
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [counts, setCounts] = useState({ followers: 0, following: 0 });
    const [loadError, setLoadError] = useState('');

    // Viewer relationship sets (to decide Follow/Follow Back visibility)
    const [viewerFollowingIds, setViewerFollowingIds] = useState(new Set());
    const [viewerFollowerIds, setViewerFollowerIds] = useState(new Set());

    // Popup (View All)
    const [allOpen, setAllOpen] = useState(false);
    const [dialogTab, setDialogTab] = useState(0);

    // 3-dots menu & messaging
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [menuUser, setMenuUser] = useState(null);
    const [msgOpen, setMsgOpen] = useState(false);
    const [msgTarget, setMsgTarget] = useState(null);

    const openMenu = (e, user) => {
        e.stopPropagation();
        setMenuAnchor(e.currentTarget);
        setMenuUser(user);
    };
    const closeMenu = () => {
        setMenuAnchor(null);
        setMenuUser(null);
    };

    const canMessage = (u) => viewer && u && Number(viewer.id) !== Number(u.id);
    const isOwnPage = viewer && Number(viewer.id) === Number(profileId);

    // expose "openAll" to parent so header button can open with current tab
    useImperativeHandle(ref, () => ({
        openAll: () => {
            setDialogTab(tab);
            setAllOpen(true);
        },
    }));

    // cache for which profile is loaded
    const lastKeyRef = useRef(null);
    const inFlightRef = useRef(false);
    const key =
        (profileHandle && String(profileHandle).toLowerCase()) ||
        String(profileId || '');

    // Load social lists for the viewed profile
    useEffect(() => {
        if (!key) return;
        if (inFlightRef.current || lastKeyRef.current === key) return;
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            inFlightRef.current = true;
            lastKeyRef.current = key;
            setLoading(true);
            setLoadError('');
            try {
                const r = await axios.get(
                    `${api}/users/social/${encodeURIComponent(key)}`,
                    { withCredentials: true, signal: ctrl.signal }
                );
                if (!alive) return;
                setFollowers(r.data.followers || []);
                setFollowing(r.data.following || []);
                setCounts(r.data.counts || { followers: 0, following: 0 });
            } catch (e) {
                if (alive)
                    setLoadError(
                        e?.response?.data?.message || 'Failed to load followers.'
                    );
            } finally {
                if (alive) setLoading(false);
                inFlightRef.current = false;
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [key]);

    // Load viewer’s own follow sets so we can show correct contextual options
    useEffect(() => {
        if (!viewer) {
            setViewerFollowingIds(new Set());
            setViewerFollowerIds(new Set());
            return;
        }
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            try {
                const who = viewer.handle || viewer.public_id || viewer.id;
                const r = await axios.get(
                    `${api}/users/social/${encodeURIComponent(who)}`,
                    {
                        withCredentials: true,
                        signal: ctrl.signal,
                    }
                );
                if (!alive) return;
                const myFollowing = (r.data.following || []).map((u) => idKey(u));
                const myFollowers = (r.data.followers || []).map((u) => idKey(u));
                setViewerFollowingIds(new Set(myFollowing));
                setViewerFollowerIds(new Set(myFollowers));
            } catch {
                if (alive) {
                    setViewerFollowingIds(new Set());
                    setViewerFollowerIds(new Set());
                }
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [viewer]);

    // helpers
    const weFollow = (u) => viewerFollowingIds.has(idKey(u));
    const addWeFollow = (uid) =>
        setViewerFollowingIds((old) => {
            const s = new Set(old);
            s.add(String(uid));
            return s;
        });
    const removeWeFollow = (uid) =>
        setViewerFollowingIds((old) => {
            const s = new Set(old);
            s.delete(String(uid));
            return s;
        });

    const goProfile = (u) => {
        if (!u) return;
        const path = u.handle ? `/${u.handle}` : `/${u.public_id || u.id}`;
        // Close any open UI then navigate
        setAllOpen(false);
        window.location.assign(path);
    };

    // actions
    const followUser = async (u, asFollowBack = false) => {
        if (!viewer || !u || Number(viewer.id) === Number(u.id)) return;
        try {
            await axios.post(
                `${api}/users/follow`,
                { target_id: u.id, action: 'follow' },
                { withCredentials: true }
            );
            addWeFollow(u.id);
            if (isOwnPage) {
                // reflect counts and lists if this is the viewer's own page
                setCounts((c) => ({ ...c, following: (c.following || 0) + 1 }));
                // keep following list unique
                setFollowing((list) => {
                    const exists = list.find((x) => Number(x.id) === Number(u.id));
                    return exists ? list : [...list, u];
                });
            }
            onFlash?.({
                type: 'success',
                text: asFollowBack ? 'Followed back.' : 'Followed.',
            });
        } catch (e) {
            onFlash?.({
                type: 'error',
                text: e?.response?.data?.message || 'Failed to follow.',
            });
        } finally {
            closeMenu();
        }
    };

    const unfollowUser = async (u) => {
        if (!viewer || !u || Number(viewer.id) === Number(u.id)) return;
        try {
            // backend supports this action payload (mirrors follow)
            await axios.post(
                `${api}/users/follow`,
                { target_id: u.id, action: 'unfollow' },
                { withCredentials: true }
            );
            removeWeFollow(u.id);
            if (isOwnPage) {
                // remove from "following" lists and update counts
                setFollowing((list) =>
                    list.filter((x) => Number(x.id) !== Number(u.id))
                );
                setCounts((c) => ({
                    ...c,
                    following: Math.max(0, (c.following || 0) - 1),
                }));
            }
            onFlash?.({ type: 'success', text: 'Unfollowed.' });
        } catch (e) {
            onFlash?.({
                type: 'error',
                text: e?.response?.data?.message || 'Failed to unfollow.',
            });
        } finally {
            closeMenu();
        }
    };

    const openMessage = (u) => {
        setMsgTarget(u);
        setMsgOpen(true);
        closeMenu();
    };

    // ------- Section (card) content: grid tiles, max 9 for the left rail -------
    const visibleList = (tab === 0 ? followers : following).slice(0, 9);

    return (
        <Box>
            {/* SECTION TABS (left rail): hide "Following" label if requested */}
            {showFollowingTabInSection ? (
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
                    <Tab label={`Followers (${counts.followers || 0})`} />
                    <Tab label={`Following (${counts.following || 0})`} />
                </Tabs>
            ) : (
                <Tabs value={0} onChange={() => {}} sx={{ mb: 1 }}>
                    <Tab label={`Followers (${counts.followers || 0})`} />
                </Tabs>
            )}

            {loading ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                </Box>
            ) : loadError ? (
                <Typography color="error" sx={{ py: 1 }}>
                    {loadError}
                </Typography>
            ) : (
                <>
                    {/* 3 per row grid, capped at 9 (unchanged for left rail) */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 1,
                        }}
                    >
                        {visibleList.map((u) => (
                            <UserMiniCard key={u.id} user={u} variant="grid" />
                        ))}
                    </Box>

                    {visibleList.length === 0 && (
                        <Typography color="text.secondary" sx={{ py: 2 }}>
                            {tab === 0 ? 'No followers yet.' : 'Not following anyone yet.'}
                        </Typography>
                    )}

                    {/* Optional helper button for non-owners to follow the profile itself */}
                    {!viewer || Number(viewer.id) === Number(profileId) ? null : (
                        <Box sx={{ mt: 1 }}>
                            <Button
                                size="small"
                                variant={isFollowingProfile ? 'outlined' : 'contained'}
                                onClick={onToggleFollowProfile}
                                disabled={isFollowingProfile}
                            >
                                {isFollowingProfile ? 'Following' : 'Follow this user'}
                            </Button>
                        </Box>
                    )}
                </>
            )}

            {/* ---------- View All Popup ---------- */}
            <Dialog
                open={allOpen}
                scroll="paper"
                onClose={(_, reason) => {
                    // Do not close when clicking outside the popup
                    if (reason === 'backdropClick') return;
                    setAllOpen(false);
                }}
                fullWidth
                maxWidth="md"
                PaperProps={{
                    sx: {
                        // Bigger popup, responsive, and fixed-height paper so only inner list scrolls
                        width: { xs: '94vw', sm: '92vw', md: 'min(1000px, 92vw)' },
                        height: { xs: '92vh', md: 'min(760px, 92vh)' },
                        borderRadius: 3,
                        display: 'flex',
                        flexDirection: 'column',
                    },
                }}
            >
                {/* Title bar (separate, top-left) with X close button */}
                <DialogTitle
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        alignItems: 'center',
                        py: 1.25,
                        pr: 1,
                    }}
                >
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Followers &amp; Following
                    </Typography>
                    <IconButton
                        aria-label="Close"
                        onClick={() => setAllOpen(false)}
                        size="small"
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                {/* Everything below stays pinned, only the list area will scroll */}
                <DialogContent
                    sx={{
                        p: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        minHeight: 0, // allows the inner list to become the scroll container
                    }}
                >
                    {/* Header row: avatar center; name/username to the right (both bold) */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto 1fr',
                            alignItems: 'center',
                            p: 1.25,
                            borderBottom: 1,
                            borderColor: 'divider',
                            gap: 1,
                        }}
                    >
                        <Box /> {/* left spacer for visual balance */}
                        <Avatar
                            src={profileAvatar}
                            variant="square"
                            sx={{ width: 72, height: 72, borderRadius: 1, mx: 'auto' }}
                        />
                        <Box sx={{ pl: 1, textAlign: 'left' }}>
                            <Typography sx={{ fontWeight: 700 }} noWrap>
                                {profileName || ''}
                            </Typography>
                            <Typography sx={{ fontWeight: 700 }} color="text.secondary" noWrap>
                                @{profileUsername || ''}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Tabs below header; open on whichever was last selected in section */}
                    <Tabs
                        value={dialogTab}
                        onChange={(_, v) => setDialogTab(v)}
                        sx={{ px: 1.25 }}
                    >
                        <Tab label={`Followers (${counts.followers || 0})`} />
                        <Tab label={`Following (${counts.following || 0})`} />
                    </Tabs>

                    <Divider />

                    {/* Scroll area with 2-up grid cards (OWN SCROLL BOX) */}
                    <Box
                        sx={{
                            p: 1.25,
                            overflowY: 'auto',
                            flex: 1,       // take remaining height
                            minHeight: 0,  // allow it to be the scroll container
                        }}
                    >
                        {loading ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                Loading…
                            </Typography>
                        ) : (dialogTab === 0 ? followers : following).length === 0 ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                {dialogTab === 0
                                    ? 'No followers yet.'
                                    : 'Not following anyone yet.'}
                            </Typography>
                        ) : (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                                    gap: 1,
                                }}
                            >
                                {(dialogTab === 0 ? followers : following).map((u) => {
                                    const name =
                                        `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
                                        (u.handle ? `@${u.handle}` : 'User');
                                    const username = u.handle || u.username || '';
                                    const avatar = u.avatar_url || u.profile_picture || '';

                                    // Decide menu items based on context
                                    const canFollowOption = !isOwnPage && !weFollow(u); // viewing someone else's lists
                                    const canUnfollowOption = isOwnPage && dialogTab === 1; // own Following tab
                                    const canFollowBackOption =
                                        isOwnPage && dialogTab === 0 && !weFollow(u); // own Followers tab

                                    return (
                                        <Paper
                                            key={u.id}
                                            variant="outlined"
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: 'auto 1fr auto',
                                                alignItems: 'center',
                                                gap: 1,
                                                p: 1,
                                                borderRadius: 2,
                                            }}
                                        >
                                            {/* Only avatar/name/username navigate to profile */}
                                            <Avatar
                                                src={avatar}
                                                alt={name}
                                                variant="square"
                                                sx={{
                                                    width: 84,
                                                    height: 84,
                                                    borderRadius: 1,
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => goProfile(u)}
                                            />
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    noWrap
                                                    sx={{ cursor: 'pointer' }}
                                                    onClick={() => goProfile(u)}
                                                >
                                                    {name}
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    color="text.secondary"
                                                    noWrap
                                                    sx={{ cursor: 'pointer' }}
                                                    onClick={() => goProfile(u)}
                                                >
                                                    @{username}
                                                </Typography>
                                            </Box>
                                            <IconButton size="small" onClick={(e) => openMenu(e, u)}>
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>

                                            {/* Contextual menu for this user */}
                                            {menuUser && menuUser.id === u.id && (
                                                <Menu
                                                    open={Boolean(menuAnchor)}
                                                    anchorEl={menuAnchor}
                                                    onClose={closeMenu}
                                                    anchorOrigin={{
                                                        vertical: 'bottom',
                                                        horizontal: 'right',
                                                    }}
                                                    transformOrigin={{
                                                        vertical: 'top',
                                                        horizontal: 'right',
                                                    }}
                                                >
                                                    {canUnfollowOption && (
                                                        <MenuItem onClick={() => unfollowUser(u)}>
                                                            Unfollow
                                                        </MenuItem>
                                                    )}
                                                    {canFollowBackOption && (
                                                        <MenuItem onClick={() => followUser(u, true)}>
                                                            Follow Back
                                                        </MenuItem>
                                                    )}
                                                    {canFollowOption && (
                                                        <MenuItem onClick={() => followUser(u, false)}>
                                                            Follow
                                                        </MenuItem>
                                                    )}
                                                    {canMessage(u) && (
                                                        <MenuItem onClick={() => openMessage(u)}>
                                                            Send Message
                                                        </MenuItem>
                                                    )}
                                                    <MenuItem onClick={() => goProfile(u)}>
                                                        View Profile
                                                    </MenuItem>
                                                </Menu>
                                            )}
                                        </Paper>
                                    );
                                })}
                            </Box>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Message dialog (existing component) */}
            <MessageDialog
                open={msgOpen}
                onClose={() => setMsgOpen(false)}
                toUser={msgTarget}
                onSent={() => onFlash?.({ type: 'success', text: 'Message sent.' })}
                onError={(txt) =>
                    onFlash?.({ type: 'error', text: txt || 'Failed to send message.' })
                }
            />
        </Box>
    );
});
