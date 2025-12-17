// src/pages/profile/userProfile/ImageCropDialog.jsx
import React, { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Slider,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';

/**
 * Larger/taller crop dialog. Parent sets aspect:
 *  - 1 for avatar (round)
 *  - ~2.4 for cover (wider but with notably more height than before)
 */
export default function ImageCropDialog({
                                            open,
                                            src,
                                            aspect = 1,
                                            round = false,
                                            onClose,
                                            onCropped,
                                        }) {
    const [zoom, setZoom] = useState(1);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [area, setArea] = useState(null);

    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        if (!open) {
            setZoom(1);
            setCrop({ x: 0, y: 0 });
            setArea(null);
        }
    }, [open]);

    const onComplete = useCallback((_, croppedPixels) => {
        setArea(croppedPixels);
    }, []);

    const doCrop = async () => {
        if (!src || !area) return;
        const img = await loadImage(src);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(area.width));
        canvas.height = Math.max(1, Math.round(area.height));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            img,
            area.x,
            area.y,
            area.width,
            area.height,
            0,
            0,
            canvas.width,
            canvas.height
        );
        const blob = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
        );
        onCropped?.(blob);
    };

    // near full-viewport on desktop; truly full-screen on mobile
    const vw = Math.max(320, Math.floor(window.innerWidth * 0.96));
    const vh = Math.max(320, Math.floor(window.innerHeight * 0.86));
    // Make the visual crop area tall by using most of the viewport height
    const contentWidth = Math.min(1200, vw);
    const contentHeight = vh; // generous height

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen={fullScreen}
            maxWidth={false}
            PaperProps={{
                sx: { borderRadius: fullScreen ? 0 : 3, overflow: 'hidden' },
            }}
        >
            <DialogTitle>Crop Image</DialogTitle>
            <DialogContent
                dividers
                sx={{
                    p: 0,
                    width: fullScreen ? '100vw' : contentWidth,
                    height: (fullScreen ? window.innerHeight : contentHeight) - 80, // leave room for slider
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Box sx={{ position: 'relative', flex: 1 }}>
                    {src && (
                        <Cropper
                            image={src}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspect}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onComplete}
                            restrictPosition={false}
                            showGrid
                            cropShape={round ? 'round' : 'rect'}
                            style={{
                                containerStyle: { width: '100%', height: '100%' },
                            }}
                        />
                    )}
                </Box>
                <Box sx={{ p: 2 }}>
                    <Typography variant="caption">Zoom</Typography>
                    <Slider min={1} max={4} step={0.01} value={zoom} onChange={(_, v) => setZoom(v)} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={doCrop}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function loadImage(url) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.crossOrigin = 'anonymous';
        img.src = url;
    });
}
