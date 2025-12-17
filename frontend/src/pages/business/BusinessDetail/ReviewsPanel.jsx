// src/components/SidePanel/Business/BusinessDetail/ReviewsPanel.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
    Box, Typography, IconButton, Stack, Rating, Button, TextField, Avatar,
    Divider, Fade, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto';
import DeleteIcon from '@mui/icons-material/Delete';

import { getReviews, createOrUpdateReview, deleteMyReview } from '../../../api/business/businessApi';
import { useAuth } from '../../../components/AuthModalContext';

export default function ReviewsPanel({ business, onBack, onCloseAll, user, currentUser }) {
    const { open: openAuth } = useAuth?.() || { open: () => {} };
    const viewer = user || currentUser || null;

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [myRating, setMyRating] = useState(null);
    const [myComment, setMyComment] = useState('');
    const [hasExisting, setHasExisting] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!business?.id) return;
        let alive = true;
        const ac = new AbortController();
        (async () => {
            setLoading(true); setError(null);
            try {
                const j = await getReviews(business.id, { signal: ac.signal });
                if (!alive) return;
                const arr = Array.isArray(j) ? j : (j.items || []);
                setItems(arr);
                if (j?.me_review) {
                    setMyRating((j.me_review.rating_half_stars || 0) / 2);
                    setMyComment(j.me_review.comment || '');
                    setHasExisting(true);
                } else {
                    setHasExisting(false);
                }
            } catch (e) {
                if (!alive) return;
                setError(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; ac.abort(); };
    }, [business?.id]);

    const onSubmit = async () => {
        if (!viewer) { openAuth && openAuth(); return; }
        if (!myRating) return;
        try {
            await createOrUpdateReview(business.id, { rating: myRating, comment: myComment });
            const j = await getReviews(business.id);
            const arr = Array.isArray(j) ? j : (j.items || []);
            setItems(arr);
            setHasExisting(true);
        } catch {}
    };
    const onDeleteMine = async () => {
        try {
            await deleteMyReview(business.id);
            const j = await getReviews(business.id);
            const arr = Array.isArray(j) ? j : (j.items || []);
            setItems(arr);
            setMyRating(null);
            setMyComment('');
            setHasExisting(false);
        } catch {}
    };

    const countLabel = `${items.length} review${items.length === 1 ? '' : 's'}`;

    return (
        <Fade in timeout={220}>
            {/* Full-screen overlay inside the dialog content: fade to WHITE */}
            <Box sx={{
                position: 'absolute', inset: 0, zIndex: 20,
                bgcolor: 'common.white',
                display: 'flex', flexDirection: 'column', minHeight: 0
            }}>
                {/* Sticky header: Back + title + Close */}
                <Box sx={{
                    position: 'sticky', top: 0, zIndex: 3,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2, py: 1,
                    borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton onClick={onBack} aria-label="Back to overview"><ArrowBackIcon /></IconButton>
                        <Typography variant="h6">Reviews</Typography>
                    </Box>
                    <IconButton onClick={onCloseAll} aria-label="Close modal"><CloseIcon /></IconButton>
                </Box>

                {/* Body: scrollable list on top + composer pinned at bottom */}
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    {/* LIST — scrolls */}
                    <Box sx={{ px: 2, pt: 2, pb: 1, flex: 1, overflowY: 'auto' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            All reviews <Typography component="span" variant="body2" color="text.secondary">({countLabel})</Typography>
                        </Typography>
                        <Divider sx={{ mb: 1 }} />
                        {loading && <Typography variant="body2">Loading…</Typography>}
                        {error && <Typography color="error" variant="body2">Unable to load reviews.</Typography>}
                        {!loading && !items.length && <Typography variant="body2" color="text.secondary">No reviews yet.</Typography>}

                        <Stack spacing={2} sx={{ mt: 1 }}>
                            {items.map((r) => (
                                <Paper key={r.id} variant="outlined" sx={{ p: 1.5 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                        <Avatar sx={{ width: 26, height: 26 }}>{String(r.user_id || '?').slice(0,1)}</Avatar>
                                        <Rating value={(r.rating_half_stars || 0)/2} precision={0.5} readOnly size="small" />
                                        <Typography variant="caption" color="text.secondary">{new Date(r.created_at).toLocaleDateString()}</Typography>
                                    </Stack>
                                    {r.comment && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.comment}</Typography>}
                                </Paper>
                            ))}
                        </Stack>
                    </Box>

                    {/* COMPOSER — own card at the bottom */}
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', px: 2, py: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Leave a review</Typography>
                        {!viewer && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                You must be logged in to leave a review.
                            </Typography>
                        )}
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <Avatar sx={{ width: 28, height: 28 }}>?</Avatar>
                            <Rating precision={0.5} value={myRating || 0} onChange={(_e, v) => setMyRating(v)} />
                        </Stack>
                        <TextField
                            placeholder="Share your experience…"
                            value={myComment}
                            onChange={(e) => setMyComment(e.target.value)}
                            multiline
                            minRows={6}
                            maxRows={6}
                            fullWidth
                            sx={{
                                mb: 1,
                                '& textarea': { overflow: 'auto' },
                                '& .MuiOutlinedInput-root': { alignItems: 'flex-start' },
                            }}
                        />
                        <Stack direction="row" spacing={1}>
                            <Button variant="outlined" size="small" startIcon={<InsertPhotoIcon />} onClick={() => fileRef.current?.click()}>
                                Add photo
                            </Button>
                            <input ref={fileRef} type="file" accept="image/*" hidden />
                            <Button variant="contained" onClick={onSubmit} disabled={!myRating}>Post review</Button>
                            {hasExisting && (
                                <Button color="error" startIcon={<DeleteIcon />} onClick={onDeleteMine}>
                                    Delete my review
                                </Button>
                            )}
                        </Stack>
                    </Box>
                </Box>
            </Box>
        </Fade>
    );
}
