// src/pages/profile/userProfile/PostsSection.jsx
import React, { useEffect, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Divider,
    IconButton,
    Typography,
    Tabs,
    Tab,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CommunityList from '../../../components/SidePanel/Community/CommunityList';

const api = process.env.REACT_APP_API_URL;

export default function PostsSection({ profile, viewer, onOpenPost }) {
    const [tab, setTab] = useState(0); // 0=Posts  1=Reposts  2=Likes
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState([]);
    const [reposts, setReposts] = useState([]);
    const [likes, setLikes] = useState([]);

    const key = profile?.handle || profile?.id;

    // sync like changes across sections (within session)
    useEffect(() => {
        const h = (e) => {
            const { postId, liked, likes: count } = e.detail || {};
            const patch = (arrSetter) => arrSetter((rows) => rows.map((r) => (r.id === postId ? { ...r, viewerLiked: liked, likesCount: count } : r)));
            patch(setPosts); patch(setReposts); patch(setLikes);
        };
        window.addEventListener('post-like-changed', h);
        return () => window.removeEventListener('post-like-changed', h);
    }, []);

    const load = async () => {
        if (!key) return;
        setLoading(true);
        try {
            const [p, r, l] = await Promise.all([
                fetch(`${api}/users/${encodeURIComponent(key)}/posts`).then((r) => r.json()),
                fetch(`${api}/users/${encodeURIComponent(key)}/reposts`).then((r) => r.json()),
                fetch(`${api}/users/${encodeURIComponent(key)}/likes`).then((r) => r.json()),
            ]);
            setPosts(Array.isArray(p) ? p : []);
            setReposts(Array.isArray(r) ? r : []);
            setLikes(Array.isArray(l) ? l : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [key]);

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
            <Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6">Activity</Typography>
                <IconButton size="small" onClick={load} title="Refresh">
                    <RefreshIcon fontSize="small" />
                </IconButton>
            </Box>
            <Divider />

            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
                <Tab label="Posts" />
                <Tab label="Reposts" />
                <Tab label="Likes" />
            </Tabs>

            <CardContent sx={{ p: 1.25 }}>
                {tab === 0 && (
                    <CommunityList
                        user={viewer}
                        posts={posts}
                        loading={loading}
                        onLocationClick={() => {}}
                        onCardClick={onOpenPost}
                        columns="one"
                    />
                )}
                {tab === 1 && (
                    <CommunityList
                        user={viewer}
                        posts={reposts}
                        loading={loading}
                        onLocationClick={() => {}}
                        onCardClick={onOpenPost}
                        columns="one"
                    />
                )}
                {tab === 2 && (
                    <CommunityList
                        user={viewer}
                        posts={likes}
                        loading={loading}
                        onLocationClick={() => {}}
                        onCardClick={onOpenPost}
                        columns="one"
                    />
                )}
            </CardContent>
        </Card>
    );
}
