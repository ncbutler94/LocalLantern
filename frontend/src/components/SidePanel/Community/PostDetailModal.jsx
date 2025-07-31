// src/components/SidePanel/Community/PostDetailModal.jsx
// ==========================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
    Dialog,
    DialogContent,
    Box,
    Typography,
    Avatar,
    IconButton,
    Button,
    TextField,
    Paper,
} from '@mui/material';
import CloseIcon        from '@mui/icons-material/Close';
import SendIcon         from '@mui/icons-material/Send';
import FavoriteIcon     from '@mui/icons-material/Favorite';
import ShareIcon        from '@mui/icons-material/Share';
import CommentIcon      from '@mui/icons-material/ChatBubbleOutline';
import ArrowBackIosNew  from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIos  from '@mui/icons-material/ArrowForwardIos';

import CampaignIcon     from '@mui/icons-material/Campaign';
import ChatBubbleIcon   from '@mui/icons-material/ChatBubble';
import ReportIcon       from '@mui/icons-material/Report';
import LightbulbIcon    from '@mui/icons-material/Lightbulb';
import PanToolIcon      from '@mui/icons-material/PanTool';
import SearchIcon       from '@mui/icons-material/Search';

/*──────────── helpers ───────────*/
const timeAgo = (d = '') => {
    const diff = Date.now() - new Date(d).getTime();
    const s  = Math.floor(diff / 1000); if (s < 60) return `${s}s ago`;
    const m  = Math.floor(s / 60);      if (m < 60) return `${m}m ago`;
    const h  = Math.floor(m / 60);      if (h < 24) return `${h}h ago`;
    const d2 = Math.floor(h / 24);      if (d2 < 30) return `${d2}d ago`;
    const mo = Math.floor(d2 / 30);     if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};

/*──────────── consolidated pill palette (same as list) ───────────*/
const PILL = {
    announcement:               { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements:              { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },

    discussion:                 { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion':       { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },

    recommendation:             { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips':     { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },

    volunteer:                  { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help':           { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests':  { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests':       { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },

    'lost-found':               { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },

    alert:                      { label: 'Alert',        color: '#e53935', Icon: ReportIcon },
    'public-safety-alerts':     { label: 'Alert',        color: '#e53935', Icon: ReportIcon },
};

/*──────────── Pill component ───────────*/
const Pill = ({ label, Icon, color }) => (
    <Box sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        bgcolor: color,
        color: '#fff',
        borderRadius: 12,
        fontSize: '0.75rem',
        fontWeight: 600,
        width: 'max-content',          // keep it only as wide as needed
    }}>
        <Icon sx={{ fontSize: 14 }} />
        {label}
    </Box>
);

/*──────────── Loader overlay (three‑dot bounce) ───────────*/
const LoaderOverlay = ({ onClose }) => (
    <Box sx={{
        position: 'absolute',
        inset: 0,
        bgcolor: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: theme => theme.zIndex.modal + 1,
        borderRadius: 1,
    }}>
        <Box sx={{
            display: 'flex',
            gap: 1,
            '@keyframes bounce': {
                '0%, 80%, 100%': { transform: 'scale(0)' },
                '40%':           { transform: 'scale(1.0)' },
            },
        }}>
            {[0, 1, 2].map(i => (
                <Box
                    key={i}
                    sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        animation: 'bounce 1.4s infinite ease-in-out',
                        animationDelay: `${i * 0.2}s`,
                    }}
                />
            ))}
        </Box>

        <IconButton
            onClick={onClose}
            sx={{ position: 'absolute', top: 8, right: 8 }}
            aria-label="close"
        >
            <CloseIcon />
        </IconButton>
    </Box>
);

/*──────────── Gallery (unchanged) ───────────*/
function Gallery({ pics, idx, setIdx, height, onImgLoad }) {
    if (!pics.length) return null;

    return (
        <>
            <Box sx={{
                position: 'relative', width: '100%', height, overflow: 'hidden',
                '&:hover .nav-btn': { opacity: 1 },
            }}>
                <Box
                    component="img"
                    src={pics[idx]}
                    alt=""
                    onLoad={onImgLoad}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 2 }}
                />

                {pics.length > 1 && (
                    <>
                        <IconButton
                            className="nav-btn"
                            size="small"
                            disabled={idx === 0}
                            onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}
                            sx={{
                                position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)',
                                bgcolor: '#fff', opacity: 0, transition: 'opacity .2s',
                            }}
                        >
                            <ArrowBackIosNew fontSize="small" />
                        </IconButton>
                        <IconButton
                            className="nav-btn"
                            size="small"
                            disabled={idx === pics.length - 1}
                            onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}
                            sx={{
                                position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)',
                                bgcolor: '#fff', opacity: 0, transition: 'opacity .2s',
                            }}
                        >
                            <ArrowForwardIos fontSize="small" />
                        </IconButton>
                    </>
                )}
            </Box>

            {pics.length > 1 && (
                <Box sx={{ display: 'flex', gap: 1, mt: 1, overflowX: 'auto', pb: 0.5 }}>
                    {pics.map((src, i) => (
                        <Box
                            key={src}
                            component="img"
                            src={src}
                            alt=""
                            onClick={e => { e.stopPropagation(); setIdx(i); }}
                            sx={{
                                width: 60, height: 60, objectFit: 'cover', borderRadius: 1, cursor: 'pointer',
                                border: i === idx ? 2 : 1, borderColor: i === idx ? 'primary.main' : 'divider',
                                flexShrink: 0,
                            }}
                        />
                    ))}
                </Box>
            )}
        </>
    );
}

/*──────────── Main component ───────────*/
export default function PostDetailModal({ open, post, onClose, currentUser }) {
    /* ---------- de‑structure post ---------- */
    const {
        first_name = '', last_name = '', avatar_url = '', date_created = '',
        title = '', description = '', category = '', lost_or_found = '',
        photos = [], likesCount = 0, viewerLiked = false,
        commentsCount = 0, sharesCount = 0,
    } = post ?? {};

    const pics = photos.filter(Boolean);

    /* ---------- loading state ---------- */
    const [allLoaded, setAllLoaded] = useState(false);
    useEffect(() => { if (open) setAllLoaded(pics.length === 0); }, [open, pics.length]);
    const handleImgLoad = useCallback(() => setAllLoaded(true), []);

    /* ---------- gallery/light‑box state ---------- */
    const [idx, setIdx] = useState(0);
    useEffect(() => { if (!open) setIdx(0); }, [open]);
    const [lightbox, setLightbox] = useState(false);

    /* ---------- comment composer ---------- */
    const [comment, setComment] = useState('');
    const inputRef = useRef(null);
    const focusComposer = () => inputRef.current?.focus();

    /* ---------- badge meta ---------- */
    const badge = (() => {
        if (category === 'public-safety-alerts')
            return PILL['public-safety-alerts'];
        if (lost_or_found)
            return {
                label: lost_or_found === 'found' ? 'Found' : 'Lost',
                color: '#fb8c00',
                Icon: SearchIcon,
            };
        return PILL[category] ?? {
            label: category || 'Other',
            color: '#777',
            Icon: ReportIcon,
        };
    })();

    /* ---------- close handling ---------- */
    const handleClose = (_, reason) => { if (reason !== 'backdropClick') onClose(); };
    if (!open || !post) return null;

    /* ---------- render ---------- */
    return (
        <>
            {/* ============ primary dialog ============ */}
            <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
                <DialogContent sx={{ p: 0, position: 'relative' }}>
                    {!allLoaded && <LoaderOverlay onClose={onClose} />}

                    <Box sx={{
                        maxHeight: '60vh',
                        overflowY: 'auto',
                        p: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                    }}>
                        {/* header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Avatar src={avatar_url}>{first_name[0]}</Avatar>
                            <Box>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    {first_name} {last_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {timeAgo(date_created)}
                                </Typography>
                            </Box>
                        </Box>

                        {title && (
                            <Typography variant="h5" fontWeight={700}>
                                {title}
                            </Typography>
                        )}
                        <Pill {...badge} />

                        {/* body */}
                        <Box sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', md: 'row' },
                            gap: 3,
                        }}>
                            <Typography variant="body1" sx={{
                                whiteSpace: 'pre-line',
                                flex: 1,
                                maxWidth: { md: 'calc(100% - 320px)' },
                            }}>
                                {description}
                            </Typography>

                            {pics.length > 0 && (
                                <Box
                                    sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}
                                    onClick={() => setLightbox(true)}
                                >
                                    <Gallery
                                        pics={pics}
                                        idx={idx}
                                        setIdx={setIdx}
                                        height={260}
                                        onImgLoad={handleImgLoad}
                                    />
                                </Box>
                            )}
                        </Box>
                    </Box>

                    {/* footer */}
                    <Paper elevation={0} sx={{ px: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                        {/* actions */}
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Button
                                startIcon={<FavoriteIcon color={viewerLiked ? 'error' : 'action'} />}
                                sx={{ textTransform: 'none', minWidth: 64 }}
                            >
                                {likesCount}
                            </Button>
                            <Button
                                startIcon={<CommentIcon />}
                                sx={{ textTransform: 'none', minWidth: 64 }}
                                onClick={focusComposer}
                            >
                                {commentsCount}
                            </Button>
                            <Button
                                startIcon={<ShareIcon />}
                                sx={{ textTransform: 'none', minWidth: 64 }}
                            >
                                {sharesCount}
                            </Button>
                        </Box>

                        {/* composer */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <Avatar src={currentUser?.profile_picture || currentUser?.avatar_url}>
                                {currentUser?.first_name?.[0]}
                            </Avatar>
                            <Box sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'flex-end',
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 2,
                                px: 1,
                            }}>
                                <TextField
                                    multiline
                                    fullWidth
                                    variant="standard"
                                    placeholder="Leave a comment"
                                    InputProps={{ disableUnderline: true }}
                                    inputRef={inputRef}
                                    value={comment}
                                    onChange={e => setComment(e.target.value.slice(0, 1000))}
                                    minRows={1}
                                    maxRows={5}
                                    sx={{ flex: 1 }}
                                />
                                <IconButton color="primary" disabled={comment.trim() === ''}>
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, mb: 2 }}>
                            <Button onClick={onClose} variant="outlined">
                                Close
                            </Button>
                        </Box>
                    </Paper>
                </DialogContent>
            </Dialog>

            {/* ============ light‑box dialog ============ */}
            <Dialog open={lightbox} onClose={() => setLightbox(false)} maxWidth="lg" fullWidth>
                <DialogContent
                    sx={{ p: 2, bgcolor: 'grey.900', position: 'relative' }}
                    onClick={() => setLightbox(false)}
                >
                    <IconButton
                        onClick={() => setLightbox(false)}
                        sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', zIndex: 2 }}
                    >
                        <CloseIcon />
                    </IconButton>

                    <Box sx={{ maxWidth: '100%', mx: 'auto' }}>
                        <Gallery
                            pics={pics}
                            idx={idx}
                            setIdx={setIdx}
                            height="80vh"
                            onImgLoad={() => {}}
                        />
                    </Box>
                </DialogContent>
            </Dialog>
        </>
    );
}

PostDetailModal.propTypes = {
    open:       PropTypes.bool.isRequired,
    post:       PropTypes.object,
    onClose:    PropTypes.func.isRequired,
    currentUser: PropTypes.shape({
        profile_picture: PropTypes.string,
        avatar_url:      PropTypes.string,
        first_name:      PropTypes.string,
    }),
};
