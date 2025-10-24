// src/pages/profile/userProfile/RightRail.jsx
import React, { useMemo, useRef, useState, useEffect } from 'react';
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

// Use the same list/card rendering style as Community
import ProfilePostsList from '../../../pages/profile/userProfile/ProfilePostsList';

/* ──────────────────────────────── styles ──────────────────────────────── */
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

const scrollerSx = {
    maxHeight: 520,
    overflowY: 'auto',
    overflowX: 'hidden',
    pr: 1.25,              // ensure card right border is fully visible
    boxSizing: 'border-box',
    width: '100%',
    '& > *': { maxWidth: '100%' },
};

/* ───────────────────────────── normalize post ────────────────────────────
   Match the shape used by the Community page (likes/reposts/comments counts,
   viewer flags, avatar/profile picture, photos array, etc.)
--------------------------------------------------------------------------- */
const normalizePost = (post) => {
    if (!post) return null;

    // Photos: array | JSON string | single URL; filter nulls/"null"
    let photos = [];
    if (post.photos) {
        if (typeof post.photos === 'string') {
            if (post.photos.startsWith('[')) {
                try {
                    const parsed = JSON.parse(post.photos);
                    photos = Array.isArray(parsed)
                        ? parsed.filter((p) => p && typeof p === 'string' && p !== 'null')
                        : [];
                } catch {
                    if (post.photos !== 'null' && post.photos.trim()) photos = [post.photos];
                }
            } else if (post.photos !== 'null' && post.photos.trim()) {
                photos = [post.photos];
            }
        } else if (Array.isArray(post.photos)) {
            photos = post.photos.filter((p) => p && typeof p === 'string' && p !== 'null');
        }
    }

    return {
        ...post,
        photos,
        // engagement (camelCase + snake_case fallbacks)
        likesCount: Number(post.likesCount ?? post.likes_count ?? post.like_count ?? post.likes ?? 0),
        commentsCount: Number(
            post.commentsCount ?? post.comments_count ?? post.comment_count ?? post.comments ?? 0
        ),
        repostsCount: Number(
            post.repostsCount ?? post.reposts_count ?? post.repost_count ?? post.reposts ?? 0
        ),
        viewerLiked: Boolean(post.viewerLiked ?? post.viewer_liked ?? post.liked ?? post.is_liked ?? false),
        viewerReposted: Boolean(
            post.viewerReposted ?? post.viewer_reposted ?? post.reposted ?? post.is_reposted ?? false
        ),
    };
};

export default function RightRail({ me, posts, onOpenPost, profileHandle }) {
    // Local filter/sort state for the Community Posts section
    const [subtype, setSubtype] = useState('all');
    const [sort, setSort] = useState('newest');

    // Only the internal scroller should jump to top on filter change (not the whole page)
    const postsScrollRef = useRef(null);
    const scrollToTop = () => {
        if (postsScrollRef.current) postsScrollRef.current.scrollTop = 0;
    };
    const handleSubtypeChange = (val) => { setSubtype(val); scrollToTop(); };
    const handleSortChange = (val) => { setSort(val); scrollToTop(); };

    // Align UI category to DB slugs (same mapping the Community page uses)
    const normalizedSubtype = useMemo(() => {
        if (subtype === 'public-safety') return 'public-safety-alerts';
        if (subtype === 'recommendation') return 'recommendations-tips';
        if (subtype === 'volunteer-help') return 'volunteer-requests';
        return subtype;
    }, [subtype]);

    /* ─────────────────────────── load posts for this user ──────────────────────────
     * IMPORTANT: Fetch from /api/community?user= so we get avatar_url/profile_picture,
     * aggregated photos, likes/comments/reposts counts, and viewer flags exactly like
     * the Community page. (Route is mounted under /api/community.)                       */
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [rawPosts, setRawPosts] = useState([]);

    const [reloadTick, setReloadTick] = useState(0);

    useEffect(() => {
        if (!profileHandle) { setRawPosts([]); setLoadingPosts(false); return; }
        let alive = true;
        const ac = new AbortController();
        (async () => {
            setLoadingPosts(true);
            try {
                // Use the same API the Community page uses
                const res = await fetch(
                    `/api/community?user=${encodeURIComponent(profileHandle)}&limit=100`,
                    { credentials: 'include', signal: ac.signal }
                );
                const j = await res.json();
                if (!alive) return;
                setRawPosts(Array.isArray(j) ? j : []);
            } catch {
                if (alive) setRawPosts([]);
            } finally {
                if (alive) setLoadingPosts(false);
            }
        })();
        return () => { alive = false; ac.abort(); };
    }, [profileHandle, reloadTick]);

    // Normalize → filter → sort (client-side)
    const visiblePosts = useMemo(() => {
        let list = rawPosts.slice().map(normalizePost).filter(Boolean);

        if (normalizedSubtype !== 'all') {
            list = list.filter((p) => (p?.category || '') === normalizedSubtype);
        }

        if (sort === 'newest') {
            list.sort(
                (a, b) =>
                    new Date(b?.posted_at || b?.date_created || 0) -
                    new Date(a?.posted_at || a?.date_created || 0)
            );
        } else if (sort === 'popular') {
            list.sort((a, b) => Number(b?.likesCount || 0) - Number(a?.likesCount || 0));
        }

        return list;
    }, [rawPosts, normalizedSubtype, sort]);

    // (Optional) Reposts & Likes sections – left intact; safe if your backend exposes them.
    const [loadingRL, setLoadingRL] = useState(false);
    const [repostPosts, setRepostPosts] = useState([]);
    const [likedPosts, setLikedPosts] = useState([]);
    const [engagementReloadTick, setEngagementReloadTick] = useState(0);

    useEffect(() => {
        // If you don’t have this endpoint, you’ll just see “No reposts/likes yet.”
        if (!profileHandle) { setRepostPosts([]); setLikedPosts([]); return; }
        let alive = true;
        const ac = new AbortController();
        (async () => {
            setLoadingRL(true);
            try {
                const res = await fetch(
                    `/users/${encodeURIComponent(profileHandle)}/engagement/posts`,
                    { credentials: 'include', signal: ac.signal }
                );
                const j = await res.json();
                if (!alive) return;
                const mapN = (arr) => (Array.isArray(arr) ? arr.map(normalizePost).filter(Boolean) : []);
                setRepostPosts(mapN(j?.reposts));
                setLikedPosts(mapN(j?.likes));
            } catch {
                if (alive) { setRepostPosts([]); setLikedPosts([]); }
            } finally {
                if (alive) setLoadingRL(false);
            }
        })();
        return () => { alive = false; ac.abort(); };
    }, [profileHandle, engagementReloadTick]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', minWidth: 0 }}>
            {/* Community Posts */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Community Posts
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel id="subtype-label">Category</InputLabel>
                            <Select
                                labelId="subtype-label"
                                label="Category"
                                value={subtype}
                                onChange={(e) => handleSubtypeChange(e.target.value)}
                            >
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
                            <Select
                                labelId="sort-label"
                                label="Sort"
                                value={sort}
                                onChange={(e) => handleSortChange(e.target.value)}
                            >
                                <MenuItem value="newest">Newest</MenuItem>
                                <MenuItem value="popular">Most Popular</MenuItem>
                            </Select>
                        </FormControl>

                        <Tooltip title="Refresh posts">
                            <IconButton onClick={() => setReloadTick((t) => t + 1)}>
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                <Divider />

                <Box ref={postsScrollRef} sx={scrollerSx}>
                    <ProfilePostsList
                        user={me}
                        posts={visiblePosts}
                        loading={loadingPosts}
                        onCardClick={onOpenPost}
                    />
                </Box>
            </Box>

            {/* Reposts */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Reposts
                    </Typography>
                    {loadingRL ? <CircularProgress size={18} /> : null}
                </Box>
                <Divider />
                <Box sx={scrollerSx}>
                    {repostPosts?.length ? (
                        <ProfilePostsList user={me} posts={repostPosts} onCardClick={onOpenPost} />
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            No reposts yet.
                        </Typography>
                    )}
                </Box>
            </Box>

            {/* Likes */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Likes
                    </Typography>
                    {loadingRL ? <CircularProgress size={18} /> : null}
                </Box>
                <Divider />
                <Box sx={scrollerSx}>
                    {likedPosts?.length ? (
                        <ProfilePostsList user={me} posts={likedPosts} onCardClick={onOpenPost} />
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            No likes yet.
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
