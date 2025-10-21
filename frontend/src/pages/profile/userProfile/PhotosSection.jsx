// src/pages/profile/userProfile/PhotosSection.jsx
// Dedicated profile photos (not post photos). Up to 9. Glassy style to match page.

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Box, Button, Card, CardContent, Divider, Typography } from '@mui/material';
import PhotoManagerDialog from './PhotoManagerDialog';
import PhotoLightbox from './PhotoLightbox';

const api = process.env.REACT_APP_API_URL;

export default function PhotosSection({ profileHandle, isOwner, viewer }) {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mgrOpen, setMgrOpen] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [startIdx, setStartIdx] = useState(0);

    useEffect(() => {
        if (!profileHandle) return;
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            setLoading(true);
            try {
                const r = await axios.get(
                    `${api}/users/photos/${encodeURIComponent(profileHandle)}`,
                    { signal: ctrl.signal, withCredentials: true }
                );
                if (!alive) return;
                setList(Array.isArray(r.data.photos) ? r.data.photos : []);
            } catch {
                /* ignore */
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [profileHandle]);

    const openViewerAt = (idx) => {
        setStartIdx(idx);
        setViewerOpen(true);
    };

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
                    background:
                        'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.00) 60%)',
                }}
            >
                <Typography variant="h6">Photos</Typography>
                {isOwner && (
                    <Button size="small" onClick={() => setMgrOpen(true)}>
                        Add &amp; Remove Photos
                    </Button>
                )}
            </Box>
            <Divider />
            <CardContent sx={{ p: 1.25 }}>
                {loading ? (
                    <Typography color="text.secondary">Loading…</Typography>
                ) : list.length === 0 ? (
                    <Typography color="text.secondary">No photos yet.</Typography>
                ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.75 }}>
                        {list.slice(0, 9).map((p, i) => (
                            <Box
                                key={p.id}
                                onClick={() => openViewerAt(i)}
                                sx={{
                                    position: 'relative',
                                    pb: '100%',
                                    borderRadius: 1,
                                    overflow: 'hidden',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    cursor: 'pointer',
                                    background: `center/cover no-repeat url(${p.url})`,
                                }}
                            />
                        ))}
                    </Box>
                )}
            </CardContent>

            {/* Photo Manager (owner only) */}
            {isOwner && (
                <PhotoManagerDialog
                    open={mgrOpen}
                    onClose={() => setMgrOpen(false)}
                    photos={list}
                    onUpdated={setList}
                />
            )}

            {/* Lightbox / detail */}
            <PhotoLightbox
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                photos={list}
                startIndex={startIdx}
                viewer={viewer}
            />
        </Card>
    );
}
