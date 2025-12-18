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
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PublicIcon from '@mui/icons-material/Public';

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
    pl: 2,
    pr: { xs: 4, md: 4 },
    pt: 1,
    pb: 1,
    scrollbarGutter: 'stable both-edges',
    boxSizing: 'border-box',
    width: '100%',
    '& > *': { maxWidth: '100%' },
};

// Pretty label
const PRIV_LABEL = { public: 'Public', friends: 'Followers', private: 'Only Me' };
const privText = (v) => PRIV_LABEL[v] || 'Public';

// API base (for dev where React runs on :3000 and API on :4001)
const API_BASE = process.env.REACT_APP_API_URL || '';

/* normalize post (unchanged) */
const normalizePost = (post) => {
    if (!post) return null;

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

export default function RightRail({
                                      me,
                                      posts,
                                      onOpenPost,
                                      profile, // full profile object (fallback if profileHandle not provided)
                                      profileHandle, // optional
                                      editMode = false,
                                      onPrivacy, // (e, 'posts'|'reposts'|'likes')
                                      privacy = {}, // { posts, reposts, likes }
                                      useProvidedPosts = false, // when true, use the posts prop as source of truth and skip fetching
                                  }) {
    const [subtype, setSubtype] = useState('all');
    const [sort, setSort] = useState('newest');

    const postsScrollRef = useRef(null);
    const scrollToTop = () => {
        if (postsScrollRef.current) postsScrollRef.current.scrollTop = 0;
    };
    const handleSubtypeChange = (val) => {
        setSubtype(val);
        scrollToTop();
    };
    const handleSortChange = (val) => {
        setSort(val);
        scrollToTop();
    };

    const normalizedSubtype = useMemo(() => {
        if (subtype === 'public-safety') return 'public-safety-alerts';
        if (subtype === 'recommendation') return 'recommendations-tips';
        if (subtype === 'volunteer-help') return 'volunteer-requests';
        return subtype;
    }, [subtype]);

    // Resolve a usable key (handle or id) for fetches
    const profileKey = useMemo(
        () => profileHandle || profile?.handle || profile?.public_id || profile?.id || null,
        [profileHandle, profile]
    );

    // Determine if the viewer owns this profile (so they can see/change privacy without edit mode)
    const isOwner = useMemo(() => {
        if (!me || !profile) return false;
        return (
            (me.id && profile.id && me.id === profile.id) ||
            (me.handle &&
                profile.handle &&
                String(me.handle).toLowerCase() === String(profile.handle).toLowerCase())
        );
    }, [me, profile]);

    // Determine if viewer follows this profile (for "friends" privacy == Followers)
    const isFollower = useMemo(() => {
        if (!me || !profile) return false;
        if (isOwner) return true;

        try {
            const sjRaw = profile.social_json;
            const sj =
                sjRaw && typeof sjRaw === 'string'
                    ? JSON.parse(sjRaw || '{}')
                    : sjRaw && typeof sjRaw === 'object'
                        ? sjRaw
                        : {};
            const followerIds = Array.isArray(sj?.followers) ? sj.followers : [];
            const myId = Number(me.id);
            return Number.isFinite(myId) && followerIds.some((id) => Number(id) === myId);
        } catch {
            return false;
        }
    }, [me, profile, isOwner]);

    const canViewByPrivacy = (val) => {
        const v = val || 'public';
        if (isOwner) return true;
        if (v === 'private') return false;
        if (v === 'friends') return !!isFollower;
        return true;
    };

    const ownerCanSeePrivacy = editMode || isOwner;

    const [loadingPosts, setLoadingPosts] = useState(true);
    const [rawPosts, setRawPosts] = useState(Array.isArray(posts) ? posts : []);

    // Apply in-place updates after an edit/mark-found happens elsewhere on the profile
    useEffect(() => {
        const onUpdated = (e) => {
            const updated = e?.detail?.post;
            if (!updated || !updated.id) return;
            const idNum = Number(updated.id);
            if (!Number.isFinite(idNum)) return;

            const patchList = (prev) =>
                Array.isArray(prev)
                    ? prev.map((p) => (Number(p?.id) === idNum ? { ...p, ...updated } : p))
                    : prev;

            setRawPosts((prev) => patchList(prev));
            setRepostPosts((prev) => patchList(prev));
            setLikedPosts((prev) => patchList(prev));
        };

        const onDeleted = (e) => {
            const idNum = Number(e?.detail?.postId);
            if (!Number.isFinite(idNum)) return;

            const dropFrom = (prev) =>
                Array.isArray(prev) ? prev.filter((p) => Number(p?.id) !== idNum) : prev;

            setRawPosts((prev) => dropFrom(prev));
            setRepostPosts((prev) => dropFrom(prev));
            setLikedPosts((prev) => dropFrom(prev));
        };

        window.addEventListener('ll:communityPost:updated', onUpdated);
        window.addEventListener('ll:communityPost:deleted', onDeleted);
        return () => {
            window.removeEventListener('ll:communityPost:updated', onUpdated);
            window.removeEventListener('ll:communityPost:deleted', onDeleted);
        };
    }, []);

    // Fetch profile posts (includes photos). We refetch on profileKey change unless caller preloaded them.
    useEffect(() => {
        if (useProvidedPosts) {
            setRawPosts(Array.isArray(posts) ? posts : []);
            setLoadingPosts(false);
            return;
        }
        if (!profileKey) {
            setRawPosts(Array.isArray(posts) ? posts : []);
            setLoadingPosts(false);
            return;
        }
        let alive = true;
        const ac = new AbortController();
        (async () => {
            setLoadingPosts(true);
            try {
                const res = await fetch(
                    `${API_BASE}/api/community?user=${encodeURIComponent(profileKey)}&limit=100`,
                    { credentials: 'include', signal: ac.signal }
                );
                const j = await res.json();
                if (!alive) return;
                const arr = Array.isArray(j) ? j : [];
                setRawPosts(arr);
            } catch {
                if (alive) setRawPosts(Array.isArray(posts) ? posts : []);
            } finally {
                if (alive) setLoadingPosts(false);
            }
        })();
        return () => {
            alive = false;
            ac.abort();
        };
    }, [useProvidedPosts, profileKey, posts]);

    const visiblePosts = useMemo(() => {
        let list = rawPosts.slice().map(normalizePost).filter(Boolean);

        if (normalizedSubtype && normalizedSubtype !== 'all') {
            list = list.filter((p) => {
                const cat = String(p?.category || p?.subtype || '').toLowerCase();
                return cat === normalizedSubtype.toLowerCase();
            });
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

    // Likes/Reposts
    const [loadingRL, setLoadingRL] = useState(false);
    const [repostPosts, setRepostPosts] = useState([]);
    const [likedPosts, setLikedPosts] = useState([]);

    useEffect(() => {
        if (!profileKey) {
            setRepostPosts([]);
            setLikedPosts([]);
            return;
        }
        let alive = true;
        const ac = new AbortController();
        (async () => {
            setLoadingRL(true);
            try {
                const res = await fetch(
                    `${API_BASE}/users/${encodeURIComponent(profileKey)}/engagement/posts`,
                    { credentials: 'include', signal: ac.signal }
                );
                const j = await res.json();
                if (!alive) return;
                const mapN = (arr) => (Array.isArray(arr) ? arr.map(normalizePost).filter(Boolean) : []);
                setRepostPosts(mapN(j?.reposts));
                setLikedPosts(mapN(j?.likes));
            } catch {
                if (alive) {
                    setRepostPosts([]);
                    setLikedPosts([]);
                }
            } finally {
                if (alive) setLoadingRL(false);
            }
        })();
        return () => {
            alive = false;
            ac.abort();
        };
    }, [profileKey]);

    // Expand handler — tells UserProfilePage to open the large overlay grid
    const expandToOverlay = () => {
        window.dispatchEvent(new CustomEvent('profile-posts-expand'));
    };

    const canViewReposts = canViewByPrivacy(privacy?.reposts || 'public');
    const canViewLikes = canViewByPrivacy(privacy?.likes || 'public');

    const cannotViewText = (val) => {
        const v = val || 'public';
        if (v === 'private') return 'This section is visible to you only.';
        return 'This section is visible to followers.';
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', minWidth: 0 }}>
            {/* Community Posts */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Community Posts
                        </Typography>
                        {ownerCanSeePrivacy && (
                            <>
                                <Tooltip title="Privacy">
                                    <IconButton size="small" onClick={(e) => onPrivacy?.(e, 'posts')}>
                                        <PublicIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Typography variant="caption" color="text.secondary">
                                    ({privText(privacy.posts)})
                                </Typography>
                            </>
                        )}
                    </Box>

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
                                <MenuItem value="popular">Popular</MenuItem>
                            </Select>
                        </FormControl>

                        <Tooltip title="Expand">
                            <IconButton size="small" onClick={expandToOverlay} aria-label="Expand">
                                <OpenInFullIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                <Divider />

                {/* IMPORTANT: add marker for save/restore logic */}
                <Box
                    ref={postsScrollRef}
                    sx={scrollerSx}
                    data-profile-posts-scroll
                    className="profile-posts-scroller"
                >
                    <ProfilePostsList user={me} posts={visiblePosts} loading={loadingPosts} onCardClick={onOpenPost} />
                </Box>
            </Box>

            {/* Reposts */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Reposts
                        </Typography>
                        {ownerCanSeePrivacy && (
                            <>
                                <Tooltip title="Privacy">
                                    <IconButton size="small" onClick={(e) => onPrivacy?.(e, 'reposts')}>
                                        <PublicIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Typography variant="caption" color="text.secondary">
                                    ({privText(privacy.reposts)})
                                </Typography>
                            </>
                        )}
                    </Box>
                    {loadingRL ? <CircularProgress size={18} /> : null}
                </Box>
                <Divider />
                <Box sx={scrollerSx}>
                    {canViewReposts ? (
                        repostPosts?.length ? (
                            <ProfilePostsList user={me} posts={repostPosts} onCardClick={onOpenPost} />
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                No reposts yet.
                            </Typography>
                        )
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            {cannotViewText(privacy?.reposts)}
                        </Typography>
                    )}
                </Box>
            </Box>

            {/* Likes */}
            <Box sx={sectionBoxSx}>
                <Box sx={headerRowSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Likes
                        </Typography>
                        {ownerCanSeePrivacy && (
                            <>
                                <Tooltip title="Privacy">
                                    <IconButton size="small" onClick={(e) => onPrivacy?.(e, 'likes')}>
                                        <PublicIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Typography variant="caption" color="text.secondary">
                                    ({privText(privacy.likes)})
                                </Typography>
                            </>
                        )}
                    </Box>
                    {loadingRL ? <CircularProgress size={18} /> : null}
                </Box>
                <Divider />
                <Box sx={scrollerSx}>
                    {canViewLikes ? (
                        likedPosts?.length ? (
                            <ProfilePostsList user={me} posts={likedPosts} onCardClick={onOpenPost} />
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                No likes yet.
                            </Typography>
                        )
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            {cannotViewText(privacy?.likes)}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
