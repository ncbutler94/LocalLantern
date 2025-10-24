// src/components/SidePanel/Business/BusinessDetail/BusinessMediaLightbox.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, IconButton, Typography, Stack, CircularProgress, Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ShareIcon from '@mui/icons-material/Share';

import { getMediaLikes, toggleMediaLike } from '../../../../api/business/businessApi';
import MediaCommentPanel from './MediaCommentPanel';

export default function BusinessMediaLightbox({ items = [], index = 0, onClose, user }) {
    const [idx, setIdx] = useState(index);
    const item = items[idx] || null;

    const [likeInfo, setLikeInfo] = useState({ liked: false, count: 0 });
    const [loadingLikes, setLoadingLikes] = useState(false);

    const canPrev = idx > 0;
    const canNext = idx < items.length - 1;

    // Load like state for current item
    useEffect(() => {
        let alive = true;
        const ac = new AbortController();
        if (!item?.id) { setLikeInfo({ liked: false, count: 0 }); return; }
        (async () => {
            setLoadingLikes(true);
            try {
                const j = await getMediaLikes(item.id, { signal: ac.signal });
                if (alive) setLikeInfo({ liked: !!j?.liked, count: Number(j?.count || 0) });
            } catch {
                if (alive) setLikeInfo({ liked: false, count: 0 });
            } finally {
                if (alive) setLoadingLikes(false);
            }
        })();
        return () => { alive = false; ac.abort(); };
    }, [item?.id]);

    const toggleLike = async () => {
        if (!item?.id) return;
        try {
            const j = await toggleMediaLike(item.id);
            setLikeInfo({ liked: !!j?.liked, count: Number(j?.count || 0) });
        } catch {}
    };

    // keyboard
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
            if (e.key === 'ArrowLeft' && canPrev) setIdx((i) => Math.max(0, i - 1));
            if (e.key === 'ArrowRight' && canNext) setIdx((i) => Math.min(items.length - 1, i + 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [canPrev, canNext, items.length, onClose]);

    const mediaEl = useMemo(() => {
        if (!item) return null;
        if (item.type === 'video') {
            return (
                <video
                    src={item.url}
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
            );
        }
        return (
            <img
                src={item.url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
        );
    }, [item]);

    return (
        <Box sx={{
            position: 'fixed', inset: 0, zIndex: 1300,
            bgcolor: 'rgba(10,14,20,0.92)', color: '#fff',
            display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        }}>
            {/* Left viewer */}
            <Box sx={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'stretch', justifyContent: 'center', position: 'relative'
            }}>
                {/* Top bar */}
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 1, py: 0.5,
                }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ color: 'white' }}>
                            <CloseIcon />
                        </IconButton>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                        <Tooltip title={likeInfo.liked ? 'Unlike' : 'Like'}>
              <span>
                <IconButton onClick={toggleLike} disabled={loadingLikes} sx={{ color: 'white' }} size="small">
                  {likeInfo.liked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                </IconButton>
              </span>
                        </Tooltip>
                        <Typography variant="body2">{likeInfo.count}</Typography>

                        {/* Share placeholder (logic later) */}
                        <IconButton sx={{ color: 'white' }} size="small"><ShareIcon /></IconButton>
                    </Stack>
                </Box>

                {/* Media */}
                <Box sx={{ position: 'absolute', inset: 0, p: { xs: 0, md: 2 } }}>
                    <Box sx={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {mediaEl || <CircularProgress color="inherit" />}
                    </Box>
                </Box>

                {/* Nav arrows */}
                {canPrev && (
                    <IconButton
                        onClick={() => setIdx((i) => Math.max(0, i - 1))}
                        sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', color: '#fff' }}
                        aria-label="Previous"
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                )}
                {canNext && (
                    <IconButton
                        onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
                        sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', color: '#fff' }}
                        aria-label="Next"
                    >
                        <ChevronRightIcon />
                    </IconButton>
                )}
            </Box>

            {/* Right comments panel */}
            <Box sx={{ width: { xs: 0, md: 360 }, display: { xs: 'none', md: 'block' }, bgcolor: 'background.paper', color: 'text.primary' }}>
                {item?.id ? (
                    <MediaCommentPanel mediaId={item.id} user={user} />
                ) : (
                    <Box sx={{ p: 2 }}><Typography variant="body2">No media selected.</Typography></Box>
                )}
            </Box>
        </Box>
    );
}
