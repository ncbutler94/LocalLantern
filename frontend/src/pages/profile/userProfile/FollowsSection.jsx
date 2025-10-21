// src/pages/profile/userProfile/FollowsSection.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Menu, MenuItem, Tab, Tabs, Typography } from '@mui/material';
import axios from 'axios';
import UserMiniCard from './UserMiniCard';
import MessageDialog from './MessageDialog';

const api = process.env.REACT_APP_API_URL;

export default function FollowsSection({
                                           viewer, profileId, profileHandle, onFlash,
                                           isFollowingProfile, onToggleFollowProfile,
                                       }) {
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [counts, setCounts] = useState({ followers: 0, following: 0 });
    const [loadError, setLoadError] = useState('');

    const [menuAnchor, setMenuAnchor] = useState(null);
    const [menuUser, setMenuUser] = useState(null);
    const [msgOpen, setMsgOpen] = useState(false);
    const [msgTarget, setMsgTarget] = useState(null);

    const openMenu = (e, user) => { setMenuAnchor(e.currentTarget); setMenuUser(user); };
    const closeMenu = () => { setMenuAnchor(null); setMenuUser(null); };
    const canAct = (u) => viewer && u && viewer.id !== u.id;

    const lastKeyRef = useRef(null);
    const inFlightRef = useRef(false);
    const key = (profileHandle && String(profileHandle).toLowerCase()) || String(profileId || '');

    useEffect(() => {
        if (!key) return;
        if (inFlightRef.current || lastKeyRef.current === key) return;
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            inFlightRef.current = true; lastKeyRef.current = key;
            setLoading(true); setLoadError('');
            try {
                const r = await axios.get(`${api}/users/social/${encodeURIComponent(key)}`, { withCredentials: true, signal: ctrl.signal });
                if (!alive) return;
                setFollowers(r.data.followers || []);
                setFollowing(r.data.following || []);
                setCounts(r.data.counts || { followers: 0, following: 0 });
            } catch (e) { if (alive) setLoadError(e?.response?.data?.message || 'Failed to load followers.'); }
            finally { if (alive) setLoading(false); inFlightRef.current = false; }
        })();
        return () => { alive = false; ctrl.abort(); };
    }, [key]);

    const goProfile = (u) => {
        if (!u) return;
        const path = u.handle ? `/${u.handle}` : `/${u.public_id || u.id}`;
        window.location.assign(path);
    };

    const onFollowUser = async (u) => {
        if (!viewer || viewer.id === u.id) return;
        try {
            await axios.post(`${api}/users/follow`, { target_id: u.id, action: 'follow' }, { withCredentials: true });
            onFlash?.({ type: 'success', text: 'Followed.' });
        } catch (e) { onFlash?.({ type: 'error', text: e.response?.data?.message || 'Failed to follow.' }); }
        finally { closeMenu(); }
    };

    const openMessage = (u) => { setMsgTarget(u); setMsgOpen(true); closeMenu(); };

    return (
        <Box>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
                <Tab label={`Followers (${counts.followers})`} />
                <Tab label={`Following (${counts.following})`} />
            </Tabs>

            {loading ? (
                <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            ) : loadError ? (
                <Typography color="error" sx={{ py: 1 }}>{loadError}</Typography>
            ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
                    {(tab === 0 ? followers : following).map((u) => (
                        <UserMiniCard key={u.id} user={u} onMenu={(e) => openMenu(e, u)} />
                    ))}
                    {(tab === 0 ? followers : following).length === 0 && (
                        <Typography color="text.secondary" sx={{ py: 2 }}>
                            {tab === 0 ? 'No followers yet.' : 'Not following anyone yet.'}
                        </Typography>
                    )}
                </Box>
            )}

            {!viewer || Number(viewer.id) === Number(profileId) ? null : (
                <Box sx={{ mt: 1 }}>
                    <Button size="small" variant={isFollowingProfile ? 'outlined' : 'contained'} onClick={onToggleFollowProfile} disabled={isFollowingProfile}>
                        {isFollowingProfile ? 'Following' : 'Follow this user'}
                    </Button>
                </Box>
            )}

            <Menu open={Boolean(menuAnchor)} anchorEl={menuAnchor} onClose={closeMenu}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                {canAct(menuUser) && <MenuItem onClick={() => onFollowUser(menuUser)}>Follow</MenuItem>}
                {canAct(menuUser) && <MenuItem onClick={() => openMessage(menuUser)}>Message</MenuItem>}
                <MenuItem onClick={() => goProfile(menuUser)}>View Profile</MenuItem>
            </Menu>

            <MessageDialog open={msgOpen} onClose={() => setMsgOpen(false)} toUser={msgTarget}
                           onSent={() => onFlash?.({ type: 'success', text: 'Message sent.' })}
                           onError={(txt) => onFlash?.({ type: 'error', text: txt || 'Failed to send message.' })} />
        </Box>
    );
}
