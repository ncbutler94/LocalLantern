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
    InputAdornment,
    Menu,
    MenuItem,
    Paper,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { alpha } from '@mui/material/styles';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import axios from 'axios';
import MessageDialog from './MessageDialog';

const api = process.env.REACT_APP_API_URL;

function idKey(u) {
    return String(u?.id ?? '');
}

/**
 * Mini tile used in the section (not the dialog) to preview up to 9 users.
 * Ensures long names/handles are truncated with ellipsis on one line.
 * UPDATED: slightly larger tile + shows @username under name.
 */
function GridMiniCard({ user, onClick }) {
    const name =
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
        user?.display_name ||
        user?.name ||
        (user?.handle ? `@${user.handle}` : 'User');

    const username = user?.handle || user?.username || '';
    const avatar = user?.avatar_url || user?.profile_picture || '';

    return (
        <Paper
            variant="outlined"
            onClick={onClick}
            sx={{
                cursor: 'pointer',
                borderRadius: 2,
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
                bgcolor: '#FFFFFF',
                borderColor: (t) => alpha(t.palette.primary.main, 0.14),
                boxShadow: 'none',
                transition: 'border-color .15s ease',
                '&:hover': {
                    borderColor: (t) => alpha(t.palette.secondary.main, 0.28),
                },
            }}
        >
            <Avatar
                src={avatar}
                alt={name}
                variant="square"
                sx={{ width: 72, height: 72, borderRadius: 1 }}
            />

            <Box sx={{ width: '100%', minWidth: 0 }}>
                <Typography
                    variant="body2"
                    noWrap
                    title={name}
                    sx={{
                        textAlign: 'center',
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {name}
                </Typography>

                {username ? (
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        title={`@${username}`}
                        sx={{
                            textAlign: 'center',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        @{username}
                    </Typography>
                ) : null}
            </Box>
        </Paper>
    );
}

export default forwardRef(function FollowsSection(
    {
        viewer,
        profileId,
        profileHandle,
        profileAvatar,
        profileName,
        profileUsername,
        onFlash,
        refreshNonce,
        showFollowingTabInSection = true,
        fillHeight = false,
    },
    ref
) {
    // 0 = Followers, 1 = Following
    const [tab, setTab] = useState(0);

    // Force reload of followers/following lists
    const [refreshTick, setRefreshTick] = useState(0);

    const [loading, setLoading] = useState(true);
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);

    // Randomized preview (section shows a few users only)
    const [previewFollowers, setPreviewFollowers] = useState([]);
    const [previewFollowing, setPreviewFollowing] = useState([]);
    const [counts, setCounts] = useState({ followers: 0, following: 0 });
    const [loadError, setLoadError] = useState('');

    // Viewer relationship set (to decide Follow/Follow Back visibility)
    const [viewerFollowingIds, setViewerFollowingIds] = useState(new Set());

    // Popup (View All)
    const [allOpen, setAllOpen] = useState(false);
    const [dialogTab, setDialogTab] = useState(0);

    // Search within popup (per active tab)
    const [searchText, setSearchText] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const dialogScrollRef = useRef(null);

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

    useImperativeHandle(ref, () => ({
        openAll: () => {
            setDialogTab(tab);
            setAllOpen(true);
        },
        refresh: () => {
            setRefreshTick((t) => t + 1);
        },
    }));

    // Reset popup search when switching tabs or opening the dialog
    useEffect(() => {
        if (!allOpen) return;
        setSearchText('');
        setAppliedQuery('');
        closeMenu();
        if (dialogScrollRef.current) {
            dialogScrollRef.current.scrollTop = 0;
        }
    }, [dialogTab, allOpen]);
    // UPDATED: prefer numeric id for API robustness; fall back to handle
    const key =
        String(profileId || '') ||
        (profileHandle && String(profileHandle).toLowerCase());

    const lastRefreshNonceRef = useRef(refreshNonce);

    useEffect(() => {
        if (typeof refreshNonce === 'undefined') return;
        if (lastRefreshNonceRef.current === refreshNonce) return;
        lastRefreshNonceRef.current = refreshNonce;
        setRefreshTick((t) => t + 1);
    }, [refreshNonce]);


    // Load social lists for the viewed profile (and refresh when requested)
    useEffect(() => {
        if (!key) return;

        let alive = true;
        const ctrl = new AbortController();

        (async () => {
            setLoading(true);
            setLoadError('');
            setPreviewFollowers([]);
            setPreviewFollowing([]);

            try {
                const r = await axios.get(
                    `${api}/users/social/${encodeURIComponent(key)}`,
                    { withCredentials: true, signal: ctrl.signal }
                );
                if (!alive) return;

                const nextFollowers = Array.isArray(r.data.followers) ? r.data.followers : [];
                const nextFollowing = Array.isArray(r.data.following) ? r.data.following : [];
                const nextCounts = r.data.counts || { followers: 0, following: 0 };

                setFollowers(nextFollowers);
                setFollowing(nextFollowing);
                setCounts(nextCounts);

                // Randomized preview (only a few tiles are shown in the section)
                const PREVIEW_MAX = 3;
                const shuffle = (arr) => {
                    const a = Array.isArray(arr) ? arr.slice() : [];
                    for (let i = a.length - 1; i > 0; i -= 1) {
                        const j = Math.floor(Math.random() * (i + 1));
                        const tmp = a[i];
                        a[i] = a[j];
                        a[j] = tmp;
                    }
                    return a;
                };

                setPreviewFollowers(shuffle(nextFollowers).slice(0, PREVIEW_MAX));
                setPreviewFollowing(shuffle(nextFollowing).slice(0, PREVIEW_MAX));
            } catch (e) {
                if (alive) {
                    setLoadError(e?.response?.data?.message || 'Failed to load followers.');
                }
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [key, refreshTick]);


    // Load viewer’s own follow set so we can show correct contextual options
    useEffect(() => {
        if (!viewer) {
            setViewerFollowingIds(new Set());
            return;
        }

        let alive = true;
        const ctrl = new AbortController();

        (async () => {
            try {
                const who = viewer?.public_id || viewer?.id || viewer?.handle;
                const r = await axios.get(
                    `${api}/users/social/${encodeURIComponent(who)}`,
                    { withCredentials: true, signal: ctrl.signal }
                );
                if (!alive) return;
                const myFollowing = (r.data.following || []).map((u) => idKey(u));
                setViewerFollowingIds(new Set(myFollowing));
            } catch {
                if (alive) setViewerFollowingIds(new Set());
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
                setCounts((c) => ({ ...c, following: (c.following || 0) + 1 }));
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
            await axios.post(
                `${api}/users/follow`,
                { target_id: u.id, action: 'unfollow' },
                { withCredentials: true }
            );
            removeWeFollow(u.id);

            if (isOwnPage) {
                setFollowing((list) => list.filter((x) => Number(x.id) !== Number(u.id)));
                setCounts((c) => ({
                    ...c,
                    following: Math.max(0, (c.following || 0) - 1),
                }));
            }
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


    const normalizeQuery = (q) => String(q || '').toLowerCase().trim();

    const userMatchesQuery = (u, q) => {
        const nq = normalizeQuery(q);
        if (!nq) return true;

        const name = `${u?.first_name || ''} ${u?.last_name || ''}`.toLowerCase();
        const handle = String(u?.handle || u?.username || '').toLowerCase();
        const display = String(u?.display_name || u?.name || '').toLowerCase();
        return name.includes(nq) || handle.includes(nq) || display.includes(nq);
    };
    const sortUsersAlpha = (list) => {
        const arr = Array.isArray(list) ? list.slice() : [];
        const norm = (s) => String(s || '').toLowerCase().trim();

        arr.sort((a, b) => {
            const aFirst = norm(a?.first_name);
            const aLast = norm(a?.last_name);
            const aDisplay = norm(a?.display_name || a?.name);
            const aHandle = norm(a?.handle || a?.username);

            const bFirst = norm(b?.first_name);
            const bLast = norm(b?.last_name);
            const bDisplay = norm(b?.display_name || b?.name);
            const bHandle = norm(b?.handle || b?.username);

            const aKey = (aLast || aFirst) ? `${aLast} ${aFirst}`.trim() : (aDisplay || aHandle);
            const bKey = (bLast || bFirst) ? `${bLast} ${bFirst}`.trim() : (bDisplay || bHandle);

            const c = aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
            if (c !== 0) return c;
            return aHandle.localeCompare(bHandle, undefined, { sensitivity: 'base' });
        });

        return arr;
    };


    const handleApplySearch = () => {
        setAppliedQuery(searchText);
        closeMenu();
        if (dialogScrollRef.current) {
            dialogScrollRef.current.scrollTop = 0;
        }
    };

    const handleClearSearch = () => {
        setSearchText('');
        setAppliedQuery('');
        closeMenu();
        if (dialogScrollRef.current) {
            dialogScrollRef.current.scrollTop = 0;
        }
    };

    // ------- Section content: preview up to 9 -------
    const visibleList = tab === 0 ? previewFollowers : previewFollowing;

    const dialogList = dialogTab === 0 ? followers : following;
    const filteredDialogList = dialogList.filter((u) => userMatchesQuery(u, appliedQuery));
    const sortedDialogList = sortUsersAlpha(filteredDialogList);

    return (
        <Box
            sx={{
                ...(fillHeight ? { flex: 1, minHeight: 0, height: '100%' } : null),
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {showFollowingTabInSection ? (
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 0.75 }}>
                    <Tab label={`Followers (${counts.followers || 0})`} />
                    <Tab label={`Following (${counts.following || 0})`} />
                </Tabs>
            ) : (
                <Tabs value={0} onChange={() => {}} sx={{ mb: 0.75 }}>
                    <Tab label={`Followers (${counts.followers || 0})`} />
                </Tabs>
            )}

            <Box
                sx={{
                    flex: '1 1 auto',
                    minHeight: 0,
                    overflowY: 'auto',
                    pr: 0.25,
                }}
            >
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
                        {/* UPDATED: 3 per row on desktop, responsive on smaller screens */}
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: 'repeat(2, minmax(0, 1fr))',
                                    sm: 'repeat(3, minmax(0, 1fr))',
                                },
                                gap: 1,
                            }}
                        >
                            {visibleList.map((u) => (
                                <GridMiniCard key={u.id} user={u} onClick={() => goProfile(u)} />
                            ))}
                        </Box>

                        {visibleList.length === 0 && (
                            <Box sx={{ py: 2, flex: 1, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography color="text.secondary">
                                    {tab === 0 ? 'No Followers.' : 'None Following.'}
                                </Typography>
                            </Box>
                        )}
                    </>
                )}
            </Box>



            {/* ---------- View All Popup ---------- */}
            <Dialog
                open={allOpen}
                onClose={(_, reason) => {
                    if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
                    setAllOpen(false);
                }}
                fullWidth
                maxWidth="md"
                PaperProps={{
                    sx: {
                        width: 980,
                        maxWidth: '96vw',
                        height: { xs: 'min(560px, 86vh)', sm: 'min(620px, 86vh)', md: 'min(680px, 86vh)' },
                        maxHeight: '90vh',
                        borderRadius: 3,
                        overflow: 'hidden',
                    },
                }}
            >
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
                    <IconButton aria-label="Close" onClick={() => setAllOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent
                    sx={{
                        p: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        height: 'calc(100% - 56px)',
                        overflow: 'hidden',
                        minHeight: 0,
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            p: 2,
                            borderBottom: 1,
                            borderColor: 'divider',
                            gap: 0.75,
                            flex: '0 0 auto',
                        }}
                    >
                        <Avatar
                            src={profileAvatar}
                            variant="square"
                            sx={{ width: 72, height: 72, borderRadius: 1 }}
                        />
                        <Typography sx={{ fontWeight: 700 }} noWrap title={profileName || ''}>
                            {profileName || ''}
                        </Typography>
                        <Typography
                            sx={{ fontWeight: 700 }}
                            color="text.secondary"
                            noWrap
                            title={profileUsername ? `@${profileUsername}` : ''}
                        >
                            @{profileUsername || ''}
                        </Typography>
                    </Box>

                    <Tabs
                        value={dialogTab}
                        onChange={(_, v) => setDialogTab(v)}
                        sx={{ px: 1.25, flex: '0 0 auto' }}
                    >
                        <Tab label={`Followers (${counts.followers || 0})`} />
                        <Tab label={`Following (${counts.following || 0})`} />
                    </Tabs>

                    <Divider sx={{ flex: '0 0 auto' }} />

                    <Box
                        sx={{
                            px: 1.25,
                            py: 1.25,
                            borderBottom: 1,
                            borderColor: 'divider',
                            flex: '0 0 auto',
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            gap: 0.75,
                            alignItems: { xs: 'stretch', sm: 'center' },
                        }}
                    >
                        <TextField
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder={dialogTab === 0 ? 'Search followers…' : 'Search following…'}
                            size="small"
                            fullWidth
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleApplySearch();
                                }
                            }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                '& .MuiOutlinedInput-root': { borderRadius: 999 },
                            }}
                        />

                        <Box
                            sx={{
                                display: 'flex',
                                gap: 0.75,
                                justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                            }}
                        >
                            <Button
                                variant="contained"
                                onClick={handleApplySearch}
                                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 999, px: 2.25 }}
                            >
                                Search
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={handleClearSearch}
                                startIcon={<ClearIcon />}
                                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 999, px: 2.25 }}
                            >
                                Clear
                            </Button>
                        </Box>
                    </Box>

                    <Box
                        ref={dialogScrollRef}
                        sx={{
                            p: 1,
                            flex: '1 1 auto',
                            minHeight: 0,
                            overflowY: 'auto',
                        }}
                    >
                        {loading ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                Loading…
                            </Typography>
                        ) : dialogList.length === 0 ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                {dialogTab === 0 ? 'No Followers.' : 'None Following.'}
                            </Typography>
                        ) : normalizeQuery(appliedQuery) && filteredDialogList.length === 0 ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                No results.
                            </Typography>
                        ) : (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                        xs: 'repeat(1, minmax(0, 1fr))',
                                        sm: 'repeat(2, minmax(0, 1fr))',
                                    },
                                    gap: 2,
                                }}
                            >
                                {sortedDialogList.map((u) => {
                                    const name =
                                        `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
                                        (u.handle ? `@${u.handle}` : 'User');
                                    const username = u.handle || u.username || '';
                                    const avatar = u.avatar_url || u.profile_picture || '';

                                    const canFollowOption = !isOwnPage && !weFollow(u);
                                    const canUnfollowOption = isOwnPage && dialogTab === 1;
                                    const canFollowBackOption = isOwnPage && dialogTab === 0 && !weFollow(u);

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
                                            <Avatar
                                                src={avatar}
                                                alt={name}
                                                variant="square"
                                                sx={{
                                                    width: 96,
                                                    height: 96,
                                                    borderRadius: 1,
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => goProfile(u)}
                                            />

                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    noWrap
                                                    title={name}
                                                    sx={{
                                                        cursor: 'pointer',
                                                        fontWeight: 700,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                    onClick={() => goProfile(u)}
                                                >
                                                    {name}
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    color="text.secondary"
                                                    noWrap
                                                    title={`@${username}`}
                                                    sx={{
                                                        cursor: 'pointer',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                    onClick={() => goProfile(u)}
                                                >
                                                    @{username}
                                                </Typography>
                                            </Box>

                                            <IconButton size="small" onClick={(e) => openMenu(e, u)}>
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>

                                            {menuUser && menuUser.id === u.id ? (
                                                <Menu
                                                    open={Boolean(menuAnchor)}
                                                    anchorEl={menuAnchor}
                                                    onClose={closeMenu}
                                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                                >
                                                    {canUnfollowOption ? (
                                                        <MenuItem onClick={() => unfollowUser(u)}>Unfollow</MenuItem>
                                                    ) : null}

                                                    {canFollowBackOption ? (
                                                        <MenuItem onClick={() => followUser(u, true)}>
                                                            Follow Back
                                                        </MenuItem>
                                                    ) : null}

                                                    {canFollowOption ? (
                                                        <MenuItem onClick={() => followUser(u, false)}>Follow</MenuItem>
                                                    ) : null}

                                                    {canMessage(u) ? (
                                                        <MenuItem onClick={() => openMessage(u)}>
                                                            Send Message
                                                        </MenuItem>
                                                    ) : null}

                                                    <MenuItem onClick={() => goProfile(u)}>View Profile</MenuItem>
                                                </Menu>
                                            ) : null}
                                        </Paper>
                                    );
                                })}
                            </Box>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>

            <MessageDialog
                open={msgOpen}
                onClose={() => setMsgOpen(false)}
                toUser={msgTarget}
                onSent={() => onFlash?.({ type: 'success', text: 'Message sent.' })}
                onError={(txt) => onFlash?.({ type: 'error', text: txt || 'Failed to send message.' })}
            />
        </Box>
    );
});
