// src/components/SidePanel/Jobs/JobDetailModal.jsx
import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Chip, Button, IconButton, Tooltip, TextField, Stack
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WorkIcon from '@mui/icons-material/Work';
import PublicIcon from '@mui/icons-material/Public';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';

function fmtPay(min, max, unit) {
    const has = (v) => v != null && v !== '' && !Number.isNaN(Number(v));
    if (!has(min) && !has(max)) return '';
    const a = has(min) ? Number(min) : null;
    const b = has(max) ? Number(max) : null;
    const core = (a && b) ? `$${a.toLocaleString()} - $${b.toLocaleString()}` : (b ? `$${b.toLocaleString()}` : `$${a.toLocaleString()}`);
    return `${core}${unit ? ` / ${unit}` : ''}`;
}

export default function JobDetailModal({ open, onClose, jobId: initialId, job: initialJob, viewer }) {
    const [job, setJob] = useState(initialJob || null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    const id = initialId || job?.id;

    useEffect(() => { setJob(initialJob || null); }, [initialJob]);

    useEffect(() => {
        if (!open || !id) return;
        let alive = true;
        (async () => {
            try {
                const r = await fetch(`/api/jobs/${id}`, { credentials: 'include' });
                const j = await r.json();
                if (alive) setJob(j);
            } catch { /* ignore */ }
        })();
        return () => { alive = false; };
    }, [open, id]);

    const [saved, setSaved] = useState(Boolean(job?.viewerSaved));
    const [saves, setSaves] = useState(Number(job?.savesCount || 0));
    useEffect(() => { setSaved(Boolean(job?.viewerSaved)); setSaves(Number(job?.savesCount || 0)); }, [job]);

    const toggleSave = async () => {
        try {
            setSaved(s => !s);
            setSaves(c => c + (saved ? -1 : 1));
            const r = await fetch(`/api/jobs/${id}/save`, { method: 'POST', credentials: 'include' });
            const j = await r.json();
            setSaved(Boolean(j?.saved));
            setSaves(Number(j?.savesCount || 0));
        } catch { /* ignore */ }
    };

    const isOwner = viewer && job && (viewer.id === job.user_id);
    const isAdmin = viewer && (viewer.is_admin || viewer.role === 'admin' || viewer.admin);
    const canManage = isOwner || isAdmin;

    const [expiresAt, setExpiresAt] = useState('');
    useEffect(() => { setExpiresAt(job?.expires_at ? String(job.expires_at).slice(0, 10) : ''); }, [job]);

    const closeJob = async () => {
        setBusy(true); setErr('');
        try {
            const r = await fetch(`/api/jobs/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ status: 'closed' })
            });
            const j = await r.json();
            setJob(j);
        } catch (e) { setErr('Failed to close job'); }
        finally { setBusy(false); }
    };
    const reopenJob = async () => {
        setBusy(true); setErr('');
        try {
            const r = await fetch(`/api/jobs/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ status: 'active' })
            });
            const j = await r.json();
            setJob(j);
        } catch (e) { setErr('Failed to reopen job'); }
        finally { setBusy(false); }
    };
    const saveExpire = async () => {
        setBusy(true); setErr('');
        try {
            const r = await fetch(`/api/jobs/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ expires_at: expiresAt || null })
            });
            const j = await r.json();
            setJob(j);
        } catch (e) { setErr('Failed to update expiration'); }
        finally { setBusy(false); }
    };

    const pay = fmtPay(job?.salary_min, job?.salary_max, job?.pay_unit);
    const countyLabel = job?.county ? (String(job.county).toLowerCase().includes('county') ? job.county : `${job.county} County`) : '';
    const loc = [job?.street_address, job?.city, countyLabel].filter(Boolean).join(', ');
    const posted = job?.posted_at ? new Date(job.posted_at).toLocaleDateString() : '';

    if (!open || !job) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ pr: 6 }}>
                {job.title || 'Job'}
                <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                    <Chip icon={<WorkIcon />} label={job.employment_type || 'Job'} />
                    {job.remote ? <Chip icon={<PublicIcon />} label="Remote" color="info" /> : null}
                    {job.status === 'closed' ? <Chip label="Closed" /> : null}
                </Stack>

                {job.employer && <Typography variant="subtitle1" sx={{ mb: 1 }}>{job.employer}</Typography>}
                {pay && <Typography variant="body1" sx={{ mb: 1 }}>{pay}</Typography>}
                {loc && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{loc}</Typography>}
                <Typography variant="caption" color="text.secondary">Posted {posted}</Typography>

                {job.description && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Description</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{job.description}</Typography>
                    </Box>
                )}

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                    <Button variant="contained" disabled={!job.apply_url} onClick={() => job.apply_url && window.open(job.apply_url, '_blank')}>Apply</Button>
                    <Tooltip title={saved ? 'Unsave' : 'Save job'}>
                        <IconButton onClick={toggleSave} color={saved ? 'primary' : 'default'}>
                            {saved ? <BookmarkIcon /> : <BookmarkBorderIcon />}
                        </IconButton>
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary">{saves}</Typography>
                </Stack>

                {canManage && (
                    <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Manage job</Typography>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                            {job.status === 'active'
                                ? <Button onClick={closeJob} variant="outlined" color="error" disabled={busy}>Close job</Button>
                                : <Button onClick={reopenJob} variant="contained" color="success" disabled={busy}>Reopen job</Button>
                            }

                            <TextField
                                label="Expires at"
                                type="date"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                size="small"
                            />
                            <Button onClick={saveExpire} variant="outlined" disabled={busy}>Save expiration</Button>
                        </Stack>

                        {err && <Typography color="error" sx={{ mt: 1 }}>{err}</Typography>}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
