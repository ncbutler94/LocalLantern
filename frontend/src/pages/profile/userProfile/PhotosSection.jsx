// src/pages/profile/userProfile/PhotosSection.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Dialog,
    DialogActions,
    DialogTitle,
    Divider,
    IconButton,
    ImageList,
    ImageListItem,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import PublicIcon from '@mui/icons-material/Public';
import UserCardPopover from '../../../components/UserCardPopover';

const API_BASE = process.env.REACT_APP_API_URL || '';

/* ───────────────────────────────────────── Date helpers ───────────────────────────────────────── */
const pad2 = (n) => String(n).padStart(2, '0');
const formatClock = (d) => {
    const hrs = d.getHours();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const h12 = hrs % 12 || 12;
    return `${h12}:${pad2(d.getMinutes())} ${ampm}`;
};
const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const timeAgoShort = (ms) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
};

const prettyWhen = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    if (isSameDay(d, now)) return timeAgoShort(now - d);
    return `${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} • ${formatClock(d)}`;
};

/* ───────────────────────────────────────── Lightbox ───────────────────────────────────────── */
function PhotoLightbox({
                           open,
                           onClose,
                           photos,
                           startIndex = 0,
                           viewer,
                       }) {
    const [idx, setIdx] = useState(startIndex);
    const [comments, setComments] = useState([]);
    const [busySend, setBusySend] = useState(false);
    const [text, setText] = useState('');
    const [likes, setLikes] = useState(0);
    const [liked, setLiked] = useState(false);

    // user-card state
    const [userAnchorEl, setUserAnchorEl] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [popoverFollowing, setPopoverFollowing] = useState(false);

    const photo = photos[idx] || null;

    const fetchComments = useCallback(async (pid) => {
        if (!pid) return;
        try {
            const r = await fetch(`${API_BASE}/users/photos/${pid}/comments`, { credentials: 'include' });
            const j = await r.json();
            setComments(Array.isArray(j) ? j : []);
        } catch {
            setComments([]);
        }
    }, []);

    useEffect(() => {
        if (open && photo?.id) {
            // refresh comments + reset composer + sync like state for the photo
            fetchComments(photo.id);
            setLikes(Number(photo?.likes || 0));
            setLiked(Boolean(photo?.viewerLiked || false));
            setText('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, idx, photo?.id]);

    const next = () => setIdx((i) => (i + 1) % photos.length);
    const prev = () => setIdx((i) => (i - 1 + photos.length) % photos.length);

    const send = async () => {
        if (!viewer?.id || !photo?.id || !text.trim()) return;
        setBusySend(true);
        try {
            const r = await fetch(`${API_BASE}/users/photos/${photo.id}/comments`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text.trim() }),
            });
            const j = await r.json();
            if (j && j.id) {
                setComments((c) => [{ ...j, likes: 0, viewerLiked: false }, ...c]);
                setText('');
            }
        } finally {
            setBusySend(false);
        }
    };

    const toggleLikePhoto = async () => {
        if (!viewer?.id || !photo?.id) return;
        try {
            const r = await fetch(`${API_BASE}/users/photos/${photo.id}/like`, {
                method: 'POST',
                credentials: 'include',
            });
            const j = await r.json();
            if (typeof j?.likes === 'number') setLikes(j.likes);
            if (typeof j?.liked === 'boolean') setLiked(j.liked);
        } catch { /* ignore */ }
    };

    /* Comment likes */
    const toggleLikeComment = async (comment) => {
        if (!viewer?.id || !comment?.id) return;
        try {
            const r = await fetch(`${API_BASE}/users/photos/comments/${comment.id}/like`, {
                method: 'POST',
                credentials: 'include',
            });
            const j = await r.json();
            setComments((list) =>
                list.map((c) => (c.id === comment.id ? { ...c, likes: j.likes ?? c.likes, viewerLiked: j.liked ?? c.viewerLiked } : c))
            );
        } catch { /* ignore */ }
    };

    /* User card (mini profile actions) */
    const getViewerFollowingSet = () => {
        if (!viewer?.social_json) return new Set();
        const sj = typeof viewer.social_json === 'string' ? JSON.parse(viewer.social_json || '{}') : viewer.social_json;
        return new Set(Array.isArray(sj?.following) ? sj.following : []);
    };
    const closeUserCard = () => {
        setUserAnchorEl(null);
        setUserForCard(null);
    };
    const toggleFollowSelected = async () => {
        if (!viewer?.id || !userForCard?.id) return;
        const action = popoverFollowing ? 'unfollow' : 'follow';
        try {
            await fetch(`${API_BASE}/users/follow`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: userForCard.id, action }),
            });
            setPopoverFollowing(!popoverFollowing);
        } catch { /* ignore */ }
    };
    const messageSelected = () => {
        if (userForCard?.id) window.location.assign(`/messages?to=${userForCard.id}`);
    };

    if (!open) return null;

    // Prevent closing on backdrop click per popup rules
    const handleDialogClose = (_e, reason) => {
        if (reason === 'backdropClick') return;
        onClose?.();
    };

    return (
        <>
            <Dialog
                open={open}
                onClose={handleDialogClose}
                fullWidth
                maxWidth="lg"
                PaperProps={{ sx: { height: '92vh', m: 0, overflow: 'hidden' } }}
            >
                {/* Title with X (mobile-friendly) */}
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Photo
                    <IconButton aria-label="Close" onClick={() => onClose?.()} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 420px' },
                        height: 'calc(92vh - 56px)',
                        minHeight: 0,
                    }}
                >
                    {/* Image pane */}
                    <Box
                        sx={{
                            position: 'relative',
                            bgcolor: '#111',
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            height: '100%',
                            minHeight: 0,
                        }}
                    >
                        {photos.length > 1 && (
                            <>
                                <IconButton
                                    onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
                                    sx={{
                                        position: 'absolute',
                                        left: 8,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        bgcolor: 'rgba(0,0,0,0.55)',
                                        color: '#fff',
                                        '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                                    }}
                                >
                                    <ChevronLeftRoundedIcon />
                                </IconButton>
                                <IconButton
                                    onClick={() => setIdx((i) => (i + 1) % photos.length)}
                                    sx={{
                                        position: 'absolute',
                                        right: 8,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        bgcolor: 'rgba(0,0,0,0.55)',
                                        color: '#fff',
                                        '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                                    }}
                                >
                                    <ChevronRightRoundedIcon />
                                </IconButton>
                            </>
                        )}

                        {photo?.url && (
                            <Box
                                component="img"
                                alt=""
                                src={photo.url}
                                sx={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                }}
                            />
                        )}
                    </Box>

                    {/* Comments pane */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateRows: 'auto auto 1fr auto auto',
                            height: '100%',
                            minHeight: 0,
                            overflow: 'hidden',
                            bgcolor: 'background.paper',
                        }}
                    >
                        {/* Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Comments</Typography>
                            <Box sx={{ flex: 1 }} />
                            <TextField
                                select
                                SelectProps={{ native: true }}
                                size="small"
                                value="newest"
                                sx={{ width: 140 }}
                                onChange={() => {}}
                                label="Order"
                            >
                                <option value="newest">Newest first</option>
                                <option value="popular">Popular</option>
                            </TextField>
                        </Box>
                        <Divider />

                        {/* Scrollable comments list */}
                        <Box sx={{ overflowY: 'auto', px: 2, py: 1, minHeight: 0 }}>
                            {comments.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    Be the first to comment.
                                </Typography>
                            ) : (
                                comments.map((c) => (
                                    <Box key={c.id} sx={{ display: 'flex', gap: 1.25, py: 1 }}>
                                        <Avatar
                                            src={c.avatar_url || ''}
                                            sx={{ width: 32, height: 32, cursor: 'pointer' }}
                                            onClick={(e) => {
                                                setUserForCard({
                                                    id: c.user_id,
                                                    handle: c.handle,
                                                    first_name: c.first_name,
                                                    last_name: c.last_name,
                                                    avatar_url: c.avatar_url || c.profile_picture || '',
                                                });
                                                setUserAnchorEl(e.currentTarget);
                                            }}
                                        >
                                            {(c.first_name || 'U')[0]}
                                        </Avatar>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography
                                                variant="subtitle2"
                                                sx={{ lineHeight: 1.2, cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    setUserForCard({
                                                        id: c.user_id,
                                                        handle: c.handle,
                                                        first_name: c.first_name,
                                                        last_name: c.last_name,
                                                        avatar_url: c.avatar_url || c.profile_picture || '',
                                                    });
                                                    setUserAnchorEl(e.currentTarget);
                                                }}
                                            >
                                                {c.first_name} {c.last_name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {prettyWhen(c.created_at)}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ mt: 0.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                            >
                                                {c.content}
                                            </Typography>

                                            {/* comment actions */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                                <Tooltip title={c.viewerLiked ? 'Unlike' : 'Like'}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => {
                                                            /* like comment */
                                                        }}
                                                        disabled={!viewer?.id}
                                                    >
                                                        {c.viewerLiked ? (
                                                            <FavoriteRoundedIcon color="error" fontSize="small" />
                                                        ) : (
                                                            <FavoriteBorderRoundedIcon fontSize="small" />
                                                        )}
                                                    </IconButton>
                                                </Tooltip>
                                                <Typography variant="caption" color="text.secondary">
                                                    {c.likes || 0}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                ))
                            )}
                        </Box>

                        {/* Action bar */}
                        <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Tooltip title={liked ? 'Unlike' : 'Like'}>
                                <IconButton size="small" onClick={toggleLikePhoto} disabled={!viewer?.id}>
                                    {liked ? <FavoriteRoundedIcon color="error" /> : <FavoriteBorderRoundedIcon />}
                                </IconButton>
                            </Tooltip>
                            <Typography variant="body2" color="text.secondary">{likes}</Typography>
                            <ChatBubbleOutlineRoundedIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">{comments.length}</Typography>
                            <Box sx={{ flex: 1 }} />
                        </Box>

                        {/* Composer */}
                        <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            {viewer?.id ? (
                                <>
                                    <Avatar src={viewer.profile_picture || viewer.avatar_url || ''} sx={{ width: 32, height: 32 }}>
                                        {(viewer.first_name || 'U')[0]}
                                    </Avatar>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="Write a comment…"
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                send();
                                            }
                                        }}
                                        disabled={busySend}
                                    />
                                    <Button onClick={send} disabled={!text.trim() || busySend} variant="contained">
                                        Post
                                    </Button>
                                </>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    Log in to comment.
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Dialog>

            {/* User mini-card */}
            <UserCardPopover
                anchorEl={userAnchorEl}
                onClose={closeUserCard}
                user={userForCard}
                isSelf={!!(viewer?.id && userForCard?.id && viewer.id === userForCard.id)}
                following={popoverFollowing}
                onFollow={toggleFollowSelected}
                onMessage={messageSelected}
                onViewProfile={(u) => window.location.assign(`/${u.handle || u.id}`)}
            />
        </>
    );
}

/* ───────────────────────────────────────── Add / Edit dialog ───────────────────────────────────────── */
function AddEditPhotosDialog({ open, onClose, initial = [], profileHandle, onSaved }) {
    // STAGING STATE
    const [removeIds, setRemoveIds] = useState(() => new Set()); // photos to delete (staged)
    const [adds, setAdds] = useState([]);                        // File[] to upload (staged)
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setRemoveIds(new Set());
            setAdds([]);
        }
    }, [open]);

    const existing = useMemo(() => (Array.isArray(initial) ? initial : []), [initial]);

    // what will remain after save (for counts/UI)
    const keptCount = useMemo(() => Math.max(0, existing.length - removeIds.size), [existing.length, removeIds]);
    const totalAfter = useMemo(() => Math.min(9, keptCount + adds.length), [keptCount, adds.length]);
    const remainingSlots = 9 - totalAfter;

    // open file picker but DO NOT upload; just stage previews
    const pickFiles = () => {
        if (remainingSlots <= 0) return;
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = 'image/*';
        i.multiple = true;
        i.onchange = () => {
            const files = Array.from(i.files || []).slice(0, remainingSlots);
            if (files.length) setAdds((prev) => [...prev, ...files]);
        };
        i.click();
    };

    // stage delete: immediately hide from list, but do not call API yet
    const stageRemove = (id) => {
        setRemoveIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    // unstage an added file
    const removeAddAt = (index) => setAdds((prev) => prev.filter((_, i) => i !== index));

    // object-URL previews for staged uploads
    const previews = useMemo(() => adds.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [adds]);
    useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

    // SAVE: apply staged deletes then uploads
    const persist = async () => {
        setBusy(true);
        try {
            // delete staged existing
            for (const id of Array.from(removeIds)) {
                // eslint-disable-next-line no-await-in-loop
                await fetch(`${API_BASE}/users/photos/${id}`, { method: 'DELETE', credentials: 'include' });
            }
            // upload staged adds
            if (adds.length) {
                const fd = new FormData();
                adds.forEach((f) => fd.append('photos', f, f.name));
                await fetch(`${API_BASE}/users/photos`, { method: 'POST', credentials: 'include', body: fd });
            }
            // refresh and bubble up
            const r = await fetch(`${API_BASE}/users/photos/${encodeURIComponent(profileHandle)}`, { credentials: 'include' });
            const j = await r.json();
            onSaved?.(Array.isArray(j?.photos) ? j.photos : []);
            onClose();
        } finally {
            setBusy(false);
        }
    };

    const handleDialogClose = (_e, reason) => {
        if (reason === 'backdropClick') return; // don't close on outside click
        onClose?.();
    };

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            fullWidth
            maxWidth="md"
            PaperProps={{
                sx: {
                    m: 0,
                    height: '92vh',
                    display: 'grid',
                    gridTemplateRows: 'auto 1fr auto',
                    overflow: 'hidden',
                },
            }}
        >
            {/* Title row — always visible */}
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Add / Edit Photos
                <IconButton aria-label="Close" onClick={() => onClose?.()} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            {/* Only this middle area scrolls */}
            <Box sx={{ overflowY: 'auto', minHeight: 0 }}>
                {/* Existing photos grid (items disappear immediately on delete) */}
                <Box sx={{ px: 2, pb: 1 }}>
                    {keptCount === 0 ? (
                        <Typography variant="body2" color="text.secondary">No photos yet.</Typography>
                    ) : (
                        <ImageList cols={3} gap={8} sx={{ m: 0 }}>
                            {existing.filter((p) => !removeIds.has(p.id)).map((p) => (
                                <ImageListItem key={p.id} sx={{ aspectRatio: '1 / 1', position: 'relative' }}>
                                    <Box
                                        component="img"
                                        src={p.url}
                                        alt=""
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }}
                                    />
                                    <IconButton
                                        size="small"
                                        onClick={() => stageRemove(p.id)}
                                        sx={{
                                            position: 'absolute',
                                            top: 6,
                                            right: 6,
                                            bgcolor: 'rgba(0,0,0,0.55)',
                                            color: '#fff',
                                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                                        }}
                                        title="Remove"
                                    >
                                        <DeleteForeverRoundedIcon fontSize="small" />
                                    </IconButton>
                                </ImageListItem>
                            ))}
                        </ImageList>
                    )}
                </Box>

                <Divider />

                {/* New additions grid */}
                <Box sx={{ px: 2, pt: 1, pb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        {/* Shows the final total that will exist after Save */}
                        <Typography variant="subtitle2">Add Photos ({totalAfter} of 9)</Typography>
                        <Button
                            size="small"
                            startIcon={<AddPhotoAlternateRoundedIcon />}
                            onClick={pickFiles}
                            disabled={remainingSlots <= 0}
                        >
                            Upload
                        </Button>
                    </Box>

                    {/* Previews for staged uploads (no helper text) */}
                    {previews.length > 0 && (
                        <ImageList cols={3} gap={8} sx={{ m: 0 }}>
                            {previews.map((p, i) => (
                                <ImageListItem key={`${p.url}-${i}`} sx={{ aspectRatio: '1 / 1', position: 'relative' }}>
                                    <Box
                                        component="img"
                                        src={p.url}
                                        alt=""
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }}
                                    />
                                    <IconButton
                                        size="small"
                                        onClick={() => removeAddAt(i)}
                                        sx={{
                                            position: 'absolute',
                                            top: 6,
                                            right: 6,
                                            bgcolor: 'rgba(0,0,0,0.55)',
                                            color: '#fff',
                                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                                        }}
                                        title="Remove"
                                    >
                                        <DeleteForeverRoundedIcon fontSize="small" />
                                    </IconButton>
                                </ImageListItem>
                            ))}
                        </ImageList>
                    )}
                </Box>
            </Box>

            {/* Bottom actions — always visible */}
            <DialogActions sx={{ px: 2, pb: 2 }}>
                <Button onClick={() => onClose?.()} disabled={busy}>Cancel</Button>
                <Button variant="contained" onClick={persist} disabled={busy}>
                    Save Changes
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ───────────────────────────────────────── Section ───────────────────────────────────────── */
export default function PhotosSection({
                                          profileHandle,
                                          isOwner,
                                          viewer,
                                          onOpenPrivacy,
                                          currentPrivacy = 'public',
                                          editMode = false,
                                          canView = true,
                                      }) {
    const [photos, setPhotos] = useState([]);
    const [error, setError] = useState('');
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [editorOpen, setEditorOpen] = useState(false);

    // Fetch photos
    useEffect(() => {
        if (!canView) return;
        let alive = true;
        const ac = new AbortController();
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/users/photos/${encodeURIComponent(profileHandle)}`, {
                    credentials: 'include',
                    signal: ac.signal,
                });
                const j = await r.json();
                if (!alive) return;
                setPhotos(Array.isArray(j?.photos) ? j.photos.slice(0, 9) : []);
            } catch {
                if (alive) setError('Failed to load photos.');
            }
        })();
        return () => { alive = false; ac.abort(); };
    }, [profileHandle, canView]);

    if (!canView) return null;

    const openAt = (i) => { setLightboxIndex(i); setLightboxOpen(true); };
    const privacyText = currentPrivacy === 'friends' ? 'Followers' : currentPrivacy === 'private' ? 'Only Me' : 'Public';

    return (
        <Card
            variant="outlined"
            sx={{
                borderRadius: 3,
                overflow: 'hidden',
                borderColor: 'rgba(2,6,23,0.08)',
                boxShadow: '0 6px 20px rgba(2,6,23,0.08)',
                bgcolor: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(6px)',
            }}
        >
            <Box
                sx={{
                    p: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.00) 60%)',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Photos</Typography>
                    {isOwner && (
                        <>
                            <Tooltip title="Privacy">
                                <IconButton size="small" onClick={onOpenPrivacy}>
                                    <PublicIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Typography variant="caption" color="text.secondary">
                                ({privacyText})
                            </Typography>
                        </>
                    )}
                </Box>

                {/* Show Add/Edit to the owner at all times (not gated by editMode) */}
                {isOwner && (
                    <Button size="small" onClick={() => setEditorOpen(true)}>Add/Edit</Button>
                )}
            </Box>

            <CardContent sx={{ pt: 0.5, pb: 1.25 }}>
                {error ? (
                    <Typography variant="body2" color="error.main">{error}</Typography>
                ) : photos.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No photos yet.</Typography>
                ) : (
                    <ImageList cols={3} gap={8} sx={{ m: 0 }}>
                        {photos.slice(0, 9).map((p, i) => (
                            <ImageListItem key={p.id} sx={{ aspectRatio: '1 / 1' }}>
                                <Box
                                    component="img"
                                    src={p.url}
                                    alt=""
                                    loading="lazy"
                                    onClick={() => openAt(i)}
                                    sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }}
                                />
                            </ImageListItem>
                        ))}
                    </ImageList>
                )}
            </CardContent>

            <PhotoLightbox
                open={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                photos={photos}
                startIndex={lightboxIndex}
                viewer={viewer}
            />

            <AddEditPhotosDialog
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                initial={photos}
                profileHandle={profileHandle}
                onSaved={(list) => setPhotos((Array.isArray(list) ? list : []).slice(0, 9))}
            />
        </Card>
    );
}
