// src/pages/profile/userProfile/MessagesDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Dialog,
    DialogContent,
    Divider,
    Grid,
    IconButton,
    InputBase,
    List,
    ListItemButton,
    ListItemAvatar,
    ListItemText,
    Paper,
    Tab,
    Tabs,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import SearchIcon from '@mui/icons-material/Search';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

const api = process.env.REACT_APP_API_URL;

/* ---------- helpers ---------- */
const fmtDate = (iso) => {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
        return '';
    }
};
const fmtTime = (iso) => {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit', // no seconds
        });
    } catch {
        return '';
    }
};
const uniqBy = (arr, key) => {
    const seen = new Set();
    const out = [];
    arr.forEach((x) => {
        const k = key(x);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(x);
        }
    });
    return out;
};

/* ========================================================================
 * Recipient Picker Dialog (Public / Following / Followers)
 * ===================================================================== */
function RecipientPicker({ open, onClose, me, onDone }) {
    const [tab, setTab] = useState(0); // 0=Public,1=Following,2=Followers
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [rows, setRows] = useState([]);
    const [picked, setPicked] = useState([]);

    const togglePick = (u) => {
        setPicked((old) => {
            const exists = old.find((x) => x.id === u.id);
            if (exists) return old.filter((x) => x.id !== u.id);
            if (old.length >= 30) return old; // cap 30
            return [...old, u];
        });
    };
    const removePick = (id) => setPicked((old) => old.filter((x) => x.id !== id));

    // fetch lists per tab
    useEffect(() => {
        if (!open) return;
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            setBusy(true);
            try {
                if (tab === 0) {
                    // Public search
                    const r = await fetch(
                        `${api}/users/search?q=${encodeURIComponent(search || '')}`,
                        { credentials: 'include', signal: ctrl.signal }
                    );
                    const j = await r.json();
                    if (!alive) return;
                    const list = (Array.isArray(j?.users) ? j.users : []).filter((u) => u.id !== me?.id);
                    setRows(list);
                } else {
                    // Following / Followers of the current user
                    const who = me?.handle || me?.public_id || me?.id;
                    const r = await fetch(`${api}/users/social/${encodeURIComponent(who)}`, {
                        credentials: 'include',
                        signal: ctrl.signal,
                    });
                    const j = await r.json();
                    if (!alive) return;
                    const pool = tab === 1 ? (j.following || []) : (j.followers || []);
                    setRows(pool.filter((u) => u.id !== me?.id));
                }
            } catch {
                if (alive) setRows([]);
            } finally {
                if (alive) setBusy(false);
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [open, tab, search, me]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogContent sx={{ p: 0 }}>
                <Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <MailOutlineIcon color="primary" />
                        <Typography variant="h6">New Message</Typography>
                    </Box>
                    <IconButton onClick={onClose}><CloseIcon /></IconButton>
                </Box>
                <Divider />

                <Box sx={{ px: 2, pt: 1 }}>
                    {/* Selected recipients (chips) */}
                    <Box sx={{
                        display: 'flex', gap: 1, overflowX: 'auto', py: 1,
                        '&::-webkit-scrollbar': { height: 8 },
                    }}>
                        {picked.map((u) => (
                            <Chip
                                key={u.id}
                                avatar={<Avatar src={u.profile_picture || u.avatar_url} />}
                                label={`${u.first_name || ''} ${u.last_name || ''} @${u.handle || u.username || ''}`.trim()}
                                onDelete={() => removePick(u.id)}
                            />
                        ))}
                        {picked.length === 0 && (
                            <Typography variant="body2" color="text.secondary">Select up to 30 recipients.</Typography>
                        )}
                    </Box>
                </Box>

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
                    <Tab iconPosition="start" label="Public" />
                    <Tab label="Following" />
                    <Tab label="Followers" />
                </Tabs>

                <Box sx={{ px: 2, py: 1 }}>
                    {tab === 0 && (
                        <Paper variant="outlined" sx={{ p: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SearchIcon sx={{ ml: 1 }} />
                            <InputBase
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name or @username"
                                sx={{ flex: 1, py: 0.5 }}
                            />
                        </Paper>
                    )}
                </Box>

                <Box sx={{ px: 2, pb: 2, maxHeight: 420, overflowY: 'auto' }}>
                    {busy ? (
                        <Typography sx={{ p: 2 }} color="text.secondary">Loading…</Typography>
                    ) : rows.length === 0 ? (
                        <Typography sx={{ p: 2 }} color="text.secondary">No users found.</Typography>
                    ) : (
                        <Grid container spacing={2}>
                            {rows.map((u) => {
                                const pickedAlready = !!picked.find((x) => x.id === u.id);
                                return (
                                    <Grid key={u.id} item xs={12} sm={6} md={4} lg={3}>
                                        <Paper
                                            variant="outlined"
                                            onClick={() => togglePick(u)}
                                            sx={{
                                                cursor: 'pointer',
                                                p: 1,
                                                textAlign: 'center',
                                                borderColor: pickedAlready ? 'primary.main' : 'divider',
                                                bgcolor: pickedAlready ? 'action.selected' : 'background.paper',
                                                '&:hover': { boxShadow: 2 },
                                            }}
                                        >
                                            <Avatar
                                                src={u.profile_picture || u.avatar_url}
                                                sx={{ width: 96, height: 96, borderRadius: 2, mx: 'auto', mb: 1 }}
                                            />
                                            <Typography variant="subtitle2" noWrap>
                                                {(u.first_name || '') + ' ' + (u.last_name || '')}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" noWrap>
                                                @{u.handle || u.username}
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    )}
                </Box>

                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, p: 1.25 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            onDone(uniqBy(picked, (x) => x.id));
                            onClose();
                        }}
                        disabled={picked.length === 0}
                    >
                        Done
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
RecipientPicker.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    me: PropTypes.object,
    onDone: PropTypes.func.isRequired,
};

/* ========================================================================
 * Inline Composer (messages) – mirrors comment editor style
 * ===================================================================== */
function Composer({ avatar, onSend, disabled }) {
    const [txt, setTxt] = useState('');
    const [file, setFile] = useState(null);
    const iptRef = useRef(null);

    const wrap = (token) => {
        if (!iptRef.current) return;
        const el = iptRef.current;
        const s = el.selectionStart;
        const e = el.selectionEnd;
        const sel = txt.slice(s, e) || 'text';
        const next = txt.slice(0, s) + token + sel + token + txt.slice(e);
        setTxt(next);
        setTimeout(() => el.setSelectionRange(s + token.length, e + token.length), 0);
    };

    const choose = (e) => {
        const f = e.target.files?.[0];
        if (f) setFile(Object.assign(f, { preview: URL.createObjectURL(f) }));
    };

    const doSend = () => {
        const content = txt.trim();
        if (!content && !file) return;
        const fd = new FormData();
        fd.append('content', content);
        if (file) fd.append('image', file);
        onSend(fd, () => {
            setTxt('');
            setFile(null);
        });
    };

    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, borderTop: 1, borderColor: 'divider' }}>
            <Avatar src={avatar} sx={{ width: 32, height: 32 }} />
            <Paper variant="outlined" sx={{ p: 1, flex: '1 1 auto' }}>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                    <Tooltip title="Bold"><span><IconButton size="small" onClick={() => wrap('**')} disabled={disabled}><FormatBoldIcon /></IconButton></span></Tooltip>
                    <Tooltip title="Italic"><span><IconButton size="small" onClick={() => wrap('_')} disabled={disabled}><FormatItalicIcon /></IconButton></span></Tooltip>
                    <Tooltip title="Strikethrough"><span><IconButton size="small" onClick={() => wrap('~~')} disabled={disabled}><StrikethroughSIcon /></IconButton></span></Tooltip>
                    <Tooltip title="Quote"><span><IconButton size="small" onClick={() => wrap('\n> ')} disabled={disabled}><FormatQuoteIcon /></IconButton></span></Tooltip>
                    <Tooltip title="Attach image"><span><IconButton size="small" component="label" disabled={disabled}><ImageIcon /><input hidden type="file" accept="image/*" onChange={choose} /></IconButton></span></Tooltip>
                    <Box sx={{ ml: 'auto' }}>
                        <Tooltip title={disabled ? 'Select a conversation or pick recipients' : 'Send'}>
              <span>
                <IconButton color="primary" onClick={doSend} disabled={disabled || (!txt.trim() && !file)}><SendIcon /></IconButton>
              </span>
                        </Tooltip>
                    </Box>
                </Box>
                <InputBase
                    inputRef={iptRef}
                    value={txt}
                    onChange={(e) => setTxt(e.target.value.slice(0, 1000))}
                    placeholder="Write a message… (max 1000 characters)"
                    sx={{ width: '100%', fontSize: 15 }}
                    disabled={disabled}
                    multiline
                    minRows={2}
                    maxRows={6}
                />
                {file && (
                    <Box sx={{ mt: 1, position: 'relative', width: 160 }}>
                        <Box component="img" src={file.preview} alt="" sx={{ width: '100%', borderRadius: 1 }} />
                        <IconButton size="small" onClick={() => setFile(null)} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}
Composer.propTypes = {
    avatar: PropTypes.string,
    onSend: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

/* ========================================================================
 * Messages Center Dialog
 * ===================================================================== */
export default function MessagesCenter({ open, onClose, me, presetRecipients = [] }) {
    const [leftTitle] = useState('Messages'); // label kept only in left panel header
    const [pickerOpen, setPickerOpen] = useState(false);

    const [convos, setConvos] = useState([]);     // [{other:{}, last:{...}, date:...}]
    const [active, setActive] = useState(null);   // a user object the viewer is talking to
    const [thread, setThread] = useState([]);     // message array for active
    const [recips, setRecips] = useState([]);     // for new-message / group-send
    const [sendingTimes, setSendingTimes] = useState([]); // timestamps for spam limit
    const [cooldownUntil, setCooldownUntil] = useState(null);

    // Prefill recipients when opened from “Message” buttons
    useEffect(() => {
        if (!open) return;
        if (Array.isArray(presetRecipients) && presetRecipients.length) {
            setRecips(presetRecipients.slice(0, 30));
            setActive(null);
        }
    }, [open, presetRecipients]);

    // load conversation list
    useEffect(() => {
        if (!open || !me) return;
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            try {
                const r = await fetch(`${api}/users/messages/list`, { credentials: 'include', signal: ctrl.signal });
                const j = await r.json();
                if (!alive) return;
                setConvos(Array.isArray(j?.conversations) ? j.conversations : []);
            } catch {
                if (alive) setConvos([]);
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [open, me]);

    // load thread when active changes
    useEffect(() => {
        if (!open) return;
        if (!active) { setThread([]); return; }
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            try {
                const r = await fetch(`${api}/users/messages/thread/${active.id}`, { credentials: 'include', signal: ctrl.signal });
                const j = await r.json();
                if (!alive) return;
                setThread(Array.isArray(j?.messages) ? j.messages : []);
            } catch {
                if (alive) setThread([]);
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [open, active]);

    const composerDisabled = !active && recips.length === 0 || (cooldownUntil && Date.now() < cooldownUntil);

    // rate-limit: 20 messages / minute; if exceeded disable for 60s
    const recordSendOrCooldown = () => {
        const now = Date.now();
        const windowStart = now - 60 * 1000;
        const recent = sendingTimes.filter((t) => t >= windowStart);
        if (recent.length >= 20) {
            setCooldownUntil(now + 60 * 1000);
            return false;
        }
        setSendingTimes([...recent, now]);
        return true;
    };

    const doSend = async (form, clear) => {
        if (!recordSendOrCooldown()) return;

        // group-send (no “thread id” on backend), send 1:1 copies
        const recipients = active ? [active] : recips.slice(0, 30);
        if (!recipients.length) return;

        const sentTo = [];
        for (const u of recipients) {
            try {
                const r = await fetch(`${api}/users/message`, {
                    method: 'POST',
                    credentials: 'include',
                    body: (() => {
                        const fd = new FormData();
                        for (const [k, v] of form.entries()) fd.append(k, v);
                        fd.append('to_user_id', u.id);
                        return fd;
                    })(),
                });
                if (r.ok) sentTo.push(u.id);
            } catch { /* ignore each-failure */ }
        }

        if (sentTo.length > 0) {
            clear?.();

            // refresh left list quickly
            try {
                const r = await fetch(`${api}/users/messages/list`, { credentials: 'include' });
                const j = await r.json();
                setConvos(Array.isArray(j?.conversations) ? j.conversations : []);
            } catch { /* ignore */ }

            // If single-user or there is an active, refresh thread
            if (active && sentTo.includes(active.id)) {
                try {
                    const r = await fetch(`${api}/users/messages/thread/${active.id}`, { credentials: 'include' });
                    const j = await r.json();
                    setThread(Array.isArray(j?.messages) ? j.messages : []);
                } catch { /* ignore */ }
            }
        }
    };

    const pickNewRecipients = (list) => {
        setRecips(list);
        setActive(null); // composing a new group/1-1
    };

    const leftHeader = (
        <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontWeight: 700 }}>{leftTitle}</Typography>
            <Tooltip title="New Message">
                <IconButton size="small" onClick={() => setPickerOpen(true)}><AddIcon /></IconButton>
            </Tooltip>
        </Box>
    );

    return (
        <>
            <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
                <DialogContent sx={{ p: 0 }}>
                    {/* Close X (top-right) */}
                    <IconButton
                        aria-label="Close"
                        onClick={onClose}
                        sx={{ position: 'absolute', right: 6, top: 6, zIndex: 2, bgcolor: 'background.paper' }}
                    >
                        <CloseIcon />
                    </IconButton>

                    {/* Two-pane layout */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, minHeight: '70vh' }}>
                        {/* LEFT: conversation list */}
                        <Paper square variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
                            {leftHeader}
                            {convos.length === 0 ? (
                                <Typography sx={{ p: 2 }} color="text.secondary">No conversations yet.</Typography>
                            ) : (
                                <List disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
                                    {convos.map((c, idx) => {
                                        const other = c.other || {};
                                        const last = c.last || {};
                                        const selected = active?.id === other.id;
                                        return (
                                            <ListItemButton
                                                key={other.id || idx}
                                                selected={selected}
                                                onClick={() => { setActive(other); setRecips([]); }}
                                                sx={{
                                                    py: 1,
                                                    borderBottom: 1,
                                                    borderColor: 'divider',
                                                    ...(selected ? { bgcolor: 'primary.main', color: '#fff',
                                                        '& .MuiTypography-root': { color: '#fff' } } : {}),
                                                }}
                                            >
                                                <ListItemAvatar>
                                                    <Avatar src={other.profile_picture || other.avatar_url} />
                                                </ListItemAvatar>
                                                <ListItemText
                                                    primary={
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="subtitle2" noWrap>
                                                                {(other.first_name || '') + ' ' + (other.last_name || '')}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ ml: 'auto' }}>
                                                                {fmtDate(last.created_at)}
                                                            </Typography>
                                                        </Box>
                                                    }
                                                    secondary={
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                                                                {last && (last.content || '').replace(/\s+/g, ' ')}
                                                            </Typography>
                                                        </Box>
                                                    }
                                                />
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            )}
                        </Paper>

                        {/* RIGHT: header (recipients box) + thread + composer */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            {/* Recipients box (when composing new) */}
                            <Box sx={{
                                p: 1,
                                borderBottom: 1,
                                borderColor: 'divider',
                                minHeight: 56,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                overflowX: 'auto',
                            }}>
                                {active ? (
                                    <>
                                        <Avatar src={active.profile_picture || active.avatar_url} sx={{ width: 28, height: 28 }} />
                                        <Typography fontWeight={700}>
                                            {(active.first_name || '') + ' ' + (active.last_name || '')}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            @{active.handle || active.username}
                                        </Typography>
                                    </>
                                ) : recips.length > 0 ? (
                                    recips.map((u) => (
                                        <Chip
                                            key={u.id}
                                            avatar={<Avatar src={u.profile_picture || u.avatar_url} />}
                                            label={`${u.first_name || ''} ${u.last_name || ''} @${u.handle || u.username || ''}`.trim()}
                                            size="small"
                                            onDelete={() => setRecips((old) => old.filter((x) => x.id !== u.id))}
                                        />
                                    ))
                                ) : (
                                    <Typography variant="body2" color="text.secondary">Select a conversation or click + to start a new one.</Typography>
                                )}
                            </Box>

                            {/* Messages thread */}
                            <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 1, md: 2 }, bgcolor: 'background.default' }}>
                                {active && thread.length === 0 && (
                                    <Typography color="text.secondary" sx={{ p: 2 }}>No messages yet.</Typography>
                                )}
                                {active && thread.map((m, i) => {
                                    const mine = Number(m.from_user_id) === Number(me?.id);
                                    const sender = mine ? me : (active || {});
                                    const name = `${sender.first_name || ''} ${sender.last_name || ''}`.trim();
                                    const handle = `@${sender.handle || sender.username || ''}`;
                                    return (
                                        <Box key={m.id || i} sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', mb: 1.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, maxWidth: '80%' }}>
                                                {!mine && <Avatar src={sender.profile_picture || sender.avatar_url} sx={{ width: 24, height: 24 }} />}
                                                <Typography variant="subtitle2">{name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{handle}</Typography>
                                            </Box>
                                            <Paper
                                                elevation={0}
                                                sx={{
                                                    p: 1,
                                                    maxWidth: '80%',
                                                    bgcolor: mine ? 'primary.main' : 'grey.800',
                                                    color: '#fff',
                                                    borderRadius: 2,
                                                }}
                                            >
                                                {m.image && (
                                                    <Box component="img" src={m.image} alt="" sx={{ width: 220, borderRadius: 1, display: 'block', mb: 1 }} />
                                                )}
                                                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>
                                            </Paper>
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                                                {fmtDate(m.created_at)} {fmtTime(m.created_at)}
                                            </Typography>
                                        </Box>
                                    );
                                })}
                            </Box>

                            {/* Composer */}
                            <Tooltip
                                title={
                                    cooldownUntil && Date.now() < cooldownUntil
                                        ? 'To prevent spam, we limit the number of messages that can be sent quickly. Please try again in 1 minute.'
                                        : composerDisabled ? 'Select a conversation or pick recipients' : ''
                                }
                            >
                                <Box>
                                    <Composer
                                        avatar={me?.avatar_url || me?.profile_picture}
                                        onSend={doSend}
                                        disabled={composerDisabled}
                                    />
                                </Box>
                            </Tooltip>
                        </Box>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Recipient picker */}
            <RecipientPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                me={me}
                onDone={pickNewRecipients}
            />
        </>
    );
}

MessagesCenter.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    me: PropTypes.object,
    presetRecipients: PropTypes.array,
};
