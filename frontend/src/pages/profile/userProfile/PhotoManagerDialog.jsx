// src/pages/profile/userProfile/PhotoManagerDialog.jsx
import React, { useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import axios from 'axios';

const api = process.env.REACT_APP_API_URL;
const MAX_PHOTOS = 9;

export default function PhotoManagerDialog({ open, onClose, photos = [], onUpdated }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);

    const upload = async (files) => {
        if (!files || files.length === 0) return;
        const fd = new FormData();
        Array.from(files).forEach((f) => fd.append('photos', f));
        try {
            setBusy(true);
            const r = await axios.post(`${api}/users/photos`, fd, { withCredentials: true });
            onUpdated?.(r.data.photos || []);
        } catch (e) {
            alert(e.response?.data?.message || 'Upload failed');
        } finally {
            setBusy(false);
        }
    };

    const del = async (id) => {
        if (!window.confirm('Delete this photo?')) return;
        try {
            setBusy(true);
            const r = await axios.delete(`${api}/users/photos/${id}`, { withCredentials: true });
            onUpdated?.(r.data.photos || []);
        } catch (e) {
            alert(e.response?.data?.message || 'Delete failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth>
            <DialogTitle>Manage Photos (max {MAX_PHOTOS})</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 1,
                        maxHeight: 360,
                        overflowY: 'auto',
                    }}
                >
                    {photos.map((p) => (
                        <Box
                            key={p.id}
                            sx={{
                                position: 'relative',
                                pb: '100%',
                                borderRadius: 1,
                                overflow: 'hidden',
                                background: `center/cover no-repeat url(${p.url})`,
                                border: '1px solid',
                                borderColor: 'divider',
                            }}
                        >
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    onClick={() => del(p.id)}
                                    sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(255,255,255,0.8)' }}
                                >
                                    <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    ))}
                </Box>

                <Box sx={{ mt: 2 }}>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(e) => upload(e.target.files)}
                    />
                    <Button
                        startIcon={<AddPhotoAlternateIcon />}
                        variant="outlined"
                        onClick={() => inputRef.current?.click()}
                        disabled={busy || photos.length >= MAX_PHOTOS}
                    >
                        Add Photos
                    </Button>
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} disabled={busy}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}
