// src/pages/messages/MessagesPage.jsx
// Fixed-position layout so the page itself never scrolls; only the internal panes do.
// Adds: optimistic first send (no more "send twice"), socket.io real-time updates,
// timestamp without seconds, and header-consistent avatar fallback (no forced image).

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
    AppBar,
    Avatar,
    Box,
    Button,
    Divider,
    Drawer,
    IconButton,
    InputAdornment,
    List,
    ListItemAvatar,
    ListItemButton,
    ListItemText,
    Paper,
    TextField,
    Toolbar,
    Tooltip,
    Typography,
    useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import NewMessageDialog from './NewMessageDialog';

const api = process.env.REACT_APP_API_URL;
const socketURL = process.env.REACT_APP_SOCKET_URL || api;

// ---------- Helpers ----------
function nameOf(u) {
    const name = `${u?.first_name || ''} ${u?.last_name || ''}`.trim();
    return name || (u?.handle ? `@${u.handle}` : 'User');
}
function usernameOf(u) {
    return u?.handle || u?.username || '';
}
// ⬇️ Match Header.jsx behavior: no custom default image; let MUI Avatar render initials
// (Header reads avatar from `avatar_url`/`profile_picture` and passes `undefined` when absent.) :contentReference[oaicite:2]{index=2}
function avatarOf(u) {
    return u?.avatar_url || u?.profile_picture || undefined;
}
function keyId(id) {
    return String(id ?? '');
}
function isDraftId(id) {
    return String(id).startsWith('draft-');
}
function combineNames(participants = [], viewerId) {
    const others = participants.filter((p) => String(p?.id) !== String(viewerId));
    if (others.length === 0) return 'Me';
    if (others.length === 1) return nameOf(others[0]);
    const firstTwo = others
        .slice(0, 2)
        .map(nameOf)
        .join(', ');
    return `${firstTwo}${others.length > 2 ? ` +${others.length - 2}` : ''}`;
}
function lastPreview(msg) {
    if (!msg) return '';
    const t = msg.text || '';
    return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}
// New: timestamp without seconds
function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default function MessagesPage() {
    const theme = useTheme();
    const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
    const navigate = useNavigate();
    const location = useLocation();

    const [viewer, setViewer] = useState(location.state?.viewer || null);

    const [loadingConvos, setLoadingConvos] = useState(false);
    const [conversations, setConversations] = useState([]); // normalized items
    const [selectedId, setSelectedId] = useState(null);

    const [messagesMap, setMessagesMap] = useState({}); // { [convoId]: [message] }
    const [loadingMessages, setLoadingMessages] = useState(false);

    const [query, setQuery] = useState('');
    const [newOpen, setNewOpen] = useState(false);

    const [mobileListOpen, setMobileListOpen] = useState(false);

    const bottomRef = useRef(null);
    const socketRef = useRef(null);

    // ============ Prevent document scroll while on this page ============
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    // ============ Measure real header height ============
    const [headerH, setHeaderH] = useState(0);

    const measureHeader = useCallback(() => {
        const appBar = document.querySelector('header.MuiAppBar-root');
        const anyHeader = appBar || document.querySelector('header');
        const h = anyHeader ? Math.ceil(anyHeader.getBoundingClientRect().height) : 96;
        setHeaderH(h);
    }, []);

    useLayoutEffect(() => {
        measureHeader();
        const t = setTimeout(measureHeader, 100);
        window.addEventListener('resize', measureHeader);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', measureHeader);
        };
    }, [measureHeader]);

    // --------- bootstrap viewer if needed ----------
    useEffect(() => {
        let alive = true;
        if (viewer) return;
        (async () => {
            try {
                const r = await axios.get(`${api}/auth/me`, { withCredentials: true });
                if (!alive) return;
                setViewer(r?.data || null);
            } catch {
                navigate('/login');
            }
        })();
        return () => {
            alive = false;
        };
    }, [viewer, navigate]);

    // --------- load conversations ----------
    const normalizeConversation = (item) => ({
        id: item.id,
        participants: item.participants || [],
        lastMessage: item.lastMessage || null,
        updatedAt: item.updatedAt || item.lastMessage?.createdAt || item.createdAt,
        isDraft: false,
        draftRecipients: [],
        draftText: '',
    });

    const loadConversations = useCallback(async () => {
        if (!viewer) return;
        setLoadingConvos(true);
        try {
            const r = await axios.get(`${api}/messages/conversations`, {
                withCredentials: true,
            });
            const list = Array.isArray(r?.data) ? r.data : r?.data?.items || [];
            const normalized = list.map(normalizeConversation);
            setConversations((prev) => {
                // Keep any drafts at the top; merge/replace real conversations
                const drafts = prev.filter((c) => c.isDraft);
                return [...drafts, ...normalized];
            });
            if (!selectedId && normalized.length > 0) {
                setSelectedId(normalized[0].id);
            }
        } catch {
            // keep previous on failure
        } finally {
            setLoadingConvos(false);
        }
    }, [viewer, selectedId]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    // --------- load messages for selected ----------
    const loadMessages = useCallback(async (cid) => {
        if (!cid || isDraftId(cid)) return;
        setLoadingMessages(true);
        try {
            const r = await axios.get(
                `${api}/messages/conversations/${encodeURIComponent(cid)}`,
                { withCredentials: true }
            );
            const arr = Array.isArray(r?.data?.messages)
                ? r.data.messages
                : Array.isArray(r?.data)
                    ? r.data
                    : [];
            const msgs = arr.map((m) => ({
                id: m.id,
                text: m.text || '',
                createdAt: m.createdAt || m.created_at || new Date().toISOString(),
                sender: m.sender || m.user || null,
            }));
            setMessagesMap((prev) => ({ ...prev, [cid]: msgs }));
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
        } catch {
            setMessagesMap((prev) => ({ ...prev, [cid]: [] }));
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    useEffect(() => {
        if (selectedId) loadMessages(selectedId);
    }, [selectedId, loadMessages]);

    // --------- real-time: socket + polling fallback ----------
    useEffect(() => {
        if (!viewer || !socketURL) return;

        const socket = io(socketURL, {
            withCredentials: true,
            transports: ['websocket'],
            path: '/socket.io', // default; change if your server uses a custom path
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            // Join a personal channel so backend can push messages to you
            socket.emit('user:join', { userId: viewer.id });
            if (selectedId && !isDraftId(selectedId)) {
                socket.emit('conversation:join', { conversationId: selectedId });
            }
        });

        // Someone (maybe you) posted a message
        socket.on('message:created', ({ conversationId, message }) => {
            if (!conversationId || !message) return;

            setMessagesMap((prev) => {
                const arr = prev[conversationId] ? [...prev[conversationId]] : [];
                if (!arr.find((m) => String(m.id) === String(message.id))) {
                    arr.push({
                        id: message.id,
                        text: message.text || '',
                        createdAt: message.createdAt || new Date().toISOString(),
                        sender: message.sender || null,
                    });
                }
                return { ...prev, [conversationId]: arr };
            });

            setConversations((prev) => {
                // Update last preview + bump to top
                const found = prev.find((c) => String(c.id) === String(conversationId));
                const updated = {
                    ...(found || { id: conversationId, participants: message.participants || [] }),
                    lastMessage: { text: message.text || '' },
                    updatedAt: message.createdAt || new Date().toISOString(),
                    isDraft: false,
                };
                const rest = prev.filter((c) => String(c.id) !== String(conversationId));
                return [updated, ...rest];
            });

            if (String(conversationId) === String(selectedId)) {
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 20);
            }
        });

        // You were added to a brand new conversation
        socket.on('conversation:created', (convo) => {
            if (!convo?.id) return;
            const normalized = normalizeConversation(convo);
            setConversations((prev) => {
                if (prev.some((c) => String(c.id) === String(normalized.id))) return prev;
                return [normalized, ...prev];
            });
        });

        return () => {
            socket.disconnect();
        };
    }, [viewer, selectedId]);

    // Re-join the selected conversation room whenever selection changes
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        if (selectedId && !isDraftId(selectedId)) {
            socket.emit('conversation:join', { conversationId: selectedId });
        }
    }, [selectedId]);

    // Polling fallback (runs even with sockets; cheap + robust)
    useEffect(() => {
        const id = setInterval(() => {
            loadConversations();
            if (selectedId && !isDraftId(selectedId)) loadMessages(selectedId);
        }, 10000);
        return () => clearInterval(id);
    }, [loadConversations, loadMessages, selectedId]);

    // --------- derived lists ----------
    const filteredConversations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter((c) => {
            const name = combineNames(c.participants, viewer?.id).toLowerCase();
            const lp = (c?.lastMessage?.text || '').toLowerCase();
            return name.includes(q) || lp.includes(q);
        });
    }, [query, conversations, viewer?.id]);

    const selectedConversation = useMemo(
        () => conversations.find((c) => String(c.id) === String(selectedId)) || null,
        [conversations, selectedId]
    );

    // --------- create a draft from picker ----------
    const handleCreateDraft = (people) => {
        if (!people || people.length === 0) return;
        const draftId = `draft-${Date.now()}`;
        const draft = {
            id: draftId,
            participants: [...(people || []), viewer].filter(Boolean),
            lastMessage: null,
            updatedAt: new Date().toISOString(),
            isDraft: true,
            draftRecipients: people,
            draftText: '',
        };
        setConversations((prev) => [draft, ...prev]);
        // Initialize message bucket for the draft so optimistic send renders immediately
        setMessagesMap((prev) => ({ ...prev, [draftId]: [] }));
        setSelectedId(draftId);
        setMobileListOpen(false);
    };

    // --------- delete/leave conversation ----------
    const handleDeleteConversation = async (cid) => {
        if (!cid) return;
        if (isDraftId(cid)) {
            setConversations((prev) => prev.filter((c) => String(c.id) !== String(cid)));
            setMessagesMap((prev) => {
                const { [cid]: _drop, ...rest } = prev;
                return rest;
            });
            if (String(selectedId) === String(cid)) setSelectedId(null);
            return;
        }
        try {
            await axios.delete(
                `${api}/messages/conversations/${encodeURIComponent(cid)}`,
                { withCredentials: true }
            );
        } catch {
            // ignore
        } finally {
            setConversations((prev) => prev.filter((c) => String(c.id) !== String(cid)));
            setMessagesMap((prev) => {
                const { [cid]: _drop, ...rest } = prev;
                return rest;
            });
            if (String(selectedId) === String(cid)) setSelectedId(null);
        }
    };

    // --------- send message (optimistic) ----------
    const [inputValue, setInputValue] = useState('');

    const sendMessage = async () => {
        const text = inputValue.trim();
        if (!text || !viewer || !selectedConversation) return;

        // Common: insert a local "pending" message immediately so the UI never lags.
        const localPendingId = `pending-${Date.now()}`;
        const nowISO = new Date().toISOString();

        let cid = selectedConversation.id; // may be a draft
        setMessagesMap((prev) => {
            const arr = prev[cid] ? [...prev[cid]] : [];
            arr.push({
                id: localPendingId,
                text,
                createdAt: nowISO,
                sender: viewer,
                _pending: true,
            });
            return { ...prev, [cid]: arr };
        });
        setConversations((prev) =>
            prev.map((c) =>
                String(c.id) === String(cid)
                    ? { ...c, lastMessage: { text }, updatedAt: nowISO }
                    : c
            )
        );
        setInputValue('');
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);

        // If this is a draft, create the real conversation first.
        if (selectedConversation.isDraft) {
            try {
                const r = await axios.post(
                    `${api}/messages/conversations`,
                    { recipient_ids: (selectedConversation.draftRecipients || []).map((p) => p.id) },
                    { withCredentials: true }
                );
                const realId = r?.data?.id || `temp-${Date.now()}`;
                // Promote draft -> real
                setConversations((prev) =>
                    prev.map((c) =>
                        String(c.id) === String(selectedConversation.id)
                            ? {
                                ...c,
                                id: realId,
                                isDraft: false,
                                draftRecipients: [],
                                updatedAt: new Date().toISOString(),
                            }
                            : c
                    )
                );
                setMessagesMap((prev) => {
                    const oldArr = prev[cid] || [];
                    const { [cid]: _drop, ...rest } = prev;
                    return { ...rest, [realId]: oldArr };
                });
                cid = realId; // continue using real id
                setSelectedId(realId);
                // Join the real-time room for the new conversation
                const socket = socketRef.current;
                if (socket?.connected) {
                    socket.emit('conversation:join', { conversationId: realId });
                }
            } catch {
                // Even if creation fails, keep the optimistic message under the draft id.
            }
        }

        // Now send the message to the real (or newly-created) conversation
        try {
            const r = await axios.post(
                `${api}/messages/conversations/${encodeURIComponent(cid)}/messages`,
                { text },
                { withCredentials: true }
            );
            const saved = r?.data || {
                id: `local-${Date.now()}`,
                text,
                sender: viewer,
                createdAt: nowISO,
            };
            // Replace the pending placeholder with the saved message
            setMessagesMap((prev) => {
                const arr = prev[cid] ? [...prev[cid]] : [];
                const idx = arr.findIndex((m) => m.id === localPendingId);
                const normalized = {
                    id: saved.id,
                    text: saved.text || text,
                    sender: saved.sender || viewer,
                    createdAt: saved.createdAt || nowISO,
                };
                if (idx >= 0) arr[idx] = normalized;
                else arr.push(normalized);
                return { ...prev, [cid]: arr };
            });
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);
        } catch {
            // Leave the pending message as-is; polling/refresh or socket will reconcile later.
        }
    };

    // --------- UI chunks ----------
    const ListHeader = (
        <Box sx={{ p: 1.25, display: 'flex', gap: 1 }}>
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
                New Message
            </Button>
        </Box>
    );

    const SearchBox = (
        <Box sx={{ px: 1.25, pb: 1 }}>
            <TextField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                size="small"
                fullWidth
                placeholder="Search conversations"
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                        </InputAdornment>
                    ),
                }}
            />
        </Box>
    );

    const ConversationList = (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minWidth: { md: 320, xs: '100%' },
            }}
        >
            <Box sx={{ px: 1.25, py: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Messages
                </Typography>
            </Box>
            {ListHeader}
            {SearchBox}
            <Divider />
            <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
                <List disablePadding>
                    {loadingConvos && (
                        <Typography sx={{ p: 2 }} color="text.secondary">
                            Loading…
                        </Typography>
                    )}
                    {!loadingConvos && filteredConversations.length === 0 && (
                        <Typography sx={{ p: 2 }} color="text.secondary">
                            No conversations yet.
                        </Typography>
                    )}
                    {filteredConversations.map((c) => {
                        const isSelected = String(c.id) === String(selectedId);
                        const title = combineNames(c.participants, viewer?.id);
                        const preview = c.isDraft ? 'Draft' : lastPreview(c.lastMessage);

                        const others = (c.participants || []).filter(
                            (p) => String(p?.id) !== String(viewer?.id)
                        );
                        const avatarUser = others[0] || viewer || {};
                        return (
                            <ListItemButton
                                key={c.id}
                                selected={isSelected}
                                onClick={() => {
                                    setSelectedId(c.id);
                                    if (!isMdUp) setMobileListOpen(false);
                                }}
                                sx={{ alignItems: 'flex-start', gap: 1, py: 1.25, pr: 6, position: 'relative' }}
                            >
                                <ListItemAvatar>
                                    <Avatar
                                        src={avatarOf(avatarUser)}
                                        variant="circular"
                                        alt={nameOf(avatarUser)}
                                        sx={{ width: 40, height: 40 }}
                                    />
                                </ListItemAvatar>
                                <ListItemText
                                    primary={
                                        <Typography noWrap sx={{ fontWeight: 600 }}>
                                            {title}
                                            {c.isDraft ? ' (Draft)' : ''}
                                        </Typography>
                                    }
                                    secondary={
                                        <Typography variant="body2" color="text.secondary" noWrap>
                                            {preview}
                                        </Typography>
                                    }
                                />
                                <Tooltip title="Remove">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteConversation(c.id);
                                        }}
                                        sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </ListItemButton>
                        );
                    })}
                </List>
            </Box>
        </Box>
    );

    const ChatHeader = ({ convo }) => {
        if (!convo) return null;
        const title = combineNames(convo.participants || [], viewer?.id);
        return (
            <Box
                sx={{
                    px: 2,
                    py: 1,
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                }}
            >
                {!isMdUp && (
                    <IconButton size="small" onClick={() => setMobileListOpen(true)}>
                        <ArrowBackIcon />
                    </IconButton>
                )}
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {title}
                </Typography>
            </Box>
        );
    };

    const MessageItem = ({ m }) => {
        const mine = String(m?.sender?.id) === String(viewer?.id);
        return (
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: mine ? '1fr auto' : 'auto 1fr',
                    gap: 1,
                    alignItems: 'start',
                    my: 1,
                }}
            >
                {!mine && (
                    <Avatar src={avatarOf(m?.sender)} alt={nameOf(m?.sender)} sx={{ width: 36, height: 36 }} />
                )}
                <Box sx={{ maxWidth: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {nameOf(m?.sender)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            @{usernameOf(m?.sender)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            · {formatTimestamp(m?.createdAt)}
                        </Typography>
                    </Box>
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 1,
                            mt: 0.5,
                            borderRadius: 2,
                            bgcolor: mine ? 'action.selected' : 'background.paper',
                        }}
                    >
                        <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m?.text || ''}
                        </Typography>
                    </Paper>
                </Box>
                {mine && (
                    <Avatar
                        src={avatarOf(viewer)}
                        alt={nameOf(viewer)}
                        sx={{ width: 36, height: 36, justifySelf: 'end' }}
                    />
                )}
            </Box>
        );
    };

    const ChatPane = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: !isMdUp ? 56 : 0 }}>
            {selectedConversation ? (
                <ChatHeader convo={selectedConversation} />
            ) : (
                <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Messages
                    </Typography>
                </Box>
            )}

            {/* Scrollable messages */}
            <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', p: 2 }}>
                {loadingMessages && (
                    <Typography color="text.secondary">Loading messages…</Typography>
                )}
                {!selectedConversation && (
                    <Typography color="text.secondary">Select a conversation or start a new one.</Typography>
                )}
                {selectedConversation &&
                    (messagesMap[selectedConversation.id] || []).map((m) => <MessageItem key={m.id} m={m} />)}
                <div ref={bottomRef} />
            </Box>

            {/* Composer */}
            <Divider />
            <Box
                sx={{
                    p: 1.25,
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 1,
                    alignItems: 'center',
                }}
            >
                <Avatar src={avatarOf(viewer)} alt={nameOf(viewer)} sx={{ width: 36, height: 36 }} />
                <TextField
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={selectedConversation ? 'Write a message…' : 'Select a conversation to write…'}
                    multiline
                    fullWidth
                    minRows={1}
                    maxRows={4}
                    inputProps={{
                        style: { height: 72, overflowY: 'auto' }, // fixed height, scrollable, no resizing
                    }}
                    sx={{
                        '& .MuiInputBase-root': { alignItems: 'start' },
                        textarea: { resize: 'none' },
                    }}
                    disabled={!selectedConversation}
                />
                <Tooltip title="Send">
          <span>
            <IconButton
                color="primary"
                onClick={sendMessage}
                disabled={!selectedConversation || inputValue.trim().length === 0}
            >
              <SendIcon />
            </IconButton>
          </span>
                </Tooltip>
            </Box>
        </Box>
    );

    return (
        <>
            {/* ROOT: fixed to viewport so the document never scrolls */}
            <Box
                sx={{
                    position: 'fixed',
                    top: `${headerH}px`,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: theme.zIndex.appBar - 1,
                    bgcolor: 'background.default',
                    p: { xs: 1, md: 2 },
                }}
            >
                <Paper
                    variant="outlined"
                    sx={{
                        height: '100%',
                        borderRadius: 2,
                        overflow: 'hidden',
                        display: 'grid',
                        gridTemplateColumns: { md: '320px 1fr', xs: '1fr' },
                    }}
                >
                    {/* Left list (desktop) */}
                    <Box sx={{ display: { xs: 'none', md: 'block' }, height: '100%', overflow: 'hidden' }}>
                        <Paper
                            variant="outlined"
                            sx={{
                                height: '100%',
                                borderRadius: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                        >
                            {ConversationList}
                        </Paper>
                    </Box>

                    {/* Right pane */}
                    <Box sx={{ height: '100%', overflow: 'hidden' }}>{ChatPane}</Box>
                </Paper>
            </Box>

            {/* Mobile list drawer */}
            <Drawer
                open={mobileListOpen}
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return;
                    setMobileListOpen(false);
                }}
                PaperProps={{ sx: { width: '100%', maxWidth: 480 } }}
            >
                <AppBar position="static" color="default" elevation={0}>
                    <Toolbar sx={{ justifyContent: 'space-between' }}>
                        <Typography variant="h6">Conversations</Typography>
                        <IconButton onClick={() => setMobileListOpen(false)} aria-label="Close">
                            <CloseIcon />
                        </IconButton>
                    </Toolbar>
                </AppBar>
                {ConversationList}
            </Drawer>

            {/* Mobile: top bar to open drawer; pinned below the header */}
            {!isMdUp && (
                <Box
                    sx={{
                        position: 'fixed',
                        top: `${headerH}px`,
                        left: 0,
                        right: 0,
                        bgcolor: 'background.paper',
                        borderBottom: 1,
                        borderColor: 'divider',
                        zIndex: (t) => t.zIndex.appBar - 1,
                    }}
                >
                    <Toolbar sx={{ gap: 1 }}>
                        <Button startIcon={<ArrowBackIcon />} variant="outlined" onClick={() => setMobileListOpen(true)}>
                            Conversations
                        </Button>
                        <Box sx={{ flex: 1 }} />
                        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setNewOpen(true)}>
                            New
                        </Button>
                    </Toolbar>
                </Box>
            )}

            {/* New message (recipient picker) */}
            <NewMessageDialog
                open={newOpen}
                onClose={() => setNewOpen(false)}
                viewer={viewer}
                onDone={(people) => {
                    setNewOpen(false);
                    handleCreateDraft(people);
                }}
            />
        </>
    );
}
