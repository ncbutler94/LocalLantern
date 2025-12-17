// src/components/SidePanel/Business/BusinessPhotoCarousel.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Paper,
    IconButton,
    MobileStepper,
    Tooltip,
} from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';

function asMedia(items = []) {
    return (Array.isArray(items) ? items : [])
        .filter(Boolean)
        .map((m) => ({
            id: m.id ?? null,
            type: (m.type || (m.url?.match(/\.(mp4|webm|ogg)(\?.*)?$/i) ? 'video' : 'photo')) || 'photo',
            url: m.url || '',
            caption: m.caption || '',
        }));
}

/**
 * A compact, professional slideshow for the Business right rail.
 * - Autoplays with gentle timing (4s)
 * - Manual navigation via arrows
 * - Dots indicator via MobileStepper
 * - Fixed "Goldilocks" height (responsive), content cover-fitted
 */
export default function BusinessPhotoCarousel({
                                                  items = [],
                                                  onOpen,           // (index) => void (to open lightbox)
                                                  autoPlay = true,
                                                  intervalMs = 4000,
                                              }) {
    const slides = useMemo(() => asMedia(items), [items]);
    const [idx, setIdx] = useState(0);

    const prev = () => setIdx((i) => (i - 1 + slides.length) % slides.length);
    const next = () => setIdx((i) => (i + 1) % slides.length);

    // Autoplay
    const timerRef = useRef(null);
    useEffect(() => {
        if (!autoPlay || slides.length < 2) return;
        timerRef.current = setInterval(next, intervalMs);
        return () => clearInterval(timerRef.current);
    }, [autoPlay, intervalMs, slides.length]);

    if (!slides.length) {
        return (
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                No photos yet.
            </Paper>
        );
    }

    const s = slides[idx];

    return (
        <Paper
            variant="outlined"
            sx={{
                borderRadius: 2,
                overflow: 'hidden',
                position: 'relative',
                // "Goldilocks" height — compact but spacious
                height: { xs: 220, sm: 260 },
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'center',
                bgcolor: 'grey.50',
            }}
        >
            {/* Media */}
            <Box
                onClick={() => onOpen?.(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen?.(idx)}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                }}
            >
                {s.type === 'video' ? (
                    <Box
                        component="video"
                        src={s.url}
                        controls
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <Box
                        component="img"
                        src={s.url}
                        alt={s.caption || ''}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                )}
            </Box>

            {/* Nav arrows */}
            {slides.length > 1 && (
                <>
                    <Tooltip title="Previous">
                        <IconButton
                            onClick={(e) => { e.stopPropagation(); prev(); }}
                            size="small"
                            sx={{
                                position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)',
                                bgcolor: 'rgba(0,0,0,0.45)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' }
                            }}
                            aria-label="Previous"
                        >
                            <ChevronLeftRoundedIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Next">
                        <IconButton
                            onClick={(e) => { e.stopPropagation(); next(); }}
                            size="small"
                            sx={{
                                position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)',
                                bgcolor: 'rgba(0,0,0,0.45)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' }
                            }}
                            aria-label="Next"
                        >
                            <ChevronRightRoundedIcon />
                        </IconButton>
                    </Tooltip>
                </>
            )}

            {/* Dots */}
            {slides.length > 1 && (
                <MobileStepper
                    variant="dots"
                    steps={slides.length}
                    position="static"
                    activeStep={idx}
                    nextButton={<span />}
                    backButton={<span />}
                    sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        bgcolor: 'rgba(255,255,255,0.85)',
                        '& .MuiMobileStepper-dotActive': { bgcolor: 'primary.main' },
                    }}
                />
            )}
        </Paper>
    );
}
