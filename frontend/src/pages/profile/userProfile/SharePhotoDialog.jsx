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
    InputAdornment,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FacebookIcon from '@mui/icons-material/Facebook';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';

import CityCountySelect from './CityCountySelect';

const tileWrap = {
    width: '100%',
    display: 'flex',
};

const tile = (selected) => ({
    p: 2,
    borderRadius: 2,
    border: selected ? '2px solid #1976d2' : '1px solid rgba(0,0,0,0.10)',
    background: selected ? 'rgba(25,118,210,0.06)' : '#fff',
    position: 'relative',
    height: 210,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 1,
    cursor: 'pointer',
    userSelect: 'none',
});

const squareAvatar = { width: 104, height: 104, borderRadius: 10, objectFit: 'cover' };

function safeStr(v) {
    if (v === null || v === undefined) return '';
    return String(v);
}

function buildPostText(post) {
    const title =
        safeStr(post?.title) ||
        safeStr(post?.post_title) ||
        safeStr(post?.headline) ||
        safeStr(post?.name) ||
        '';

    const body =
        safeStr(post?.text) ||
        safeStr(post?.body) ||
        safeStr(post?.content) ||
        safeStr(post?.description) ||
        safeStr(post?.caption) ||
        safeStr(post?.details) ||
        '';

    const city = safeStr(post?.city);
    const county = safeStr(post?.county);
    const loc = [city, county].filter(Boolean).join(', ');

    const bodyTrimmed = body.replace(/\s+/g, ' ').trim();
    const snippet = bodyTrimmed.length > 240 ? `${bodyTrimmed.slice(0, 240)}…` : bodyTrimmed;

    return {
        title: title.trim(),
        snippet,
        location: loc.trim(),
    };
}

function pickPostImage(post) {
    const direct =
        safeStr(post?.cover_photo) ||
        safeStr(post?.coverPhoto) ||
        safeStr(post?.image_url) ||
        safeStr(post?.imageUrl) ||
        safeStr(post?.photo_url) ||
        safeStr(post?.photoUrl) ||
        safeStr(post?.thumbnail_url) ||
        safeStr(post?.thumbnailUrl) ||
        '';

    if (direct) return direct;

    const arr =
        post?.photos ||
        post?.images ||
        post?.media ||
        post?.photo_urls ||
        post?.image_urls ||
        post?.photoUrls ||
        post?.imageUrls;

    if (Array.isArray(arr) && arr.length) {
        const first = arr[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object') {
            return safeStr(first.url || first.secure_url || first.image_url || first.photo_url || '');
        }
    }

    return '';
}

export default function SharePostDialog({ open, onClose, post, viewer, onShared }) {
    const api = process.env.REACT_APP_API_URL;

    const [tab, setTab] = useState('following');
    const [loading, setLoading] = useState(false);

    const [queryDraft, setQueryDraft] = useState('');
    const [countyDraft, setCountyDraft] = useState('');
    const [cityDraft, setCityDraft] = useState('');

    const [query, setQuery] = useState('');
    const [county, setCounty] = useState('');
    const [city, setCity] = useState('');

    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [counts, setCounts] = useState({ following: 0, followers: 0 });
    const [selected, setSelected] = useState(() => new Map());

    const [fbCaptionCopied, setFbCaptionCopied] = useState(false);

    const handleDialogClose = useCallback(
        (_event, reason) => {
            if (reason === 'backdropClick') return; // no close on outside click
            onClose();
        },
        [onClose]
    );

    useEffect(() => {
        if (!open || !viewer?.handle) return;

        let alive = true;
        setLoading(true);

        (async () => {
            try {
                const res = await axios.get(`${api}/users/social/${encodeURIComponent(viewer.handle)}`, {
                    withCredentials: true,
                });
                if (!alive) return;

                const nextFollowing = Array.isArray(res.data?.following) ? res.data.following : [];
                const nextFollowers = Array.isArray(res.data?.followers) ? res.data.followers : [];
                const nextCounts = res.data?.counts || {
                    following: nextFollowing.length,
                    followers: nextFollowers.length,
                };

                setFollowing(nextFollowing);
                setFollowers(nextFollowers);
                setCounts(nextCounts);
            } catch {
                if (alive) {
                    setFollowing([]);
                    setFollowers([]);
                    setCounts({ following: 0, followers: 0 });
                }
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [api, open, viewer?.handle]);

    useEffect(() => {
        if (!open) return;

        setSelected(new Map());
        setQueryDraft('');
        setCountyDraft('');
        setCityDraft('');
        setQuery('');
        setCounty('');
        setCity('');
        setTab('following');
        setFbCaptionCopied(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (tab !== 'following') return;

        const hasFollowing = (counts.following || 0) > 0;
        const hasFollowers = (counts.followers || 0) > 0;

        if (!hasFollowing && hasFollowers) setTab('followers');
    }, [counts.following, counts.followers, open, tab]);

    useEffect(() => {
        if (!fbCaptionCopied) return;
        const t = window.setTimeout(() => setFbCaptionCopied(false), 6000);
        return () => window.clearTimeout(t);
    }, [fbCaptionCopied]);

    const applyFilters = useCallback(() => {
        setQuery(queryDraft);
        setCounty(countyDraft);
        setCity(cityDraft);
    }, [cityDraft, countyDraft, queryDraft]);

    const clearFilters = useCallback(() => {
        setQueryDraft('');
        setCountyDraft('');
        setCityDraft('');
        setQuery('');
        setCounty('');
        setCity('');
    }, []);

    const toggle = useCallback((u) => {
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(u.id)) next.delete(u.id);
            else next.set(u.id, u);
            return next;
        });
    }, []);

    const baseList = useMemo(() => {
        const raw = tab === 'followers' ? followers : following;
        return raw.filter((u) => Number(u?.id) !== Number(viewer?.id));
    }, [followers, following, tab, viewer?.id]);

    const filteredList = useMemo(() => {
        const q = query.trim().toLowerCase();
        const cty = city.trim().toLowerCase();
        const cnty = county.trim().toLowerCase();

        return baseList.filter((u) => {
            const first = safeStr(u?.first_name).trim();
            const last = safeStr(u?.last_name).trim();
            const full = `${first} ${last}`.replace(/\s+/g, ' ').trim().toLowerCase();
            const handle = safeStr(u?.handle || u?.username).trim().toLowerCase();

            const userCity = safeStr(u?.city || u?.city_name).trim().toLowerCase();
            const userCounty = safeStr(u?.county || u?.county_name).trim().toLowerCase();

            const matchesQuery = !q || full.includes(q) || handle.includes(q);
            const matchesCity = !cty || userCity === cty;
            const matchesCounty = !cnty || userCounty === cnty;

            return matchesQuery && matchesCity && matchesCounty;
        });
    }, [baseList, city, county, query]);

    // ✅ UPDATED ROUTE: /posts/:id
    const deepLink = useMemo(() => {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://thelocallantern.com';
        const postId = post?.id ?? '';
        return `${origin}/posts/${encodeURIComponent(postId)}`;
    }, [post?.id]);

    const postPreview = useMemo(() => buildPostText(post), [post]);
    const postImage = useMemo(() => pickPostImage(post), [post]);

    const fbCaption = useMemo(() => {
        const parts = [];
        if (postPreview.title) parts.push(postPreview.title);
        if (postPreview.snippet) parts.push(postPreview.snippet);
        if (postPreview.location) parts.push(`Location: ${postPreview.location}`);
        parts.push(`View more on The Local Lantern: ${deepLink}`);
        return parts.join('\n\n').trim();
    }, [deepLink, postPreview.location, postPreview.snippet, postPreview.title]);

    const handleFacebook = useCallback(async () => {
        // For a real FB “link preview card”, FB scrapes OG tags from the URL.
        // We open sharer with URL only (FB ignores quote for many accounts).
        // We also copy a caption so user can paste it in the composer.
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(fbCaption);
                setFbCaptionCopied(true);
            }
        } catch {
            // ignore
        }

        const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(deepLink)}`;
        window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }, [deepLink, fbCaption]);

    const handleShareInternal = useCallback(() => {
        const ids = Array.from(selected.keys());
        if (onShared) onShared({ postId: post?.id, recipientIds: ids });
        onClose();
    }, [onClose, onShared, post?.id, selected]);

    const UserTile = useCallback(
        ({ u }) => {
            const sel = selected.has(u.id);
            const displayName = `${safeStr(u.first_name)} ${safeStr(u.last_name)}`.replace(/\s+/g, ' ').trim();
            const username = safeStr(u.handle || u.username).trim();

            return (
                <Box sx={tileWrap} onClick={() => toggle(u)}>
                    <Box sx={tile(sel)}>
                        <Avatar
                            src={u.profile_picture || u.avatar_url || ''}
                            alt={displayName || username || 'User'}
                            imgProps={{ style: squareAvatar }}
                            sx={squareAvatar}
                            variant="rounded"
                        />

                        <Typography
                            variant="body2"
                            sx={{
                                mt: 1,
                                fontWeight: 800,
                                textAlign: 'center',
                                lineHeight: 1.15,
                                px: 1,
                                width: '100%',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            {displayName || ' '}
                        </Typography>

                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                                textAlign: 'center',
                                px: 1,
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {username ? `@${username}` : ' '}
                        </Typography>

                        {sel && (
                            <CheckCircleIcon
                                fontSize="small"
                                sx={{ position: 'absolute', right: 10, top: 10, color: '#1976d2' }}
                            />
                        )}
                    </Box>
                </Box>
            );
        },
        [selected, toggle]
    );

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            fullWidth
            maxWidth="md"
            PaperProps={{
                sx: {
                    height: { xs: '94vh', sm: 780, md: 840 },
                    maxHeight: '94vh',
                    borderRadius: 3,
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Share Post
                </Typography>
                <IconButton onClick={onClose} size="small" aria-label="Close">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent
                dividers
                sx={{
                    p: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    minHeight: 0,
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        justifyContent: 'space-between',
                        px: 2,
                        pt: 1.25,
                        pb: 0.75,
                        gap: 1,
                        flexWrap: 'wrap',
                    }}
                >
                    <Tabs value={tab} onChange={(_e, v) => setTab(v)} textColor="primary" indicatorColor="primary">
                        <Tab value="following" label={`Following (${counts.following || 0})`} />
                        <Tab value="followers" label={`Followers (${counts.followers || 0})`} />
                    </Tabs>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {fbCaptionCopied && (
                            <Chip
                                size="small"
                                label="Caption copied — paste into Facebook"
                                onDelete={() => setFbCaptionCopied(false)}
                            />
                        )}
                        <Tooltip title="Share to Facebook">
                            <Button startIcon={<FacebookIcon />} variant="outlined" onClick={handleFacebook}>
                                Share to Facebook
                            </Button>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Local Lantern Post Preview */}
                <Box sx={{ px: 2, pb: 1 }}>
                    <Box
                        sx={{
                            border: '1px solid rgba(0,0,0,0.10)',
                            borderRadius: 2,
                            overflow: 'hidden',
                            background: '#fff',
                        }}
                    >
                        <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, alignItems: 'stretch' }}>
                            <Box
                                sx={{
                                    width: 110,
                                    minWidth: 110,
                                    height: 90,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                    background: 'rgba(0,0,0,0.06)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {postImage ? (
                                    <Box component="img" src={postImage} alt="Post preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <Typography variant="caption" color="text.secondary">
                                        Preview
                                    </Typography>
                                )}
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                                    {postPreview.title || 'Local Lantern Post'}
                                </Typography>

                                {postPreview.location ? (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                        {postPreview.location}
                                    </Typography>
                                ) : null}

                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        lineHeight: 1.25,
                                    }}
                                >
                                    {postPreview.snippet || ' '}
                                </Typography>

                                <Box sx={{ pt: 0.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => window.open(deepLink, '_blank', 'noopener,noreferrer')}
                                    >
                                        View Post Page
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="text"
                                        onClick={async () => {
                                            try {
                                                if (navigator?.clipboard?.writeText) {
                                                    await navigator.clipboard.writeText(fbCaption);
                                                    setFbCaptionCopied(true);
                                                }
                                            } catch {
                                                // ignore
                                            }
                                        }}
                                    >
                                        Copy Share Caption
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* Filters */}
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        background: '#fafafa',
                    }}
                >
                    <Grid container spacing={1} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <TextField
                                size="small"
                                fullWidth
                                placeholder="Name or @username"
                                value={queryDraft}
                                onChange={(e) => setQueryDraft(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <CityCountySelect
                                size="small"
                                county={countyDraft}
                                city={cityDraft}
                                onCountyChange={setCountyDraft}
                                onCityChange={setCityDraft}
                                setCounty={setCountyDraft}
                                setCity={setCityDraft}
                            />
                        </Grid>

                        <Grid
                            item
                            xs={12}
                            md={4}
                            sx={{
                                display: 'flex',
                                gap: 1,
                                justifyContent: { xs: 'flex-start', md: 'flex-end' },
                            }}
                        >
                            <Button onClick={applyFilters} variant="contained" startIcon={<SearchIcon />} disabled={loading}>
                                Search
                            </Button>
                            <Button onClick={clearFilters} variant="outlined" startIcon={<ClearIcon />} disabled={loading}>
                                Clear
                            </Button>
                        </Grid>
                    </Grid>
                </Box>

                {/* Selected recipients (scroll after ~3 lines) */}
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        display: 'flex',
                        gap: 1,
                        flexWrap: 'wrap',
                        maxHeight: 120,
                        overflowY: 'auto',
                    }}
                >
                    {Array.from(selected.values()).map((u) => (
                        <Chip
                            key={u.id}
                            avatar={<Avatar src={u.profile_picture || u.avatar_url || ''} />}
                            label={`${safeStr(u.first_name)} ${safeStr(u.last_name)} (@${safeStr(u.handle || u.username)})`}
                            onDelete={() =>
                                setSelected((prev) => {
                                    const next = new Map(prev);
                                    next.delete(u.id);
                                    return next;
                                })
                            }
                        />
                    ))}

                    {!selected.size && (
                        <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
                            Select recipients
                        </Typography>
                    )}
                </Box>

                {/* Main scroll region */}
                <Box
                    sx={{
                        px: 2,
                        pt: 1,
                        pb: 2,
                        flex: 1,
                        minHeight: 0,
                        overflow: 'auto',
                    }}
                >
                    <Grid container spacing={1.5} alignItems="stretch">
                        {filteredList.map((u) => (
                            <Grid key={u.id} item xs={6} sm={4} md={3} sx={{ display: 'flex' }}>
                                <Box sx={{ width: '100%', display: 'flex' }}>
                                    <UserTile u={u} />
                                </Box>
                            </Grid>
                        ))}

                        {!filteredList.length && (
                            <Grid item xs={12}>
                                <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                                    {loading
                                        ? 'Loading…'
                                        : tab === 'following'
                                            ? 'No following users to show.'
                                            : 'No followers to show.'}
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
                    <Button onClick={handleShareInternal} variant="contained" disabled={!selected.size}>
                        Share
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
