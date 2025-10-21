// src/pages/profile/userProfile/RightRail.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    IconButton,
    Tooltip,
    CircularProgress,
    Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CommunityList from '../../../components/SidePanel/Community/CommunityList';

const sectionBoxSx = {
    borderRadius: 2,
    border: '1px solid rgba(0,0,0,0.08)',
    background: '#fff',
    overflow: 'hidden',
};

const headerRowSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 1,
    px: 2,
    py: 1.25,
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    background: '#fafafa',
};

const scrollerSx = { maxHeight: 520, overflow: 'auto' };

export default function RightRail({ me, posts, onOpenPost, profileHandle }) {
    const api = process.env.REACT_APP_API_URL;

    // Community Posts filter state (preserving your UX)
    const [subtype, setSubtype] = useState('all');
    const [sort, setSort] = useState('newest');
    const postsScrollRef = useRef(null);

    const visiblePosts = useMemo(() => {
        let list = Array.isArray(posts) ? posts.slice() : [];
        if (subtype !== 'all') list = list.filter((p) => (p?.category || '') === subtype);
        if (sort === 'newest') {
            list.sort(
                (a, b) =>
                    new Date(b?.posted_at || b?.date_created || 0) -
                    new Date(a?.posted_at || a?.date_created || 0)
            );
        } else if (sort === 'popular') {
            list.sort(
                (a, b) =>
                    (Number(b?.likesCount || b?.like_count || 0) -
                        Number(a?.likesCount || a?.like_count || 0))
            );
        }
        return list;
    }, [posts, subtype, sort]);

    // NEW: Reposts & Likes unified fetch
    const [loadingRL, setLoadingRL] = useState(false);
    const [repostPosts, setRepostPosts] = useState([]);
    const [likedPosts, setLikedPosts] = useState([]);

    useEffect(() => {
        if (!profileHandle) {
            setRepostPosts([]); setLikedPosts([]); return;
        }
        let alive = true;
        const ctrl = new AbortController();
        (async () => {
            setLoadingRL(true);
            try {
                const res = await fetch(
                    `${api}/users/${encodeURIComponent(profileHandle)}/engagement/posts`,
                    { credentials: 'include', signal: ctrl.signal }
                );
                const j = await res.json();
                if (!alive) return;
                setRepostPosts(Array.isArray(j?.reposts) ? j.reposts : []);
                setLikedPosts(Array.isArray(j?.likes) ? j.likes : []);
            } catch {
                if (alive) { setRepostPosts([]); setLikedPosts([]); }
            } finally {
                if (alive) setLoadingRL(false);
            }
        })();
        return () => { alive = false; ctrl.abort(); };
    }, [api, profileHandle]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Community Posts */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Community Posts</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel id="subtype-label">Category</InputLabel>
                            <Select labelId="subtype-label" label="Category" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                                <MenuItem value="all">All</MenuItem>
                                <MenuItem value="lost-and-found">Lost &amp; Found</MenuItem>
                                <MenuItem value="public-safety">Public Safety</MenuItem>
                                <MenuItem value="announcement">Announcements</MenuItem>
                                <MenuItem value="recommendation">Recommendations</MenuItem>
                                <MenuItem value="volunteer-help">Volunteer</MenuItem>
                                <MenuItem value="general-discussion">General Discussion</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 130 }}>
                            <InputLabel id="sort-label">Sort</InputLabel>
                            <Select labelId="sort-label" label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                                <MenuItem value="newest">Newest</MenuItem>
                                <MenuItem value="popular">Most Liked</MenuItem>
                            </Select>
                        </FormControl>

                        <Tooltip title="Refresh list">
                            <IconButton onClick={() => { if (postsScrollRef.current) postsScrollRef.current.scrollTop = 0; }} size="small">
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                <Box ref={postsScrollRef} sx={scrollerSx}>
                    <CommunityList items={visiblePosts} me={me} onOpenPost={onOpenPost} source="profile-posts" />
                </Box>
            </Box>

            {/* Reposts */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Reposts</Typography>
                    {loadingRL ? <CircularProgress size={18} /> : null}
                </Box>
                <Divider />
                <Box sx={scrollerSx}>
                    {repostPosts?.length ? (
                        <CommunityList items={repostPosts} me={me} onOpenPost={onOpenPost} source="profile-reposts" />
                    ) : (
                        <Box sx={{ p: 2, color: 'text.secondary' }}>No reposts yet.</Box>
                    )}
                </Box>
            </Box>

            {/* Likes */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Likes</Typography>
                    {loadingRL ? <CircularProgress size={18} /> : null}
                </Box>
                <Divider />
                <Box sx={scrollerSx}>
                    {likedPosts?.length ? (
                        <CommunityList items={likedPosts} me={me} onOpenPost={onOpenPost} source="profile-likes" />
                    ) : (
                        <Box sx={{ p: 2, color: 'text.secondary' }}>No likes yet.</Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
