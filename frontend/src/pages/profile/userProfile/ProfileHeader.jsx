// src/pages/profile/userProfile/ProfileHeader.jsx
// Avatar-only profile header (cover photo removed).
//
// Updates in this version (per request):
// - Removed the "View" button under the profile picture.
// - Added back "Comments on Photo" behavior for the avatar (no cover).
// - Autocomplete dropdowns (City/County) now have white backgrounds.
// - Validates Alabama City/County entries:
//     • Invalid city shows "Invalid Alabama City"
//     • Invalid county shows "Invalid Alabama County"
// - If a valid city is entered, auto-populates the county (when mapping is available).
// - If a city is entered, county becomes required (Save is disabled until county is present + valid).
// - All dialogs include an X in the top-right and do NOT close on backdrop click.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';

import cityCountyMap from '../../../data/cityCountyMap.json';

import {
    Avatar,
    Autocomplete,
    Box,
    Button,
    Card,
    Chip,
    CircularProgress,
    Dialog,
    Divider,
    FormControl,
    FormHelperText,
    IconButton,
    InputAdornment,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,

} from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbUpOffAltOutlinedIcon from '@mui/icons-material/ThumbUpOffAltOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');


// If you already have this file (you previously generated it for map flyTo),
// this import enables the auto-county behavior + city validation.
// Expected shapes supported (best-effort):
// - [{ city: "Piedmont", county: "Calhoun" }, ...]
// - [{ name: "Piedmont", county_name: "Calhoun" }, ...]
// - { "Piedmont": "Calhoun", ... }
const ALABAMA_COUNTIES = [
    'Autauga','Baldwin','Barbour','Bibb','Blount','Bullock','Butler','Calhoun','Chambers','Cherokee','Chilton','Choctaw',
    'Clarke','Clay','Cleburne','Coffee','Colbert','Conecuh','Coosa','Covington','Crenshaw','Cullman','Dale','Dallas','DeKalb',
    'Elmore','Escambia','Etowah','Fayette','Franklin','Geneva','Greene','Hale','Henry','Houston','Jackson','Jefferson','Lamar',
    'Lauderdale','Lawrence','Lee','Limestone','Lowndes','Macon','Madison','Marengo','Marion','Marshall','Mobile','Monroe',
    'Montgomery','Morgan','Perry','Pickens','Pike','Randolph','Russell','St. Clair','Shelby','Sumter','Talladega','Tallapoosa',
    'Tuscaloosa','Walker','Washington','Wilcox','Winston',
];

const normalizeCountyDraft = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    return s.replace(/\s*county\s*$/i, '').trim();
};

const normalizeCounty = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    return /county\s*$/i.test(s) ? s : `${s} County`;
};

const formatLongDate = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.valueOf())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

function MetaPill({ locationLabel, joinedLabel }) {
    if (!locationLabel && !joinedLabel) return null;

    const Pill = ({ icon, text }) => (
        <Box
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                px: 1.15,
                py: 0.65,
                borderRadius: 999,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(2,6,23,0.04)',
                boxShadow: '0 6px 16px rgba(2,6,23,0.08)',
                maxWidth: '100%',
            }}
        >
            {icon}
            <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}
            >
                {text}
            </Typography>
        </Box>
    );

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 1.1,
                flexWrap: 'wrap',
                mt: 1.1,
            }}
        >
            {locationLabel ? (
                <Pill
                    icon={<LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
                    text={locationLabel}
                />
            ) : null}

            {joinedLabel ? (
                <Pill
                    icon={<CalendarMonthIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
                    text={`Joined ${joinedLabel}`}
                />
            ) : null}
        </Box>
    );
}

MetaPill.propTypes = {
    locationLabel: PropTypes.string,
    joinedLabel: PropTypes.string,
};

function AvatarLightbox({ open, onClose, src, alt }) {
    const handleClose = (_e, reason) => {
        if (reason === 'backdropClick') return;
        onClose?.();
    };

    if (!open) return null;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            fullWidth
            maxWidth="lg"
            PaperProps={{ sx: { height: '92vh', m: 0, overflow: 'hidden', borderRadius: 3 } }}
        >
            <Box sx={{ position: 'relative', height: '100%', bgcolor: '#111' }}>
                <IconButton
                    aria-label="Close"
                    onClick={() => onClose?.()}
                    sx={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        bgcolor: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                        zIndex: 3,
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                    }}
                >
                    <CloseIcon />
                </IconButton>

                {src ? (
                    <Box
                        component="img"
                        src={src}
                        alt={alt || ''}
                        sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                ) : null}
            </Box>
        </Dialog>
    );
}

AvatarLightbox.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    src: PropTypes.string,
    alt: PropTypes.string,
};


function PhotoCommentsDialog({
                                 open,
                                 onClose,
                                 profileHandleOrId,
                                 viewerId,
                                 isOwner,
                             }) {
    const viewerIdSafe = Number(viewerId || 0);

    const [viewerProfile, setViewerProfile] = useState(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [photoRecord, setPhotoRecord] = useState(null); // { id, url }
    const [comments, setComments] = useState([]);
    const [sort, setSort] = useState('popular'); // popular | newest
    const [commentText, setCommentText] = useState('');
    const [posting, setPosting] = useState(false);
    const [expandedMap, setExpandedMap] = useState({});

    const TRUNCATE_AT = 260;

    const reset = useCallback(() => {
        setLoading(false);
        setError('');
        setPhotoRecord(null);
        setComments([]);
        setSort('popular');
        setCommentText('');
        setPosting(false);
        setExpandedMap({});
    }, []);

    const safeClose = useCallback(
        (_e, reason) => {
            if (reason === 'backdropClick') return;
            reset();
            onClose?.();
        },
        [onClose, reset]
    );

    const fetchComments = useCallback(async (photoId, sortKey) => {
        const pid = Number(photoId || 0);
        if (!pid) return [];
        const s = sortKey === 'newest' ? 'newest' : 'popular';
        const resp = await axios.get(`${API_BASE}/users/photos/${encodeURIComponent(pid)}/comments`, {
            params: { sort: s },
            withCredentials: true,
        });
        const rows = Array.isArray(resp.data?.comments)
            ? resp.data.comments
            : Array.isArray(resp.data)
                ? resp.data
                : [];
        return rows;
    }, []);


    useEffect(() => {
        if (!open) return;

        let alive = true;

        (async () => {
            try {
                const candidates = [
                    '/users/profile',
                    '/api/users/profile',
                    API_BASE ? `${API_BASE}/users/profile` : null,
                ].filter(Boolean);

                for (const url of candidates) {
                    try {
                        const r = await axios.get(url, { withCredentials: true });
                        const u = r?.data?.user || r?.data || null;
                        if (u && alive) {
                            setViewerProfile(u);
                            return;
                        }
                    } catch {
                        // try next
                    }
                }
            } catch {
                // ignore
            }
        })();

        return () => {
            alive = false;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (!profileHandleOrId) return;

        let alive = true;

        (async () => {
            setLoading(true);
            setError('');
            setPhotoRecord(null);
            setComments([]);
            try {
                // avatar only
                const r = await axios.get(
                    `${API_BASE}/users/photos/special/${encodeURIComponent(profileHandleOrId)}/avatar`,
                    { withCredentials: true }
                );
                const photo = r.data?.photo || r.data?.record || r.data || null;
                if (!photo?.id || !photo?.url) throw new Error('Could not resolve photo record');
                const rec = { id: Number(photo.id), url: String(photo.url) };
                if (!alive) return;
                setPhotoRecord(rec);

                const rows = await fetchComments(rec.id, sort);
                if (!alive) return;
                setComments(Array.isArray(rows) ? rows : []);
            } catch (e) {
                if (!alive) return;
                setError(e?.response?.data?.message || e?.message || 'Failed to load comments.');
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [open, profileHandleOrId, fetchComments, sort]);

    const timeLabel = (iso) => {
        const d = iso ? new Date(iso) : null;
        if (!d || Number.isNaN(d.valueOf())) return '';
        const now = Date.now();
        const diffMs = Math.max(0, now - d.getTime());

        const sec = Math.floor(diffMs / 1000);
        if (sec < 30) return 'now';
        if (sec < 60) return `${sec}s`;

        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m`;

        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}hr`;

        const day = Math.floor(hr / 24);
        if (day < 7) return `${day}d`;

        const wk = Math.floor(day / 7);
        if (wk < 5) return `${wk}w`;

        const mo = Math.floor(day / 30);
        if (mo < 12) return `${mo}mo`;

        const yr = Math.floor(day / 365);
        return `${yr}y`;
    };

    const toggleLike = useCallback(async (commentId) => {
        const cid = Number(commentId || 0);
        if (!cid) return;
        try {
            const r = await axios.post(
                `${API_BASE}/users/photos/comments/${encodeURIComponent(cid)}/like`,
                {},
                { withCredentials: true }
            );
            const liked = !!r.data?.liked;
            const likes = Number(r.data?.likes || 0);
            setComments((prev) =>
                Array.isArray(prev)
                    ? prev.map((c) => (Number(c.id) === cid ? { ...c, viewer_liked: liked, like_count: likes } : c))
                    : prev
            );
        } catch (e) {
            const status = Number(e?.response?.status || 0);
            if (status === 401) {
                try {
                    window.dispatchEvent(new CustomEvent('open-login'));
                } catch {
                    // ignore
                }
            }
        }
    }, []);

    const deleteComment = useCallback(
        async (commentId) => {
            const cid = Number(commentId || 0);
            if (!cid) return;

            try {
                await axios.delete(`${API_BASE}/users/photos/comments/${encodeURIComponent(cid)}`, { withCredentials: true });
                if (photoRecord?.id) {
                    const rows = await fetchComments(photoRecord.id, sort);
                    setComments(Array.isArray(rows) ? rows : []);
                } else {
                    setComments((prev) => (Array.isArray(prev) ? prev.filter((c) => Number(c.id) !== cid) : prev));
                }
            } catch (e) {
                const status = Number(e?.response?.status || 0);
                if (status === 401) {
                    try {
                        window.dispatchEvent(new CustomEvent('open-login'));
                    } catch {
                        // ignore
                    }
                    return;
                }
                setError(e?.response?.data?.message || 'Unable to delete comment');
            }
        },
        [photoRecord?.id, fetchComments, sort]
    );

    const submit = useCallback(async () => {
        if (!photoRecord?.id) return;
        const cleaned = String(commentText || '').trim().slice(0, 1000);
        if (!cleaned) return;

        setPosting(true);
        setError('');
        try {
            await axios.post(
                `${API_BASE}/users/photos/${encodeURIComponent(photoRecord.id)}/comments`,
                { content: cleaned },
                { withCredentials: true }
            );
            setCommentText('');
            const rows = await fetchComments(photoRecord.id, sort);
            setComments(Array.isArray(rows) ? rows : []);
            setExpandedMap({});
        } catch (e) {
            const status = Number(e?.response?.status || 0);
            if (status === 401) {
                try {
                    window.dispatchEvent(new CustomEvent('open-login'));
                } catch {
                    // ignore
                }
                setError('Please log in to comment.');
            } else {
                setError(e?.response?.data?.message || e?.message || 'Failed to post comment.');
            }
        } finally {
            setPosting(false);
        }
    }, [photoRecord?.id, commentText, fetchComments, sort]);

    const canSubmit = Boolean(String(commentText || '').trim()) && !posting;

    const viewerAvatarUrl =
        viewerProfile?.avatar_url ||
        viewerProfile?.profile_picture ||
        viewerProfile?.avatarSrc ||
        viewerProfile?.avatar ||
        viewerProfile?.photo_url ||
        '';

    const viewerDisplayName =
        `${viewerProfile?.first_name || ''} ${viewerProfile?.last_name || ''}`.trim() ||
        viewerProfile?.display_name ||
        'Me';


    return (
        <Dialog
            open={open}
            onClose={safeClose}
            fullWidth
            maxWidth="lg"
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    position: 'relative',
                    overflow: 'hidden',
                    height: { xs: '92vh', md: 720 },
                    maxHeight: { xs: '92vh', md: 720 },
                    display: 'flex',
                    flexDirection: 'column',
                },
            }}
        >
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    gap: 1.25,
                    px: { xs: 1.25, sm: 1.75 },
                    pt: 2.25,
                    pb: 1.25,
                }}
            >
                {/* LEFT: Image */}
                <Box
                    sx={{
                        flex: { md: '0 0 54%' },
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 3,
                        background: 'rgba(2,6,23,0.04)',
                        overflow: 'hidden',
                        height: { xs: 260, md: '100%' },
                        minHeight: 0,
                    }}
                >
                    {photoRecord?.url ? (
                        <Box
                            component="img"
                            src={photoRecord.url}
                            alt="avatar"
                            sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        />
                    ) : loading ? (
                        <CircularProgress />
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            No photo found.
                        </Typography>
                    )}
                </Box>

                {/* RIGHT: Comments */}
                <Box
                    sx={{
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 3,
                        border: '1px solid rgba(2,6,23,0.08)',
                        overflow: 'hidden',
                        background: '#fff',
                        flex: 1,
                        minHeight: 0,
                    }}
                >
                    {/* header */}
                    <Box
                        sx={{
                            px: 1.5,
                            py: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid rgba(2,6,23,0.08)',
                            gap: 1,
                        }}
                    >
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                            Comments
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControl size="small">
                                <Select
                                    value={sort}
                                    onChange={async (e) => {
                                        const v = e.target.value === 'newest' ? 'newest' : 'popular';
                                        setSort(v);
                                        if (photoRecord?.id) {
                                            setLoading(true);
                                            try {
                                                const rows = await fetchComments(photoRecord.id, v);
                                                setComments(Array.isArray(rows) ? rows : []);
                                            } catch {
                                                // ignore
                                            } finally {
                                                setLoading(false);
                                            }
                                        }
                                    }}
                                    sx={{ minWidth: 150 }}
                                >
                                    <MenuItem value="popular">Most popular</MenuItem>
                                    <MenuItem value="newest">Newest</MenuItem>
                                </Select>
                            </FormControl>

                            <IconButton
                                onClick={() => {
                                    reset();
                                    onClose?.();
                                }}
                                aria-label="Close"
                                size="small"
                                sx={{
                                    width: 36,
                                    height: 36,
                                    bgcolor: '#fff',
                                    color: '#111827',
                                    border: '1px solid rgba(17,24,39,0.16)',
                                    boxShadow: '0 10px 24px rgba(2,6,23,0.14)',
                                    '&:hover': { bgcolor: '#fff' },
                                }}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>

                    {/* list */}
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1.25, bgcolor: '#fff' }}>
                        {error ? (
                            <Typography variant="body2" color="error" sx={{ pb: 1 }}>
                                {error}
                            </Typography>
                        ) : null}

                        {loading && (!comments || comments.length === 0) ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : null}

                        {!loading && (!comments || comments.length === 0) ? (
                            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                No comments yet.
                            </Typography>
                        ) : null}

                        {Array.isArray(comments)
                            ? comments.map((c) => {
                                const authorName =
                                    c?.name ||
                                    [c?.first_name, c?.last_name].filter(Boolean).join(' ') ||
                                    c?.handle ||
                                    'User';
                                const authorHandle = c?.handle ? `@${c.handle}` : '';
                                const authorAvatar = c?.avatar_url || c?.profile_picture || '';
                                const createdLabel = c?.created_at ? timeLabel(c.created_at) : '';
                                const likeCount = Number(c?.like_count || 0);
                                const viewerLiked = !!c?.viewer_liked;

                                const rawContent = String(c?.content || '');
                                const isExpanded = !!expandedMap?.[c?.id];
                                const canToggle = rawContent.length > TRUNCATE_AT;
                                const shown = !isExpanded && canToggle ? `${rawContent.slice(0, TRUNCATE_AT)}…` : rawContent;

                                const canDelete = (viewerIdSafe && Number(c?.user_id) === viewerIdSafe) || isOwner;

                                return (
                                    <Box key={c.id} sx={{ display: 'flex', gap: 1.25, py: 1 }}>
                                        <Avatar src={authorAvatar || undefined} alt={authorName} sx={{ width: 34, height: 34 }} />
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                                        <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                                                            {authorName}
                                                        </Typography>
                                                        {createdLabel ? (
                                                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                                {createdLabel}
                                                            </Typography>
                                                        ) : null}
                                                    </Box>
                                                    {authorHandle ? (
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            sx={{ fontWeight: 600, lineHeight: 1.2, mt: 0.15 }}
                                                        >
                                                            {authorHandle}
                                                        </Typography>
                                                    ) : null}

                                                </Box>

                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Button
                                                        size="small"
                                                        onClick={() => toggleLike(c.id)}
                                                        startIcon={viewerLiked ? <ThumbUpAltIcon /> : <ThumbUpOffAltOutlinedIcon />}
                                                        sx={{
                                                            textTransform: 'none',
                                                            minWidth: 0,
                                                            px: 1,
                                                            borderRadius: 999,
                                                        }}
                                                    >
                                                        {likeCount}
                                                    </Button>

                                                    {canDelete ? (
                                                        <Tooltip title="Delete Comment" placement="top">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => deleteComment(c.id)}
                                                                sx={{
                                                                    ml: 0.25,
                                                                    border: '1px solid rgba(2,6,23,0.10)',
                                                                    background: '#fff',
                                                                    '&:hover': { background: '#f8fafc' },
                                                                }}
                                                            >
                                                                <DeleteOutlineIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    ) : null}
                                                </Box>
                                            </Box>

                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    mt: 0.25,
                                                    whiteSpace: 'pre-wrap',
                                                    overflowWrap: 'anywhere',
                                                    wordBreak: 'break-word',
                                                }}
                                            >
                                                {shown}
                                            </Typography>

                                            {canToggle ? (
                                                <Button
                                                    variant="text"
                                                    size="small"
                                                    onClick={() => setExpandedMap((prev) => ({ ...(prev || {}), [c.id]: !prev?.[c.id] }))}
                                                    sx={{
                                                        mt: 0.25,
                                                        px: 0,
                                                        minWidth: 0,
                                                        textTransform: 'none',
                                                        fontWeight: 700,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {isExpanded ? 'less' : '...more'}
                                                </Button>
                                            ) : null}
                                        </Box>
                                    </Box>
                                );
                            })
                            : null}
                    </Box>

                    {/* composer */}
                    <Box
                        sx={{
                            px: 1.5,
                            py: 1.1,
                            borderTop: '1px solid rgba(2,6,23,0.08)',
                            background: '#fff',
                        }}
                    >
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Avatar
                                src={viewerAvatarUrl ? viewerAvatarUrl : undefined}
                                alt={viewerDisplayName}
                                sx={{ width: 34, height: 34 }}
                            />
                            <TextField
                                fullWidth
                                value={commentText}
                                onChange={(e) => {
                                    const v = e?.target?.value ?? '';
                                    setCommentText(v.length > 1000 ? v.slice(0, 1000) : v);
                                }}
                                placeholder="Write a comment…"
                                multiline
                                maxRows={4}
                                inputProps={{ maxLength: 1000 }}
                                onKeyDown={(e) => {
                                    // Enter = new line. Ctrl/Cmd + Enter = submit.
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        e.preventDefault();
                                        submit();
                                    }
                                }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                onClick={submit}
                                                disabled={!canSubmit}
                                                aria-label="Send"
                                                size="small"
                                            >
                                                <ArrowForwardRoundedIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.25, pr: 0.25 }}>
                            {`${String(commentText || '').length}/1000`}
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </Dialog>
    );
}

PhotoCommentsDialog.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    profileHandleOrId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    viewerId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    isOwner: PropTypes.bool,
};

export default function ProfileHeader({
                                          profile,
                                          avatarSrc,
                                          isMine,
                                          editMode,
                                          onEnterEdit,
                                          onSave,
                                          onCancel,
                                          onChangeAvatar,
                                          onDeleteAvatar,

                                          isFollowing,
                                          followRequested,
                                          isPrivateAccount,
                                          onToggleFollow,

                                          handleDraft,
                                          onHandleDraftChange,
                                          handleStats,
                                          handleError,

                                          firstNameDraft,
                                          lastNameDraft,
                                          onFirstNameDraftChange,
                                          onLastNameDraftChange,
                                          homeCityDraft,
                                          onHomeCityDraftChange,
                                          homeCountyDraft,
                                          onHomeCountyDraftChange,

                                          privacyDraft,
                                          onPrivacyDraftChange,

                                          stagedDeleteAvatar = false,
                                          viewerId,
                                          layout = 'full',
                                      }) {
    const isSidebar = layout === 'sidebar';
    const viewerIdSafe = Number(viewerId || 0);

    const [viewerProfile, setViewerProfile] = useState(null);

    const avatarUrl = stagedDeleteAvatar
        ? ''
        : (avatarSrc || profile?.avatar_url || profile?.profile_picture || '');

    const editDialogOpen = Boolean(isMine && editMode);

    const displayName =
        `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() ||
        profile?.display_name ||
        'User';

    const joinedIso = profile?.created_at || profile?.joined_at || profile?.createdAt || profile?.joinedAt || '';
    const joinedLabel = joinedIso ? formatLongDate(joinedIso) : '';

    const city = profile?.home_city || profile?.city || '';
    const countyRaw = profile?.home_county || profile?.county || '';
    const locationLabel = [String(city || '').trim(), normalizeCounty(countyRaw)].filter(Boolean).join(', ');
    const hasMetaLine = Boolean(joinedLabel || locationLabel);

    const containerSx = isSidebar ? { maxWidth: '100%', mx: 0, px: 0 } : { maxWidth: 1400, mx: 'auto', px: 2 };
    const AVATAR = isSidebar ? 88 : 120;

    const nextAllowed = isMine && editMode ? (handleStats?.nextAllowed ? new Date(handleStats.nextAllowed) : null) : null;
    const daysUntilNext =
        nextAllowed && nextAllowed.getTime() > Date.now()
            ? Math.max(1, Math.ceil((nextAllowed.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
            : 0;

    const usernameBlocked = Boolean(isMine && editMode && handleStats && handleStats.remaining <= 0 && daysUntilNext > 0);

    const antiFillAttrs = {
        autoComplete: 'off',
        'data-1p-ignore': 'true',
        'data-lpignore': 'true',
    };

    const editableOnFocus = (e) => {
        if (e?.target?.hasAttribute('readonly')) e.target.removeAttribute('readonly');
    };

    const privacyValue = privacyDraft === 'private' ? 'private' : 'public';
    const privacyHelp =
        privacyValue === 'private'
            ? 'Your profile can be viewed by followers only. People can request to follow you.'
            : 'Your profile can be viewed by the public.';

    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [photoCommentsOpen, setPhotoCommentsOpen] = useState(false);

    const openAvatar = useCallback(() => {
        if (!avatarUrl) return;
        if (editMode) return;
        setLightboxOpen(true);
    }, [avatarUrl, editMode]);

    const openPhotoComments = useCallback(() => {
        const handleOrId = profile?.handle || profile?.public_id || profile?.id;
        if (!handleOrId) return;
        setPhotoCommentsOpen(true);
    }, [profile]);

    const followButton = useMemo(() => {
        if (isMine) return null;

        if (isPrivateAccount && !isFollowing) {
            const label = followRequested ? 'Request Sent' : 'Follow';
            return (
                <Button
                    variant={followRequested ? 'outlined' : 'contained'}
                    startIcon={<PersonAddAlt1Icon />}
                    disabled={followRequested}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFollow?.();
                    }}
                    sx={{ textTransform: 'none' }}
                >
                    {label}
                </Button>
            );
        }

        return (
            <Button
                variant={isFollowing ? 'outlined' : 'contained'}
                startIcon={<PersonAddAlt1Icon />}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleFollow?.();
                }}
                sx={{ textTransform: 'none' }}
            >
                {isFollowing ? 'Unfollow' : 'Follow'}
            </Button>
        );
    }, [followRequested, isFollowing, isMine, isPrivateAccount, onToggleFollow]);

    const avatarControls = isMine && editDialogOpen ? (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
            <Button
                size="small"
                startIcon={<EditIcon fontSize="small" />}
                onClick={(e) => {
                    e.stopPropagation();
                    onChangeAvatar?.();
                }}
                sx={{ textTransform: 'none' }}
            >
                Change picture
            </Button>
            {avatarUrl ? (
                <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineIcon fontSize="small" />}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAvatar?.();
                    }}
                    sx={{ textTransform: 'none' }}
                >
                    Delete picture
                </Button>
            ) : null}
        </Box>
    ) : null;

    const cityDraft = String(homeCityDraft || '').trim();
    const countyDraft = normalizeCountyDraft(homeCountyDraft || '');
    const CREAM_INPUT_SX = useMemo(
        () => ({
            '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: '#FFFFFF' },
            '& .MuiInputLabel-root': { fontWeight: 650 },
        }),
        []
    );

    const WHITE_AUTOCOMPLETE_SLOTS = useMemo(
        () => ({
            popper: {
                sx: {
                    '& .MuiPaper-root': { backgroundColor: '#fff !important', backgroundImage: 'none !important' },
                    '& .MuiAutocomplete-listbox': { backgroundColor: '#fff !important' },
                },
            },
            paper: { sx: { backgroundColor: '#fff !important', backgroundImage: 'none !important' } },
            listbox: { sx: { backgroundColor: '#fff !important' } },
        }),
        []
    );

    const allCountyNames = useMemo(() => {
        const arr = Array.isArray(cityCountyMap) ? cityCountyMap : [];
        const norm = (n) => String(n || '').replace(/\s*County\s*$/i, '').trim();
        return Array.from(new Set(arr.map((c) => norm(c?.county)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }, []);

    const allCityNames = useMemo(() => {
        const arr = Array.isArray(cityCountyMap) ? cityCountyMap : [];
        return Array.from(new Set(arr.map((c) => String(c?.name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }, []);

    const countyByCityLower = useMemo(() => {
        const map = new Map();
        const arr = Array.isArray(cityCountyMap) ? cityCountyMap : [];
        arr.forEach((row) => {
            const city = String(row?.name || '').trim();
            const county = String(row?.county || '').trim();
            if (!city || !county) return;
            map.set(city.toLowerCase(), normalizeCountyDraft(county));
        });
        return map;
    }, []);

    // Auto-populate county when city is selected (matches Community filter behavior)
    useEffect(() => {
        if (!editDialogOpen) return;
        if (!cityDraft) return;
        const mapped = countyByCityLower.get(cityDraft.toLowerCase());
        if (!mapped) return;
        if (!countyDraft || countyDraft.toLowerCase() !== String(mapped).toLowerCase()) {
            onHomeCountyDraftChange?.(mapped);
        }
    }, [editDialogOpen, cityDraft, countyDraft, countyByCityLower, onHomeCountyDraftChange]);

    const isCityProvided = cityDraft.length > 0;
    const isCountyProvided = countyDraft.length > 0;

    const isValidCounty = useMemo(() => {
        if (!isCountyProvided) return true;
        const norm = countyDraft.toLowerCase();
        const list = allCountyNames.length ? allCountyNames : ALABAMA_COUNTIES;
        return list.some((c) => String(c).toLowerCase() === norm);
    }, [allCountyNames, countyDraft, isCountyProvided]);

    const isValidCity = useMemo(() => {
        if (!isCityProvided) return true;
        const norm = cityDraft.toLowerCase();
        return allCityNames.length ? allCityNames.some((c) => String(c).toLowerCase() === norm) : true;
    }, [allCityNames, cityDraft, isCityProvided]);

    const cityErrorText = useMemo(() => {
        if (!editDialogOpen) return '';
        if (!isCityProvided) return '';
        if (!isValidCity) return 'Invalid Alabama City';
        return '';
    }, [editDialogOpen, isCityProvided, isValidCity]);

    const countyErrorText = useMemo(() => {
        if (!editDialogOpen) return '';
        if (!isCityProvided && !isCountyProvided) return '';
        if (isCityProvided && !isCountyProvided) return 'County is required when a city is entered.';
        if (!isValidCounty) return 'Invalid Alabama County';
        return '';
    }, [editDialogOpen, isCityProvided, isCountyProvided, isValidCounty]);

    const canSaveLocation = useMemo(() => {
        if (!editDialogOpen) return true;
        if (!isCityProvided && !isCountyProvided) return true;
        if (isCityProvided && !isValidCity) return false;
        if (isCityProvided && !isCountyProvided) return false;
        if (isCountyProvided && !isValidCounty) return false;
        return true;
    }, [editDialogOpen, isCityProvided, isCountyProvided, isValidCity, isValidCounty]);

    const LocationControl = isMine && editDialogOpen ? (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Location (optional)
            </Typography>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1,
                }}
            >
                {/* City */}
                <Autocomplete
                    key="profile-city"
                    size="small"
                    slotProps={WHITE_AUTOCOMPLETE_SLOTS}
                    freeSolo
                    options={allCityNames}
                    value={cityDraft}
                    onChange={(_, val) => {
                        onHomeCityDraftChange?.(String(val || '').trim());
                    }}
                    onInputChange={(_, val) => {
                        onHomeCityDraftChange?.(String(val || ''));
                    }}
                    openOnFocus
                    renderInput={(p) => (
                        <TextField
                            {...p}
                            label="City"
                            fullWidth
                            error={Boolean(cityErrorText)}
                            helperText={cityErrorText || ' '}
                            sx={CREAM_INPUT_SX}
                            autoComplete="new-password"
                            inputProps={{
                                ...p.inputProps,
                                ...antiFillAttrs,
                                name: 'll_profile_city',
                                id: 'll_profile_city',
                                autoComplete: 'new-password',
                            }}
                        />
                    )}
                    clearOnEscape
                    autoHighlight
                    filterSelectedOptions
                />

                {/* County */}
                <Autocomplete
                    key="profile-county"
                    size="small"
                    slotProps={WHITE_AUTOCOMPLETE_SLOTS}
                    freeSolo
                    options={allCountyNames}
                    value={countyDraft}
                    onChange={(_, val) => {
                        onHomeCountyDraftChange?.(normalizeCountyDraft(String(val || '')));
                    }}
                    onInputChange={(_, val) => {
                        onHomeCountyDraftChange?.(normalizeCountyDraft(String(val || '')));
                    }}
                    openOnFocus
                    renderInput={(p) => (
                        <TextField
                            {...p}
                            label="County"
                            fullWidth
                            error={Boolean(countyErrorText)}
                            helperText={countyErrorText || ' '}
                            sx={CREAM_INPUT_SX}
                            autoComplete="new-password"
                            inputProps={{
                                ...p.inputProps,
                                ...antiFillAttrs,
                                name: 'll_profile_county',
                                id: 'll_profile_county',
                                autoComplete: 'new-password',
                            }}
                        />
                    )}
                    clearOnEscape
                    autoHighlight
                    filterSelectedOptions
                />
            </Box>
        </Box>
    ) : null;

    const PrivacyControl = isMine && editDialogOpen ? (
        <Box sx={{ display: 'grid', gap: 0.6, mt: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <LockRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Privacy
                </Typography>
            </Box>

            <FormControl size="small" sx={{ width: { xs: '100%', sm: 260 } }}>
                <Select value={privacyValue} onChange={(e) => onPrivacyDraftChange?.(e.target.value)} sx={{ bgcolor: '#fff' }}>
                    <MenuItem value="public">Public</MenuItem>
                    <MenuItem value="private">Followers only</MenuItem>
                </Select>
                <FormHelperText>{privacyHelp}</FormHelperText>
            </FormControl>
        </Box>
    ) : null;

    const NameAndHandleView = (
        <>
            <Typography
                variant={isSidebar ? 'h6' : 'h5'}
                sx={{
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {displayName}
            </Typography>

            {profile?.handle ? (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    @{profile.handle}
                </Typography>
            ) : (
                <Chip size="small" label="No username" sx={{ mt: 0.35, bgcolor: '#eef2ff' }} />
            )}
        </>
    );

    const NamesAndUsernameEdit = (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1,
                maxWidth: 680,
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
                sx={{ '& .MuiInputBase-root': { bgcolor: '#fff' } }}
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
                sx={{ '& .MuiInputBase-root': { bgcolor: '#fff' } }}
            />

            <TextField
                size="small"
                label="Username"
                value={handleDraft || ''}
                onChange={(e) => onHandleDraftChange?.(e.target.value.replace(/^@+/, '').replace(/\s+/g, ''))}
                inputProps={{ maxLength: 30 }}
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
                sx={{ gridColumn: { xs: '1 / -1', sm: '1 / span 2' }, maxWidth: { md: 420 }, '& .MuiInputBase-root': { bgcolor: '#fff' } }}
                fullWidth
            />

            <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / span 2' }, display: 'grid', gap: 1.1, mt: 0.25 }}>
                {LocationControl}
                {PrivacyControl}
            </Box>
        </Box>
    );

    const ActionsBlock = (
        <Box
            sx={{
                display: 'flex',
                gap: 1,
                justifyContent: { xs: 'flex-end', md: 'flex-end' },
                alignItems: 'center',
                flexWrap: 'wrap',
                minHeight: 40,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {isMine ? (
                <Button
                    startIcon={<EditIcon />}
                    variant="outlined"
                    onClick={() => {
                        if (!editDialogOpen) onEnterEdit?.();
                    }}
                    disabled={editDialogOpen}
                    sx={{ textTransform: 'none', borderRadius: 999, bgcolor: '#fff' }}
                >
                    Edit Profile
                </Button>
            ) : (
                followButton
            )}

            {/* Photo comments button */}
        </Box>
    );

    const handleEditDialogClose = (_e, reason) => {
        if (reason === 'backdropClick') return;
        onCancel?.();
    };

    const HeaderAvatarOnly = (
        <Box sx={{ p: { xs: 1.25, sm: 2 }, pb: { xs: 2, sm: 2.25 } }}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'auto 1fr auto', md: 'auto 1fr auto' },
                    alignItems: { xs: 'flex-start', md: 'center' },
                    columnGap: { xs: 1.25, sm: 2 },
                    rowGap: 1,
                }}
            >
                <Box
                    sx={{ width: AVATAR, minWidth: AVATAR, cursor: avatarUrl && !editMode ? 'pointer' : 'default' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        openPhotoComments();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            openPhotoComments();
                        }
                    }}
                    role={avatarUrl && !editMode ? 'button' : undefined}
                    tabIndex={avatarUrl && !editMode ? 0 : undefined}
                >
                    <Avatar
                        src={avatarUrl || undefined}
                        alt={displayName}
                        sx={{
                            bgcolor: 'grey.600',
                            width: AVATAR,
                            height: AVATAR,
                            border: '4px solid #fff',
                            boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
                        }}
                    />
                </Box>

                <Box sx={{ minWidth: 0, mt: editMode ? 1 : 0 }}>
                    {NameAndHandleView}

                    {hasMetaLine ? (
                        <MetaPill locationLabel={locationLabel} joinedLabel={joinedLabel} />
                    ) : null}
                </Box>

                {ActionsBlock}
            </Box>
        </Box>
    );

    const profileHandleOrId = profile?.handle || profile?.public_id || profile?.id;

    return (
        <>
            <Box sx={{ ...containerSx, mb: { xs: 2, md: 2.5 } }}>
                <Card
                    variant="outlined"
                    sx={{
                        borderRadius: 2,
                        overflow: 'hidden',
                        position: 'relative',
                        borderColor: 'rgba(2,6,23,0.08)',
                        boxShadow: '0 6px 20px rgba(2,6,23,0.08)',
                        bgcolor: '#fff',
                    }}
                >
                    {HeaderAvatarOnly}
                </Card>

                {isMine ? (
                    <Dialog
                        open={editDialogOpen}
                        onClose={handleEditDialogClose}
                        fullWidth
                        maxWidth="sm"
                        PaperProps={{
                            sx: {
                                borderRadius: 2,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                maxHeight: '92vh',
                            },
                        }}
                    >
                        <Box sx={{ position: 'relative', px: 2, pt: 2, pb: 1, flexShrink: 0, bgcolor: '#fff' }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, pr: 5 }}>
                                Edit Profile
                            </Typography>
                            <IconButton
                                aria-label="Close"
                                onClick={() => onCancel?.()}
                                sx={{ position: 'absolute', top: 10, right: 10 }}
                            >
                                <CloseIcon />
                            </IconButton>
                        </Box>
                        <Divider />

                        <Box component="form" autoComplete="off" onSubmit={(e) => e.preventDefault()} sx={{ px: 2, py: 2, overflowY: 'auto', flex: 1 }}>
                            <Box sx={{ display: 'grid', gap: 1.25 }}>
                                {/* Profile picture */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                    <Box
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openAvatar();
                                        }}
                                        role={avatarUrl ? 'button' : undefined}
                                        tabIndex={avatarUrl ? 0 : undefined}
                                        onKeyDown={(e) => {
                                            if (!avatarUrl) return;
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.stopPropagation();
                                                openAvatar();
                                            }
                                        }}
                                        sx={{ cursor: avatarUrl && !editMode ? 'pointer' : 'default' }}
                                    >
                                        <Avatar
                                            src={avatarUrl || undefined}
                                            alt={displayName}
                                            sx={{
                                                width: 64,
                                                height: 64,
                                                bgcolor: 'grey.600',
                                                border: '2px solid #fff',
                                                boxShadow: '0 8px 22px rgba(0,0,0,0.18)',
                                            }}
                                        />
                                    </Box>
                                    {avatarControls}
                                </Box>

                                <Divider sx={{ my: 0.5 }} />

                                {NamesAndUsernameEdit}
                            </Box>
                        </Box>

                        <Divider />
                        <Box
                            sx={{
                                px: 2,
                                py: 1.5,
                                display: 'flex',
                                gap: 1,
                                justifyContent: 'flex-end',
                                flexWrap: 'wrap',
                                flexShrink: 0,
                                bgcolor: '#fff',
                            }}
                        >
                            <Button startIcon={<CloseIcon />} onClick={() => onCancel?.()} sx={{ textTransform: 'none' }}>
                                Close
                            </Button>
                            <Button
                                startIcon={<SaveIcon />}
                                variant="contained"
                                onClick={() => {
                                    if (canSaveLocation) onSave?.();
                                }}
                                disabled={!canSaveLocation}
                                sx={{ textTransform: 'none' }}
                            >
                                Save
                            </Button>
                        </Box>
                    </Dialog>
                ) : null}
            </Box>

            <AvatarLightbox open={lightboxOpen} onClose={() => setLightboxOpen(false)} src={avatarUrl} alt={displayName} />

            <PhotoCommentsDialog
                open={photoCommentsOpen}
                onClose={() => setPhotoCommentsOpen(false)}
                profileHandleOrId={profileHandleOrId}
                viewerId={viewerIdSafe}
                isOwner={!!isMine}
            />
        </>
    );
}

ProfileHeader.propTypes = {
    viewerId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    profile: PropTypes.object,
    avatarSrc: PropTypes.string,
    isMine: PropTypes.bool,
    editMode: PropTypes.bool,
    onEnterEdit: PropTypes.func,
    onSave: PropTypes.func,
    onCancel: PropTypes.func,
    onChangeAvatar: PropTypes.func,
    onDeleteAvatar: PropTypes.func,

    isFollowing: PropTypes.bool,
    followRequested: PropTypes.bool,
    isPrivateAccount: PropTypes.bool,
    onToggleFollow: PropTypes.func,

    handleDraft: PropTypes.string,
    onHandleDraftChange: PropTypes.func,
    handleStats: PropTypes.object,
    handleError: PropTypes.string,

    firstNameDraft: PropTypes.string,
    lastNameDraft: PropTypes.string,
    onFirstNameDraftChange: PropTypes.func,
    onLastNameDraftChange: PropTypes.func,

    homeCityDraft: PropTypes.string,
    onHomeCityDraftChange: PropTypes.func,
    homeCountyDraft: PropTypes.string,
    onHomeCountyDraftChange: PropTypes.func,

    privacyDraft: PropTypes.string,
    onPrivacyDraftChange: PropTypes.func,

    stagedDeleteAvatar: PropTypes.bool,
    layout: PropTypes.oneOf(['full', 'sidebar']),
};
