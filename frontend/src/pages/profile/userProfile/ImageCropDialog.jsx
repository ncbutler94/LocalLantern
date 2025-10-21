// src/pages/profile/userProfile/ImageCropDialog.jsx
import React, { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import Cropper from 'react-easy-crop';

async function toCroppedBlob(imageSrc, cropPixels, { round = false, outWidth = 1800, outHeight = 600 } = {}) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = imageSrc; });
    const canvas = document.createElement('canvas');
    canvas.width = outWidth; canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    const { x, y, width, height } = cropPixels;
    if (round) {
        ctx.beginPath(); const r = Math.min(canvas.width, canvas.height) / 2;
        ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, 2 * Math.PI); ctx.closePath(); ctx.clip();
    }
    ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
}

export default function ImageCropDialog({ open, onClose, src, aspect = 1, round = false, onCropped }) {
    const [zoom, setZoom] = useState(1);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [area, setArea] = useState(null);

    // Dialog size follows the output aspect to avoid gray gutters or horizontal scroll.
    const width = round ? 420 : Math.min(1100, Math.round(window.innerWidth * 0.92));
    const height = round ? 420 : Math.round(width / aspect);

    return (
        <Dialog open={open} onClose={(_, r) => r !== 'backdropClick' && onClose()}>
            <DialogTitle>Crop Image</DialogTitle>
            <DialogContent sx={{ width, height, position: 'relative' }}>
                <Cropper
                    image={src}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    cropShape={round ? 'round' : 'rect'}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, pixels) => setArea(pixels)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} startIcon={<CloseIcon />}>Cancel</Button>
                <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={async () => {
                        if (!area) return;
                        const blob = await toCroppedBlob(src, area, {
                            round,
                            outWidth: round ? 512 : 1800,
                            outHeight: round ? 512 : Math.round(1800 / aspect),
                        });
                        onCropped(blob);
                        onClose();
                    }}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
