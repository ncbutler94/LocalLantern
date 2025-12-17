// src/pages/messages/NewMessageDialog.jsx
// Turned into a site‑wide people picker with optional Followers/Following tabs.
// - Global "People" tab does API search so you can message anyone.
// - Shows recipient count; chips live in a compact, vertically scrollable area.
// - Avatar fallback matches Header (no forced default image).

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    List,
    ListItemAvatar,
    ListItemButton,
    ListItemText,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';

const api = process.env.REACT_APP_API_URL;

function nameOf(u) {
    const nm = `${u?.first_name || ''} ${u?.last_name || ''}`.trim();
    return nm || (u?.handle ? `@${u.handle}` : 'User');
}
function usernameOf(u) {
    return u?.handle || u?.username || '';
}
// Match Header avatar fallback: don't force an image
function avatarOf(u) {
    return u?.avatar_url || u?.profile_picture || undefined;
}
function idKey(u) {
    return String(u?.id ?? '');
}

export default function NewMessageDialog({ open, onClose, viewer, onDone }) {
    // 0 = People (global), 1 = Followers, 2 = Following
    const [tab, setTab] = useState(0);

    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const [people, setPeople] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);

    const [selected, setSelected] = useState([]); // array of user

    // Reset state when opened
    useEffect(() => {
        if (!open) return;
        setTab(0);
        setSearch('');
    }, [open]);

    // Load follower/following
    useEffect(() => {
        if (!open || !viewer) return;
        let alive = true;
        const who = viewer?.public_id || viewer?.id || viewer?.handle;
        (async () => {
            try {
                setLoading(true);
                const r = await axios.get(`${api}/users/social/${encodeURIComponent(who)}`, {
                    withCredentials: true,
                });
                if (!alive) return;
                setFollowers(r?.data?.followers || []);
                setFollowing(r?.data?.following || []);
            } catch {
                if (!alive) return;
                setFollowers([]);
                setFollowing([]);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [open, viewer]);

    // Global people search (site‑wide)
    useEffect(() => {
        if (!open || tab !== 0) return;
        const q = search.trim();
        // To avoid spamming the API, require 2+ characters
        if (q.length < 2) {
            setPeople([]);
            return;
        }
        let alive = true;
        setLoading(true);
        (async () => {
            try {
                // Adjust path to your search endpoint if needed
                const r = await axios.get(`${api}/users/search`, {
                    params: { q },
                    withCredentials: true,
                });
                if (!alive) return;
                const items = Array.isArray(r?.data?.users) ? r.data.users : r?.data || [];
                setPeople(items);
            } catch {
                if (!alive) return;
                setPeople([]);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [open, tab, search]);

    const pool = useMemo(() => {
        if (tab === 1) return followers;
        if (tab === 2) return following;
        return people; // tab 0
    }, [tab, people, followers, following]);

    const isSelected = (u) =>
        selected.findIndex((s) => String(s.id) === String(u.id)) >= 0;

    const toggleUser = (u) => {
        setSelected((prev) => {
            const idx = prev.findIndex((s) => String(s.id) === String(u.id));
            if (idx >= 0) {
                const copy = [...prev];
                copy.splice(idx, 1);
                return copy;
            }
            return [...prev, u];
        });
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return pool;
        return (pool || []).filter((u) => {
            const nm = nameOf(u).toLowerCase();
            const un = usernameOf(u).toLowerCase();
            return nm.includes(q) || un.includes(q);
        });
    }, [pool, search]);

    return (
        <Dialog
            open={open}
            onClose={(_, reason) => {
                if (reason === 'backdropClick') return; // project rule
                onClose?.();
            }}
            fullWidth
            maxWidth="sm"
            PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
        >
            <DialogTitle
                sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}
            >
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    New Message
                </Typography>
                <IconButton aria-label="Close" onClick={() => onClose?.()}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 520 }}>
                {/* Selected recipients (scrollable chip box) */}
                <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Recipients ({selected.length})
                    </Typography>
                    <Box
                        sx={{
                            p: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 1,
                            maxHeight: 120,
                            overflowY: 'auto',
                        }}
                    >
                        {selected.length === 0 && (
                            <Typography color="text.secondary">
                                Use “People” to search anyone, or pick from Followers/Following.
                            </Typography>
                        )}
                        {selected.map((u) => (
                            <Chip
                                key={idKey(u)}
                                avatar={<Avatar src={avatarOf(u)} />}
                                label={`${nameOf(u)} (@${usernameOf(u)})`}
                                onDelete={() => toggleUser(u)}
                            />
                        ))}
                    </Box>
                </Box>

                {/* Search box */}
                <Box sx={{ px: 2, pb: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1 }}>
                    <Tabs
                        value={tab}
                        onChange={(_, v) => setTab(v)}
                        variant="scrollable"
                        sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 0 } }}
                    >
                        <Tab label="People" />
                        <Tab label={`Followers (${followers.length})`} />
                        <Tab label={`Following (${following.length})`} />
                    </Tabs>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        fullWidth
                        size="small"
                        placeholder={tab === 0 ? 'Search everyone (min 2 characters)' : 'Filter list'}
                        InputProps={{
                            startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                        }}
                    />
                </Box>

                <Divider />

                {/* Scroll list */}
                <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
                    {loading ? (
                        <Typography sx={{ p: 2 }} color="text.secondary">
                            Loading…
                        </Typography>
                    ) : filtered.length === 0 ? (
                        <Typography sx={{ p: 2 }} color="text.secondary">
                            {tab === 0 && search.trim().length < 2
                                ? 'Type at least 2 characters to search everyone.'
                                : 'No matches.'}
                        </Typography>
                    ) : (
                        <List disablePadding>
                            {filtered.map((u) => {
                                const added = isSelected(u);
                                return (
                                    <ListItemButton key={idKey(u)} onClick={() => toggleUser(u)} sx={{ py: 1.25 }}>
                                        <ListItemAvatar>
                                            <Avatar src={avatarOf(u)} alt={nameOf(u)} />
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={
                                                <Typography sx={{ fontWeight: 600 }} noWrap>
                                                    {nameOf(u)}
                                                </Typography>
                                            }
                                            secondary={
                                                <Typography variant="body2" color="text.secondary" noWrap>
                                                    @{usernameOf(u)}
                                                </Typography>
                                            }
                                        />
                                        <Button variant={added ? 'outlined' : 'contained'} size="small">
                                            {added ? 'Added' : 'Add'}
                                        </Button>
                                    </ListItemButton>
                                );
                            })}
                        </List>
                    )}
                </Box>

                <Divider />
                <Box sx={{ p: 1.5, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <Button
                        variant="contained"
                        disabled={selected.length === 0}
                        onClick={() => onDone?.(selected)}
                    >
                        Done
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
