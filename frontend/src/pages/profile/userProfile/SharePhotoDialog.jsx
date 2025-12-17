// src/pages/profile/userProfile/SharePhotoDialog.jsx
// Upgraded share dialog for PHOTOS:
// - Tabs: Public, Following, Followers (with counts)
// - Pinned filters: name/@, County, City + Search/Clear
// - Square recipients (4 across) with selection & checkmark
// - Excludes the signed-in user
// - "Share to Facebook" opens a composer with a deep link to /community?post=...
//   (For photos we still deep-link to the parent post when available. If a photo
//    is standalone, we deep-link to /?open=photo&photo=:id.)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FacebookIcon from '@mui/icons-material/Facebook';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import axios from 'axios';

// Reuse the shared City/County selector from your project.
// If your local path differs, adjust the import below.
import CityCountySelect from '../../../components/CityCountySelect';

const api = process.env.REACT_APP_API_URL;

const tileWrap = { p: 1, cursor: 'pointer', userSelect: 'none' };
const tile = (selected) => ({
    p: 1.5,
    borderRadius: 2,
    border: selected ? '2px solid #1976d2' : '1px solid rgba(0,0,0,0.08)',
    background: selected ? 'rgba(25,118,210,0.06)' : '#fff',
    position: 'relative',
    height: 160,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 1,
});
const squareAvatar = { width: 88, height: 88, borderRadius: 2, objectFit: 'cover' };
const scroller = { maxHeight: 420, overflow: 'auto', pr: 1 };

export default function SharePhotoDialog({
                                             open,
                                             onClose,
                                             viewer,                  // { id, handle, ... }
                                             photo,                   // photo object; if it has post_id we’ll deep-link to the post
                                             onShared,                // optional callback ({ photoId, recipientIds })
                                         }) {
    const [tab, setTab] = useState('public');
    const [query, setQuery] = useState('');
    const [county, setCounty] = useState('');
    const [city, setCity] = useState('');
    const [loading, setLoading] = useState(false);

    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [counts, setCounts] = useState({ following: 0, followers: 0 });
    const [publicResults, setPublicResults] = useState([]);

    const [selected, setSelected] = useState(() => new Map());

    // Load following/followers + counts
    useEffect(() => {
        if (!open || !viewer?.handle) return;
        let alive = true;
        (async () => {
            try {
                const res = await axios.get(`${api}/users/social/${encodeURIComponent(viewer.handle)}`, { withCredentials: true });
                if (!alive) return;
                setFollowing(res.data?.following || []);
                setFollowers(res.data?.followers || []);
                setCounts(res.data?.counts || { following: 0, followers: 0 });
            } catch {
                if (alive) {
                    setFollowing([]);
                    setFollowers([]);
                    setCounts({ following: 0, followers: 0 });
                }
            }
        })();
        return () => { alive = false; };
    }, [open, viewer?.handle]);

    // Public search
    const handleSearch = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set('q', query.trim());
            if (county) params.set('county', county);
            if (city) params.set('city', city);
            const res = await axios.get(`${api}/users/search?${params.toString()}`, { withCredentials: true });
            const rows = (res.data?.users || res.data || []).filter(u => Number(u.id) !== Number(viewer?.id));
            setPublicResults(rows);
        } catch {
            setPublicResults([]);
        } finally {
            setLoading(false);
        }
    }, [city, county, query, viewer?.id]);

    const handleClear = useCallback(() => {
        setQuery('');
        setCounty('');
        setCity('');
        setPublicResults([]);
    }, []);

    // Selection
    const toggleUser = (u) => {
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(u.id)) next.delete(u.id);
            else next.set(u.id, u);
            return next;
        });
    };

    const UserTile = ({ u }) => {
        const sel = selected.has(u.id);
        return (
            <Box sx={tileWrap} onClick={() => toggleUser(u)}>
                <Box sx={tile(sel)}>
                    <Avatar
                        src={u.profile_picture || u.avatar_url || ''}
                        alt={`${u.first_name || ''} ${u.last_name || ''}`}
                        imgProps={{ style: squareAvatar }}
                        sx={squareAvatar}
                        variant="rounded"
                    />
                    <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                        {(u.first_name || '') + ' ' + (u.last_name || '')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                        @{u.handle || u.username}
                    </Typography>
                    {sel && <CheckCircleIcon fontSize="small" sx={{ position: 'absolute', right: 6, top: 6, color: '#1976d2' }} />}
                </Box>
            </Box>
        );
    };

    const currentList = useMemo(() => {
        if (tab === 'followers') return followers;
        if (tab === 'following') return following;
        return publicResults;
    }, [tab, publicResults, followers, following]);

    // Deep link for Facebook
    const deepLink = useMemo(() => {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://thelocallantern.com';
        if (photo?.post_id) {
            return `${origin}/community?post=${encodeURIComponent(photo.post_id)}`;
        }
        return `${origin}/?open=photo&photo=${encodeURIComponent(photo?.id || '')}`;
    }, [photo?.id, photo?.post_id]);

    const handleShareFacebook = () => {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(deepLink)}&quote=${encodeURIComponent('Check out this post on The Local Lantern.')}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleDone = () => {
        const recipientIds = Array.from(selected.keys());
        onShared && onShared({ photoId: photo?.id, recipientIds });
        onClose();
    };

    useEffect(() => {
        if (open && tab === 'public') handleSearch();
    }, [open, tab, handleSearch]);

    useEffect(() => { if (!open) setSelected(new Map()); }, [open]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Share Photo</Typography>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                {/* Tabs + FB */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2 }}>
                    <Tabs value={tab} onChange={(_e, v) => setTab(v)} textColor="primary" indicatorColor="primary">
                        <Tab value="public" label="Public" />
                        <Tab value="following" label={`Following (${counts.following || 0})`} />
                        <Tab value="followers" label={`Followers (${counts.followers || 0})`} />
                    </Tabs>
                    <Tooltip title="Share to Facebook">
                        <Button startIcon={<FacebookIcon />} variant="outlined" onClick={handleShareFacebook}>
                            Share to Facebook
                        </Button>
                    </Tooltip>
                </Box>

                {/* Pinned Filters */}
                <Box sx={{ px: 2, py: 1, borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fafafa' }}>
                    <Grid container spacing={1} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <TextField
                                size="small"
                                fullWidth
                                placeholder="Name or @username"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <CityCountySelect
                                size="small"
                                county={county}
                                city={city}
                                onCountyChange={setCounty}
                                onCityChange={setCity}
                            />
                        </Grid>
                        <Grid item xs={12} md={4} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button onClick={handleSearch} variant="contained" startIcon={<SearchIcon />} disabled={loading}>
                                Search
                            </Button>
                            <Button onClick={handleClear} variant="outlined" startIcon={<ClearIcon />} disabled={loading}>
                                Clear
                            </Button>
                        </Grid>
                    </Grid>
                </Box>

                {/* Selected Recipients */}
                <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {Array.from(selected.values()).map((u) => (
                        <Chip
                            key={u.id}
                            avatar={<Avatar src={u.profile_picture || u.avatar_url || ''} />}
                            label={`${u.first_name || ''} ${u.last_name || ''} (@${u.handle || u.username || ''})`}
                            onDelete={() => setSelected(prev => { const next = new Map(prev); next.delete(u.id); return next; })}
                        />
                    ))}
                </Box>

                {/* Results Grid */}
                <Box sx={{ px: 2, pt: 1, ...scroller }}>
                    <Grid container spacing={1.5}>
                        {currentList.map((u) => (
                            <Grid key={u.id} item xs={6} sm={3}>
                                <UserTile u={u} />
                            </Grid>
                        ))}
                        {!currentList.length && (
                            <Grid item xs={12}>
                                <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                                    {tab === 'public' ? (loading ? 'Searching…' : 'No users found.') : 'No users to show.'}
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
                    {selected.size ? `${selected.size} selected` : 'Select recipients'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button onClick={handleDone} variant="contained" disabled={!selected.size}>Done</Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
