// src/pages/profile/userProfile/ProfileHeader.jsx
import React, { useCallback, useEffect, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Card,
    Chip,
    Dialog,
    Divider,
    IconButton,
    TextField,
    Tooltip,
    Typography,
    InputAdornment,
} from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';

const API_BASE = process.env.REACT_APP_API_URL || '';

/* ───────── helpers ───────── */
const pad2 = (n) => String(n).padStart(2, '0');
const formatClock = (d) => {
    const hrs = d.getHours();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const h12 = hrs % 12 || 12;
    return `${h12}:${pad2(d.getMinutes())} ${ampm}`;
};
const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
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
    return `${d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })} • ${formatClock(d)}`;
};

/* ───────── lightbox ───────── */
function ProfileMediaLightbox({ open, onClose, photos, startIndex = 0, viewer }) {
    const [idx, setIdx] = useState(startIndex);
    const [comments, setComments] = useState([]);
    const [busySend, setBusySend] = useState(false);
    const [text, setText] = useState('');
    const [likes, setLikes] = useState(0);
    const [liked, setLiked] = useState(false);

    const photo = photos[idx] || null;

    useEffect(() => {
        if (open) {
            setIdx(startIndex);
            setText('');
            setComments([]);
            setLikes(Number(photo?.likes || 0));
            setLiked(Boolean(photo?.viewerLiked || false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, startIndex]);

    const fetchComments = useCallback(async (pid) => {
        if (pid == null) return;
        try {
            const r = await fetch(`${API_BASE}/users/photos/${encodeURIComponent(pid)}/comments`, {
                credentials: 'include',
            });
            const j = await r.json();
            setComments(Array.isArray(j) ? j : []);
        } catch {
            setComments([]);
        }
    }, []);

    useEffect(() => {
        if (!open || !photo?.id) return;
        setText('');
        setComments([]);
        fetchComments(photo.id);
        setLikes(Number(photo?.likes || 0));
        setLiked(Boolean(photo?.viewerLiked || false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, photo?.id]);

    const next = () => setIdx((i) => (i + 1) % photos.length);
    const prev = () => setIdx((i) => (i - 1 + photos.length) % photos.length);

    const send = async () => {
        if (!viewer?.id || !photo?.id || !text.trim()) return;
        setBusySend(true);
        try {
            const r = await fetch(`${API_BASE}/users/photos/${encodeURIComponent(photo.id)}/comments`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text.trim() }),
            });
            const j = await r.json();
            if (j && j.id) {
                setComments((c) => [j, ...c]);
                setText('');
            }
        } finally {
            setBusySend(false);
        }
    };

    const toggleLike = async () => {
        if (!viewer?.id || !photo?.id) return;
        try {
            const r = await fetch(`${API_BASE}/users/photos/${encodeURIComponent(photo.id)}/like`, {
                method: 'POST',
                credentials: 'include',
            });
            const j = await r.json();
            if (typeof j?.likes === 'number') setLikes(j.likes);
            if (typeof j?.liked === 'boolean') setLiked(j.liked);
        } catch {
            /* ignore */
        }
    };

    if (!open) return null;

    const handleDialogClose = (_e, reason) => {
        // Do NOT close on outside click; only on X or ESC
        if (reason === 'backdropClick') return;
        onClose?.();
    };

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            fullWidth
            maxWidth="lg"
            PaperProps={{ sx: { height: '92vh', m: 0, overflow: 'hidden' } }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 420px' },
                    height: '100%',
                    minHeight: 0,
                }}
            >
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
                    <IconButton
                        aria-label="Close"
                        onClick={() => onClose?.()}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            bgcolor: 'rgba(0,0,0,0.55)',
                            color: '#fff',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                        }}
                    >
                        <CloseIcon />
                    </IconButton>

                    {photos.length > 1 && (
                        <>
                            <IconButton
                                onClick={prev}
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
                                onClick={next}
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            Comments
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                        <TextField select SelectProps={{ native: true }} size="small" value="newest" sx={{ width: 140 }} label="Order">
                            <option value="newest">Newest first</option>
                            <option value="popular">Popular</option>
                        </TextField>
                    </Box>
                    <Divider />

                    <Box sx={{ overflowY: 'auto', px: 2, py: 1, minHeight: 0 }}>
                        {comments.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                Be the first to comment.
                            </Typography>
                        ) : (
                            comments.map((c) => (
                                <Box key={c.id} sx={{ display: 'flex', gap: 1.25, py: 1 }}>
                                    <Avatar src={c.avatar_url || ''} sx={{ width: 32, height: 32 }}>
                                        {(c.first_name || 'U')[0]}
                                    </Avatar>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                                            {c.first_name} {c.last_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {prettyWhen(c.created_at)}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                mt: 0.25,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {c.content}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))
                        )}
                    </Box>

                    <Box
                        sx={{
                            px: 1.5,
                            py: 1,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                        }}
                    >
                        <Tooltip title={liked ? 'Unlike' : 'Like'}>
                            <IconButton size="small" onClick={toggleLike}>
                                {liked ? <FavoriteRoundedIcon color="error" /> : <FavoriteBorderRoundedIcon />}
                            </IconButton>
                        </Tooltip>
                        <Typography variant="body2" color="text.secondary">
                            {likes}
                        </Typography>
                        <ChatBubbleOutlineRoundedIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                            {comments.length}
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                    </Box>

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
    );
}

/* ───────────────────────────── Header ───────────────────────────── */
export default function ProfileHeader({
                                          profile,
                                          avatarSrc,
                                          coverPreview,
                                          isMine,
                                          editMode,
                                          onEnterEdit,
                                          onSave,
                                          onCancel,
                                          onChangeAvatar,
                                          onDeleteAvatar,
                                          onChangeCover,
                                          onDeleteCover,
                                          viewer,
                                          isFollowing,
                                          onToggleFollow,

                                          // handle edit support
                                          handleDraft,
                                          onHandleDraftChange,
                                          handleStats, // { remaining, nextAllowed }

                                          // name edit support
                                          firstNameDraft,
                                          lastNameDraft,
                                          onFirstNameDraftChange,
                                          onLastNameDraftChange,

                                          // username error message (shown on the input)
                                          handleError,

                                          // NEW: staged deletion flags
                                          stagedDeleteAvatar = false,
                                          stagedDeleteCover = false,
                                      }) {
    // Respect staged cover deletion: hide cover in UI when flagged
    const cover = stagedDeleteCover ? '' : (coverPreview || profile?.cover_url || '');

    const displayName =
        `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() ||
        profile?.display_name ||
        'User';

    // Use an effective avatar that respects staged deletion
    const avatarUrl = stagedDeleteAvatar ? '' : (avatarSrc || '');

    // Lightbox state
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxPhotos, setLightboxPhotos] = useState([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);

    const buildMediaPid = (kind /* 'avatar' | 'cover' */) => {
        const uid = Number(profile?.id || 0);
        const code = kind === 'avatar' ? 1 : 2;
        return -(uid * 10 + code);
    };
    const openMedia = (kind /* 'avatar'|'cover' */) => {
        if (editMode) return;
        const list = [];
        if (kind === 'avatar' && avatarUrl) list.push({ id: buildMediaPid('avatar'), url: avatarUrl });
        else if (kind === 'cover' && cover) list.push({ id: buildMediaPid('cover'), url: cover });
        if (list.length) {
            setLightboxPhotos(list);
            setLightboxIndex(0);
            setLightboxOpen(true);
        }
    };

    const AVATAR = 120;

    // Username cooldown → show helper / disable if blocked
    const nextAllowed =
        isMine && editMode ? (handleStats?.nextAllowed ? new Date(handleStats.nextAllowed) : null) : null;
    const daysUntilNext =
        nextAllowed && nextAllowed.getTime() > Date.now()
            ? Math.max(1, Math.ceil((nextAllowed.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
            : 0;
    const usernameBlocked = !!(isMine && editMode && handleStats && handleStats.remaining <= 0 && daysUntilNext > 0);

    // Anti‑autofill attributes for names
    const antiFillAttrs = {
        autoComplete: 'off',
        'data-1p-ignore': 'true',
        'data-lpignore': 'true',
    };
    const editableOnFocus = (e) => {
        if (e?.target?.hasAttribute('readonly')) e.target.removeAttribute('readonly');
    };

    const hasCover = Boolean(cover);

    // ───────────────────── Compact identity content (used when NO cover) ─────────────────────
    const CompactIdentity = () => (
        <Box sx={{ p: { xs: 1.25, sm: 2 } }}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'auto 1fr',
                        md: 'auto 1fr auto',
                    },
                    alignItems: { xs: 'flex-start', md: 'center' },
                    columnGap: { xs: 1.25, sm: 2 },
                    rowGap: 1,
                }}
            >
                {/* Avatar */}
                <Box
                    sx={{ width: AVATAR, minWidth: AVATAR }}
                    onClick={(e) => {
                        e.stopPropagation();
                        openMedia('avatar');
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            openMedia('avatar');
                        }
                    }}
                    role={avatarUrl && !editMode ? 'button' : undefined}
                    tabIndex={avatarUrl && !editMode ? 0 : undefined}
                >
                    <Avatar
                        src={avatarUrl}
                        alt={displayName}
                        sx={{
                            width: AVATAR,
                            height: AVATAR,
                            border: '4px solid #fff',
                            boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
                        }}
                    />
                    {isMine && editMode && (
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                flexWrap: 'wrap',
                                mt: 1,
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Button
                                size="small"
                                startIcon={<EditIcon fontSize="small" />}
                                onClick={() => onChangeAvatar?.()}
                            >
                                Change picture
                            </Button>
                            {avatarUrl && (
                                <Button
                                    size="small"
                                    color="error"
                                    startIcon={<DeleteOutlineIcon fontSize="small" />}
                                    onClick={() => onDeleteAvatar?.()}
                                >
                                    Delete picture
                                </Button>
                            )}
                        </Box>
                    )}
                </Box>

                {/* Name / Username (or inputs) */}
                <Box sx={{ minWidth: 0, mt: editMode ? 1 : 0 }}>
                    {!editMode && (
                        <Typography
                            variant="h5"
                            sx={{
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {displayName}
                        </Typography>
                    )}

                    {!editMode ? (
                        profile?.handle ? (
                            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                @{profile.handle}
                            </Typography>
                        ) : (
                            <Chip size="small" label="No username" sx={{ mt: 0.25, bgcolor: '#eef2ff' }} />
                        )
                    ) : (
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                gap: 1,
                                maxWidth: 600,
                            }}
                        >
                            <TextField
                                size="small"
                                label="First name"
                                value={firstNameDraft || ''}
                                onChange={(e) => onFirstNameDraftChange?.(e.target.value)}
                                onFocus={editableOnFocus}
                                autoComplete="off"
                                inputProps={{ ...antiFillAttrs, maxLength: 50, readOnly: true }}
                                fullWidth
                            />
                            <TextField
                                size="small"
                                label="Last name"
                                value={lastNameDraft || ''}
                                onChange={(e) => onLastNameDraftChange?.(e.target.value)}
                                onFocus={editableOnFocus}
                                autoComplete="off"
                                inputProps={{ ...antiFillAttrs, maxLength: 50, readOnly: true }}
                                fullWidth
                            />
                            <TextField
                                size="small"
                                label="Username"
                                value={handleDraft || ''}
                                onChange={(e) =>
                                    onHandleDraftChange?.(e.target.value.replace(/^@+/, '').replace(/\s+/g, ''))
                                }
                                inputProps={{ maxLength: 30 }}
                                sx={{ gridColumn: { xs: '1 / -1', sm: '1 / span 2' }, maxWidth: { md: 420 } }}
                                placeholder="username"
                                disabled={usernameBlocked}
                                error={Boolean(handleError)}
                                helperText={
                                    handleError
                                        ? handleError
                                        : usernameBlocked
                                            ? `You can edit your username again in ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'}.`
                                            : '3–30 chars: letters, numbers, dot, dash, underscore.'
                                }
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">@</InputAdornment>,
                                }}
                            />
                        </Box>
                    )}
                </Box>

                {/* Actions */}
                <Box
                    sx={{
                        display: 'flex',
                        gap: 1,
                        justifyContent: { xs: 'flex-start', md: 'flex-end' },
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        minHeight: 40,
                    }}
                >
                    {isMine ? (
                        !editMode ? (
                            <Button
                                startIcon={<EditIcon />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEnterEdit?.();
                                }}
                            >
                                Edit Profile
                            </Button>
                        ) : (
                            <>
                                {/* Provide Add Cover action here since there is no cover block */}
                                <Button
                                    size="small"
                                    startIcon={<DriveFolderUploadIcon />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onChangeCover?.();
                                    }}
                                >
                                    Add Cover Photo
                                </Button>
                                <Button
                                    startIcon={<SaveIcon />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSave?.();
                                    }}
                                    variant="contained"
                                >
                                    Save Profile
                                </Button>
                                <Button
                                    startIcon={<CloseIcon />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancel?.();
                                    }}
                                >
                                    Cancel
                                </Button>
                            </>
                        )
                    ) : (
                        <>
                            <Button
                                startIcon={<MailOutlineIcon />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            >
                                Message
                            </Button>
                            <Button
                                variant={isFollowing ? 'outlined' : 'contained'}
                                startIcon={<PersonAddAlt1Icon />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleFollow?.();
                                }}
                            >
                                {isFollowing ? 'Unfollow' : 'Follow'}
                            </Button>
                        </>
                    )}
                </Box>
            </Box>
        </Box>
    );

    return (
        <>
            {/* Cover card (only rendered when there IS a cover). Otherwise we render CompactIdentity only. */}
            <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2 }}>
                <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                    {hasCover ? (
                        <Box
                            onClick={() => openMedia('cover')}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openMedia('cover')}
                            role={cover && !editMode ? 'button' : undefined}
                            tabIndex={cover && !editMode ? 0 : undefined}
                            sx={{
                                position: 'relative',
                                height: { xs: 260, sm: 340, md: 440 },
                                background: `url(${cover}) center/cover no-repeat`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: !editMode ? 'pointer' : 'default',
                                outline: 'none',
                            }}
                        >
                            {/* Cover edit bar — at the top-right of the cover */}
                            {isMine && editMode && (
                                <Box
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{
                                        position: 'absolute',
                                        right: { xs: 8, sm: 12 },
                                        top: 12,
                                        display: 'flex',
                                        gap: 1,
                                        flexWrap: 'wrap',
                                        bgcolor: 'rgba(255,255,255,0.95)',
                                        borderRadius: 999,
                                        px: 1,
                                        py: 0.5,
                                        boxShadow: '0 6px 18px rgba(2,6,23,0.20)',
                                        zIndex: 3,
                                    }}
                                >
                                    <Button
                                        size="small"
                                        startIcon={<EditIcon />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onChangeCover?.();
                                        }}
                                    >
                                        Change Cover Photo
                                    </Button>
                                    <Button
                                        size="small"
                                        color="error"
                                        startIcon={<DeleteOutlineIcon />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteCover?.();
                                        }}
                                    >
                                        Delete Cover Photo
                                    </Button>
                                </Box>
                            )}

                            {/* FADE overlay at bottom of cover */}
                            <Box
                                aria-hidden
                                sx={{
                                    pointerEvents: 'none',
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    height: 72,
                                    background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 90%)',
                                    zIndex: 1,
                                }}
                            />

                            {/* Identity BAR inside the cover image area */}
                            <Box
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    bgcolor: '#fff',
                                    borderTop: '1px solid rgba(2,6,23,0.08)',
                                    borderRadius: 0,
                                    boxShadow: '0 -8px 22px rgba(2,6,23,0.10)',
                                    py: { xs: 0.75, sm: 1.1 },
                                    minHeight: isMine && editMode ? { xs: 220, sm: 228 } : { xs: 76, sm: 88 },
                                    zIndex: 2,
                                    cursor: 'default',
                                }}
                            >
                                {/* Avatar straddling the seam */}
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        top: 0,
                                        left: { xs: 12, sm: 16 },
                                        transform: 'translateY(-50%)',
                                        width: AVATAR,
                                        height: AVATAR,
                                        cursor: avatarUrl && !editMode ? 'pointer' : 'default',
                                        overflow: 'visible',
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openMedia('avatar');
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.stopPropagation();
                                            openMedia('avatar');
                                        }
                                    }}
                                    role={avatarUrl && !editMode ? 'button' : undefined}
                                    tabIndex={avatarUrl && !editMode ? 0 : undefined}
                                >
                                    <Avatar
                                        src={avatarUrl}
                                        alt={displayName}
                                        sx={{
                                            width: AVATAR,
                                            height: AVATAR,
                                            border: '4px solid #fff',
                                            boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
                                        }}
                                    />
                                </Box>

                                {/* Avatar action pill along the seam, to the right of avatar */}
                                {isMine && editMode && (
                                    <Box
                                        onClick={(e) => e.stopPropagation()}
                                        sx={{
                                            position: 'absolute',
                                            left: { xs: AVATAR + 36, sm: AVATAR + 48 },
                                            top: -20,
                                            display: 'flex',
                                            gap: 1,
                                            bgcolor: 'rgba(255,255,255,0.95)',
                                            borderRadius: 999,
                                            px: 1,
                                            py: 0.5,
                                            boxShadow: '0 6px 18px rgba(2,6,23,0.20)',
                                            zIndex: 5,
                                        }}
                                    >
                                        <Button
                                            size="small"
                                            startIcon={<EditIcon fontSize="small" />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onChangeAvatar?.();
                                            }}
                                        >
                                            Change profile picture
                                        </Button>
                                        {avatarUrl && (
                                            <Button
                                                size="small"
                                                color="error"
                                                startIcon={<DeleteOutlineIcon fontSize="small" />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteAvatar?.();
                                                }}
                                            >
                                                Delete profile picture
                                            </Button>
                                        )}
                                    </Box>
                                )}

                                {/* Identity bar content */}
                                <Box
                                    sx={{
                                        pt: { xs: `${AVATAR / 2 + 10}px`, md: isMine && editMode ? 1 : 0 },
                                        mt: isMine && editMode ? { xs: 3, sm: 3, md: 2.5 } : 0,
                                        pl: { xs: `${AVATAR + 28}px`, sm: `${AVATAR + 32}px`, md: `${AVATAR + 56}px` },
                                        pr: { xs: 1, sm: 2, md: 2 },
                                        display: 'grid',
                                        gridTemplateColumns: {
                                            xs: '1fr',
                                            md: 'minmax(0,1fr) minmax(260px, 380px) auto',
                                        },
                                        alignItems: { xs: 'flex-start', md: 'center' },
                                        columnGap: { xs: 1, md: 2 },
                                        rowGap: 1,
                                        position: 'relative',
                                    }}
                                >
                                    {/* Left: Name / Name inputs */}
                                    <Box sx={{ minWidth: 0, mt: editMode ? 1.25 : 0 }}>
                                        {!editMode && (
                                            <Typography
                                                variant="h5"
                                                sx={{
                                                    lineHeight: 1.2,
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {displayName}
                                            </Typography>
                                        )}

                                        {!editMode ? (
                                            profile?.handle ? (
                                                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                    @{profile.handle}
                                                </Typography>
                                            ) : (
                                                <Chip size="small" label="No username" sx={{ mt: 0.25, bgcolor: '#eef2ff' }} />
                                            )
                                        ) : (
                                            // EDIT MODE: first/last name inputs
                                            <Box
                                                sx={{
                                                    display: 'grid',
                                                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                                    gap: 1,
                                                    maxWidth: 600,
                                                }}
                                            >
                                                <TextField
                                                    size="small"
                                                    label="First name"
                                                    value={firstNameDraft || ''}
                                                    onChange={(e) => onFirstNameDraftChange?.(e.target.value)}
                                                    onFocus={editableOnFocus}
                                                    autoComplete="off"
                                                    inputProps={{ ...antiFillAttrs, maxLength: 50, readOnly: true }}
                                                    fullWidth
                                                />
                                                <TextField
                                                    size="small"
                                                    label="Last name"
                                                    value={lastNameDraft || ''}
                                                    onChange={(e) => onLastNameDraftChange?.(e.target.value)}
                                                    onFocus={editableOnFocus}
                                                    autoComplete="off"
                                                    inputProps={{ ...antiFillAttrs, maxLength: 50, readOnly: true }}
                                                    fullWidth
                                                />

                                                {/* Username under the names */}
                                                <TextField
                                                    size="small"
                                                    label="Username"
                                                    value={handleDraft || ''}
                                                    onChange={(e) =>
                                                        onHandleDraftChange?.(e.target.value.replace(/^@+/, '').replace(/\s+/g, ''))
                                                    }
                                                    inputProps={{ maxLength: 30 }}
                                                    sx={{ gridColumn: { xs: '1 / -1', sm: '1 / span 2' }, maxWidth: { md: 420 } }}
                                                    placeholder="username"
                                                    disabled={usernameBlocked}
                                                    error={Boolean(handleError)}
                                                    helperText={
                                                        handleError
                                                            ? handleError
                                                            : usernameBlocked
                                                                ? `You can edit your username again in ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'}.`
                                                                : '3–30 chars: letters, numbers, dot, dash, underscore.'
                                                    }
                                                    InputProps={{
                                                        startAdornment: <InputAdornment position="start">@</InputAdornment>,
                                                    }}
                                                />
                                            </Box>
                                        )}
                                    </Box>

                                    {/* Middle (md+ view-only spacer) */}
                                    {!editMode && <Box sx={{ display: { xs: 'none', md: 'block' } }} />}

                                    {/* Right: Actions (Edit button when not editing) */}
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            gap: 1,
                                            justifyContent: { xs: 'flex-start', md: 'flex-end' },
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            minHeight: 40,
                                        }}
                                    >
                                        {isMine ? (
                                            !editMode ? (
                                                <Button
                                                    startIcon={<EditIcon />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEnterEdit?.();
                                                    }}
                                                >
                                                    Edit Profile
                                                </Button>
                                            ) : null
                                        ) : (
                                            <>
                                                <Button
                                                    startIcon={<MailOutlineIcon />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                >
                                                    Message
                                                </Button>
                                                <Button
                                                    variant={isFollowing ? 'outlined' : 'contained'}
                                                    startIcon={<PersonAddAlt1Icon />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onToggleFollow?.();
                                                    }}
                                                >
                                                    {isFollowing ? 'Unfollow' : 'Follow'}
                                                </Button>
                                            </>
                                        )}
                                    </Box>

                                    {/* Sticky Save/Cancel at bottom-right of identity band (edit mode only) */}
                                    {isMine && editMode && (
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                right: 12,
                                                bottom: 10,
                                                display: 'flex',
                                                gap: 1,
                                                zIndex: 4,
                                            }}
                                        >
                                            <Button
                                                startIcon={<SaveIcon />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSave?.();
                                                }}
                                                variant="contained"
                                            >
                                                Save Profile
                                            </Button>
                                            <Button
                                                startIcon={<CloseIcon />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCancel?.();
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Box>
                    ) : (
                        <CompactIdentity />
                    )}
                </Card>
            </Box>

            {/* Media Lightbox for avatar/cover (never closes on outside click) */}
            <ProfileMediaLightbox
                open={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                photos={lightboxPhotos}
                startIndex={lightboxIndex}
                viewer={viewer}
            />
        </>
    );
}
