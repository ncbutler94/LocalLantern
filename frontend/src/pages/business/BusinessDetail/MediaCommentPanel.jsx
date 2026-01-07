// src/components/SidePanel/Business/BusinessDetail/MediaCommentPanel.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Stack, Avatar, TextField, Button, Divider, CircularProgress } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import SendIcon from '@mui/icons-material/Send';
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto';

import { getMediaComments, postMediaComment, toggleCommentLike } from '../../../api/business/businessApi';
import { useAuth } from '../../../components/AuthModalContext';

export default function MediaCommentPanel({ mediaId, user, currentUser }) {
    const { open: openAuth } = useAuth?.() || { open: () => {} };
    const viewer = user || currentUser || null;

    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!mediaId) return;
        let alive = true;
        const ac = new AbortController();
        (async () => {
            setLoading(true); setError(null);
            try {
                const j = await getMediaComments(mediaId, { signal: ac.signal });
                if (!alive) return;
                setComments(Array.isArray(j) ? j : (j.items || []));
            } catch (e) {
                if (!alive) return;
                setError(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; ac.abort(); };
    }, [mediaId]);

    const onToggleLike = async (commentId) => {
        try {
            const { liked, count } = await toggleCommentLike(commentId);
            setComments((arr) => arr.map(c => c.id === commentId ? { ...c, viewerLiked: liked, likesCount: count } : c));
        } catch {}
    };

    const onSubmit = async () => {
        if (!viewer) { openAuth && openAuth(); return; }
        if (!text && !file) return;
        const fd = new FormData();
        fd.append('text', text);
        if (file) fd.append('image', file);
        try {
            const j = await postMediaComment(mediaId, fd);
            setComments((c) => [j, ...c]);
            setText(''); setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch {}
    };

    return (
        <Box sx={{ width:{ xs:'100%', md: 360 }, p:2, borderLeft: { md:'1px solid', xs:'none' }, borderColor:'divider', bgcolor:'background.paper', height:'100%', display:'flex', flexDirection:'column' }}>
            <Typography variant="subtitle1" sx={{ fontWeight:700, mb:1 }}>Comments</Typography>

            {loading ? <CircularProgress size={24}/> : error ? (
                <Typography color="error" variant="body2">Could not load comments.</Typography>
            ) : (
                <Stack spacing={1} sx={{ flex:1, overflowY:'auto' }}>
                    {comments.map(c => (
                        <Box key={c.id} sx={{ p:1, borderRadius:1, bgcolor:'background.default', border:'1px solid', borderColor:'divider' }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Avatar src={c.avatar_url} sx={{ bgcolor: 'grey.600', width:28, height:28 }}>{(c.first_name||'?')[0]}</Avatar>
                                <Typography variant="body2" sx={{ fontWeight:600 }}>{c.first_name} {c.last_name}</Typography>
                                <Box sx={{ flex:1 }} />
                                <IconButton size="small" onClick={() => onToggleLike(c.id)} aria-label="like">
                                    {c.viewerLiked ? <FavoriteIcon fontSize="small" color="error"/> : <FavoriteBorderIcon fontSize="small"/>}
                                </IconButton>
                                <Typography variant="caption" sx={{ color:'text.secondary' }}>{c.likesCount || 0}</Typography>
                            </Stack>

                            {c.text && <Typography variant="body2" sx={{ mt:0.5 }}>{c.text}</Typography>}
                            {c.image_url && <Box sx={{ mt:1 }}><img src={c.image_url} alt="" style={{ width:'100%', borderRadius:8 }}/></Box>}
                        </Box>
                    ))}
                    {!comments.length && <Typography variant="body2" color="text.secondary">No comments yet.</Typography>}
                </Stack>
            )}

            <Divider sx={{ my:1 }}/>
            <Stack direction="row" spacing={1} alignItems="center">
                <Avatar src={viewer?.avatar_url} sx={{ width:28, height:28 }}>{(viewer?.first_name||'?')[0]}</Avatar>
                <TextField size="small" fullWidth placeholder="Add a comment…" value={text} onChange={(e)=>setText(e.target.value)} />
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e=>setFile(e.target.files?.[0]||null)} />
                <IconButton onClick={()=>fileInputRef.current?.click()}><InsertPhotoIcon/></IconButton>
                <IconButton color="primary" onClick={onSubmit}><SendIcon/></IconButton>
            </Stack>
        </Box>
    );
}
