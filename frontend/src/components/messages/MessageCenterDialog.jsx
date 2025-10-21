// src/components/messages/MessageCenterDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Dialog,
    DialogContent,
    IconButton,
    InputBase,
    Tooltip,
    Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

const api = process.env.REACT_APP_API_URL;
const RATE_LIMIT = { limit: 20, perMs: 60_000 }; // 20 messages / minute

function useLimiter() {
    const [blockedUntil, setBlockedUntil] = useState(0);
    const stamps = useRef([]);
    const canSend = Date.now() > blockedUntil && stamps.current.filter((t) => Date.now() - t < RATE_LIMIT.perMs).length < RATE_LIMIT.limit;
    const bump = () => {
        const now = Date.now();
        stamps.current = stamps.current.filter((t) => now - t < RATE_LIMIT.perMs).concat(now);
        if (stamps.current.length > RATE_LIMIT.limit) {
            setBlockedUntil(now + 60_000);
            stamps.current = [];
        }
    };
    return { canSend, bump, blocked: Date.now() < blockedUntil };
}

export default function MessageCenterDialog({ open, onClose, viewer }) {
    const [threads, setThreads] = useState([]);
    const [active, setActive] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const limiter = useLimiter();
    const endRef = useRef(null);

    const fetchThreads = async () => {
        try {
            const r = await fetch(`${api}/messages/threads`, { credentials: 'include' });
            const j = await r.json();
            setThreads(Array.isArray(j) ? j : []);
            if (!active && j.length) setActive(j[0]);
        } catch { /* ignore */ }
    };

    const fetchMessages = async (userId) => {
        try {
            const r = await fetch(`${api}/messages/with/${userId}`, { credentials: 'include' });
            const j = await r.json();
            setMessages(Array.isArray(j) ? j : []);
            setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        } catch { /* ignore */ }
    };

    useEffect(() => { if (open) fetchThreads(); }, [open]); // first open
    useEffect(() => { if (open && active) fetchMessages(active.user_id); }, [open, active]);

    const send = async () => {
        if (!text.trim() || !active) return;
        if (!limiter.canSend) return;
        const payload = { to_user_id: active.user_id, body: text.trim() };
        setMessages((m) => [...m, { id: `tmp-${Date.now()}`, from_me: true, body: payload.body, created_at: new Date().toISOString(), read: false }]);
        setText('');
        limiter.bump();
        try {
            await fetch(`${api}/messages/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'include' });
            fetchThreads(); // refresh previews/dates
        } catch { /* ignore */ }
    };

    const blockedTip = limiter.blocked
        ? 'To prevent spam, we limit the number of messages that can be sent quickly. Please try again in 1 minute.'
        : '';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogContent sx={{ p: 0, display: 'grid', gridTemplateColumns: '320px 1fr', height: '80vh' }}>
                {/* Left: threads list */}
                <Box sx={{ borderRight: 1, borderColor: 'divider', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
                    <Box sx={{ p: 1.25, fontWeight: 700 }}>Messages</Box>
                    <Box sx={{ overflowY: 'auto' }}>
                        {threads.map((t, i) => {
                            const selected = active && active.user_id === t.user_id;
                            const name = `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'User';
                            const handle = t.handle ? `@${t.handle}` : '';
                            const date = t.last_at ? new Date(t.last_at).toLocaleDateString() : '';
                            const snippet = (t.last_body || '').length > 36 ? `${t.last_body.slice(0, 36)}…` : (t.last_body || '');
                            return (
                                <Box
                                    key={t.user_id}
                                    onClick={() => setActive(t)}
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'auto 1fr auto',
                                        gap: 1,
                                        alignItems: 'center',
                                        p: 1,
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: selected ? 'primary.main' : i % 2 ? 'grey.50' : 'background.paper',
                                        color: selected ? '#fff' : 'inherit',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Avatar src={t.avatar_url} sx={{ width: 36, height: 36 }} />
                                    <Box sx={{ overflow: 'hidden' }}>
                                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{name}</Typography>
                                        <Typography variant="caption" noWrap sx={{ opacity: 0.8 }}>
                                            {handle} — {snippet}
                                        </Typography>
                                    </Box>
                                    <Typography variant="caption">{date}</Typography>
                                </Box>
                            );
                        })}
                        {threads.length === 0 && (
                            <Typography sx={{ p: 2 }} color="text.secondary">No conversations yet.</Typography>
                        )}
                    </Box>
                </Box>

                {/* Right: active conversation */}
                <Box sx={{ display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
                    {/* header */}
                    <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar src={active?.avatar_url} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                                {(active && `${active.first_name || ''} ${active.last_name || ''}`.trim()) || 'Messages'}
                            </Typography>
                            {active?.handle && (
                                <Typography variant="caption" color="text.secondary">@{active.handle}</Typography>
                            )}
                        </Box>
                    </Box>

                    {/* messages */}
                    <Box sx={{ overflowY: 'auto', p: 2, bgcolor: 'grey.50' }}>
                        {messages.map((m) => (
                            <Box key={m.id} sx={{ display: 'flex', justifyContent: m.from_me ? 'flex-end' : 'flex-start', mb: 1 }}>
                                {!m.from_me && <Avatar src={active?.avatar_url} sx={{ width: 24, height: 24, mr: 1 }} />}
                                <Box
                                    sx={{
                                        maxWidth: '68%',
                                        px: 1,
                                        py: 0.75,
                                        borderRadius: 1,
                                        bgcolor: m.from_me ? 'primary.main' : 'grey.700',
                                        color: '#fff',
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    <Typography variant="body2">{m.body}</Typography>
                                    {m.from_me && (
                                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                            {m.read ? 'Read' : 'Sent'}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        ))}
                        <div ref={endRef} />
                    </Box>

                    {/* composer */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderTop: 1, borderColor: 'divider' }}>
                        <Avatar src={viewer?.avatar_url} sx={{ width: 28, height: 28 }} />
                        <InputBase
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Write a message…"
                            sx={{ flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1, py: 0.75 }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                        />
                        <Tooltip title={limiter.blocked ? 'To prevent spam, we limit the number of messages that can be sent quickly. Please try again in 1 minute.' : 'Send'}>
              <span>
                <IconButton onClick={send} disabled={!limiter.canSend || !text.trim()}>
                  <SendIcon />
                </IconButton>
              </span>
                        </Tooltip>
                    </Box>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
