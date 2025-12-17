// src/pages/admin/EventsReview.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Box, Paper, Stack, Typography, TextField, MenuItem, Button, Divider,
    Chip, Alert, LinearProgress, Checkbox, FormControlLabel, Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PublishIcon from '@mui/icons-material/Publish';
import FlagIcon from '@mui/icons-material/Flag';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const STATUSES = [
    { value: 'pending',   label: 'Pending'   },
    { value: 'flagged',   label: 'Flagged'   },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'published', label: 'Published' },
];

const SORTS = [
    { value: 'new',      label: 'Newest' },
    { value: 'upcoming', label: 'Upcoming' },
];

function formatDateTime(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function Row({ ev, selected, onToggle, onView, onPublish, onFlag, onCancel }) {
    return (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1.5}>
                <FormControlLabel
                    sx={{ m: 0 }}
                    control={<Checkbox checked={selected} onChange={() => onToggle(ev.id)} />}
                    label=""
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={700} noWrap title={ev.title}>
                            {ev.title}
                        </Typography>
                        {ev.category && <Chip size="small" label={ev.category} />}
                        <Chip size="small" color="default" variant="outlined" label={ev.status || '—'} />
                    </Stack>
                    <Stack direction={{ xs:'column', sm:'row' }} spacing={1} sx={{ color:'text.secondary', mt: 0.5 }}>
                        <Typography variant="body2">Starts: {formatDateTime(ev.start_datetime)}</Typography>
                        {ev.city || ev.county ? (
                            <Typography variant="body2">• {ev.venue_name ? `${ev.venue_name} — ` : ''}{ev.city}{ev.city && ev.county ? ', ' : ''}{ev.county}</Typography>
                        ) : null}
                        {typeof ev.interested_count === 'number' && (
                            <Typography variant="body2">• Interested: {ev.interested_count}</Typography>
                        )}
                        <Typography variant="body2">• ID: {ev.id}</Typography>
                    </Stack>
                </Box>

                <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => onView(ev.id)}>View</Button>
                    <Tooltip title="Mark as Published (visible to all)">
            <span>
              <Button size="small" variant="contained" startIcon={<PublishIcon />} onClick={() => onPublish(ev.id)}>
                Publish
              </Button>
            </span>
                    </Tooltip>
                    <Tooltip title="Flag for review / hide">
                        <Button size="small" color="warning" startIcon={<FlagIcon />} onClick={() => onFlag(ev.id)}>Flag</Button>
                    </Tooltip>
                    <Tooltip title="Cancel the event (show cancel banner)">
                        <Button size="small" color="error" startIcon={<CancelIcon />} onClick={() => onCancel(ev.id)}>Cancel</Button>
                    </Tooltip>
                </Stack>
            </Stack>
        </Paper>
    );
}

export default function EventsReview() {
    const navigate = useNavigate();

    // Filters & controls
    const [status, setStatus] = useState('pending');
    const [sort, setSort] = useState('new');
    const [q, setQ] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Data state
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');

    const selectedCount = selected.size;

    const load = useCallback(async () => {
        setError('');
        setOkMsg('');
        setLoading(true);
        try {
            // Admin view uses ?status=... which backend allows only for admins
            const params = {
                status,
                sort,           // 'new' or 'upcoming'
                q: q || undefined,
                limit: 250
            };
            const { data } = await axios.get(`${process.env.REACT_APP_API_URL}/api/events`, { params });
            setRows(data.items || []);
            setSelected(new Set());
        } catch (e) {
            console.error('Admin list failed', e);
            setError(e?.response?.data?.error || 'Could not load events (are you signed in as admin?)');
        } finally {
            setLoading(false);
        }
    }, [status, sort, q]);

    useEffect(() => { load(); }, [load]);

    // Optional: simple auto-refresh while reviewing
    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(load, 20_000);
        return () => clearInterval(id);
    }, [autoRefresh, load]);

    const toggleSelected = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const updateStatus = async (id, nextStatus) => {
        try {
            await axios.put(`${process.env.REACT_APP_API_URL}/api/events/${id}/status`, { status: nextStatus });
            setRows(prev => prev.map(r => r.id === id ? { ...r, status: nextStatus } : r));
            setOkMsg(`Updated #${id} → ${nextStatus}`);
            setTimeout(() => setOkMsg(''), 2500);
        } catch (e) {
            console.error('Status change failed', e);
            setError(e?.response?.data?.error || 'Could not update status (admin required)');
        }
    };

    const bulkUpdate = async (nextStatus) => {
        if (!selected.size) return;
        setLoading(true);
        setError('');
        setOkMsg('');
        try {
            const ids = Array.from(selected);
            await Promise.allSettled(ids.map(id =>
                axios.put(`${process.env.REACT_APP_API_URL}/api/events/${id}/status`, { status: nextStatus })
            ));
            setRows(prev => prev.map(r => (selected.has(r.id) ? { ...r, status: nextStatus } : r)));
            setSelected(new Set());
            setOkMsg(`Updated ${ids.length} event(s) → ${nextStatus}`);
            setTimeout(() => setOkMsg(''), 2500);
        } catch (e) {
            console.error('Bulk update failed', e);
            setError('Some updates failed. Please refresh and try again.');
        } finally {
            setLoading(false);
        }
    };

    const header = useMemo(() => {
        const s = STATUSES.find(s => s.value === status)?.label || status;
        const t = SORTS.find(s => s.value === sort)?.label || sort;
        return `${s} • ${t}`;
    }, [status, sort]);

    return (
        <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs:'stretch', md:'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, minWidth: 220 }}>
                        Events Review — {header}
                    </Typography>

                    <TextField
                        select size="small" label="Status" value={status} onChange={(e)=>setStatus(e.target.value)} sx={{ minWidth: 160 }}
                    >
                        {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>

                    <TextField
                        select size="small" label="Sort" value={sort} onChange={(e)=>setSort(e.target.value)} sx={{ minWidth: 160 }}
                        helperText="Newest = recently created; Upcoming = chronological"
                    >
                        {SORTS.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>

                    <TextField
                        size="small" label="Search" placeholder="title, venue, city…" value={q} onChange={(e)=>setQ(e.target.value)}
                        onKeyDown={(e)=>{ if (e.key==='Enter') load(); }} sx={{ minWidth: 260 }}
                    />

                    <FormControlLabel
                        control={<Checkbox checked={autoRefresh} onChange={(e)=>setAutoRefresh(e.target.checked)} />}
                        label="Auto-refresh"
                    />

                    <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
                        <Button startIcon={<SearchIcon />} variant="contained" onClick={load}>Filter</Button>
                        <Button startIcon={<RefreshIcon />} variant="outlined" onClick={load}>Refresh</Button>
                    </Stack>
                </Stack>

                <Divider sx={{ my: 1.5 }} />

                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <Chip label={`Selected: ${selectedCount}`} />
                    <Button startIcon={<PublishIcon />} disabled={!selectedCount} onClick={() => bulkUpdate('published')}>
                        Publish selected
                    </Button>
                    <Button startIcon={<FlagIcon />} color="warning" disabled={!selectedCount} onClick={() => bulkUpdate('flagged')}>
                        Flag selected
                    </Button>
                    <Button startIcon={<CancelIcon />} color="error" disabled={!selectedCount} onClick={() => bulkUpdate('cancelled')}>
                        Cancel selected
                    </Button>
                </Stack>
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {okMsg && <Alert severity="success" sx={{ mb: 2 }}>{okMsg}</Alert>}
            {loading && <LinearProgress sx={{ mb: 1 }} />}

            <Stack spacing={1.25}>
                {rows.map(ev => (
                    <Row
                        key={ev.id}
                        ev={ev}
                        selected={selected.has(ev.id)}
                        onToggle={toggleSelected}
                        onView={(id) => navigate(`/events/${id}`)}
                        onPublish={(id) => updateStatus(id, 'published')}
                        onFlag={(id) => updateStatus(id, 'flagged')}
                        onCancel={(id) => updateStatus(id, 'cancelled')}
                    />
                ))}
            </Stack>

            {!loading && rows.length === 0 && (
                <Paper variant="outlined" sx={{ p: 3, mt: 2, textAlign:'center', color:'text.secondary' }}>
                    No events found for these filters.
                    <Box sx={{ mt: 1 }}>
                        <Button size="small" onClick={() => { setQ(''); setStatus('pending'); setSort('new'); }}>Reset filters</Button>
                    </Box>
                </Paper>
            )}
        </Box>
    );
}
