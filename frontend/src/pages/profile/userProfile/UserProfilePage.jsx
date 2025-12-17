// src/pages/profile/userProfile/UserProfilePage.jsx
// Layout: LEFT rail (About → Contact → Work → Education → Followers & Following → Photos → Location)
// RIGHT rail: Community Posts (self-contained profile feed)
//
// Updates in this version:
// - NEW: When the profile owner updates/deletes their avatar, we broadcast a CustomEvent `me:updated`
//        and also write to localStorage (`ll:me:updated`) with cache-busted URLs.
//        The global Header listens and updates its avatar instantly.
// - All existing save/crop/delete flows preserved.
// - NEW (this patch): Right-rail post clicks now navigate to /posts/:id (Post Page) with
//   saved/restore scroll for the profile page. Removed the unused PostDetail modal.
// - NEW (this patch): Full-screen three-dots loader while profile + initial posts load.
// - NEW (this patch): Failsafe to block location-link clicks inside the expanded posts grid.

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Popover,
    Radio,
    RadioGroup,
    FormControlLabel,
    Stack,
    TextField,
    Typography,
    IconButton,
    Tooltip,
} from '@mui/material';
import { keyframes } from '@mui/system';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PublicIcon from '@mui/icons-material/Public';
import CloseIcon from '@mui/icons-material/Close';

// Removed: PostDetailModal (we now navigate to Post Page)
// import PostDetailModal from '../../community/PostDetailModal';
import ProfileHeader from '../userProfile/ProfileHeader';
import AboutSection from '../userProfile/AboutSection';
import ContactSection from '../userProfile/ContactSection';
import HistoryDialog from '../userProfile/HistoryDialog';
import ImageCropDialog from '../userProfile/ImageCropDialog';
import FollowsSection from '../userProfile/FollowsSection';
import PhotosSection from '../userProfile/PhotosSection';
import RightRail from '../userProfile/RightRail';

// Used by expanded posts page
import { ProfilePostCard } from '../../profile/userProfile/ProfilePostsList';
import UserCardPopover from '../../../components/UserCardPopover';
import SharePostDialog from '../../../components/SharePostDialog';

const api = process.env.REACT_APP_API_URL;

// same rule as Register.jsx (3–30, letters/numbers/dot/dash/underscore)
const handleRegex = /^[a-zA-Z0-9_.-]{3,30}$/;

const privacyLabel = (val) =>
    val === 'private' ? 'Only Me' : val === 'friends' ? 'Followers' : 'Public';

/* ── Centered 3-dots page loader ─────────────────────────────────────── */
const dotPulse = keyframes`
    0%, 80%, 100% { transform: scale(0); opacity: .4; }
    40% { transform: scale(1); opacity: 1; }
`;
function FullScreenDots() {
    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                    'linear-gradient(135deg, #f7fbff 0%, #f4f6fb 50%, #f8fafc 100%)',
            }}
        >
            <Box sx={{ display: 'flex', gap: 1.25 }}>
                {[0, 1, 2].map((i) => (
                    <Box
                        key={i}
                        sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: 'text.primary',
                            animation: `${dotPulse} 1.4s ease-in-out infinite`,
                            animationDelay: `${i * 0.18}s`,
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
}

/** Reusable section shell */
const SectionCard = ({
                         title,
                         privacyKey,
                         editMode = false,
                         onPrivacy,
                         action,
                         children,
                         maxBodyHeight,
                         showPrivacyForOwner = false,
                         ownerCanEdit = false,
                         currentPrivacy = 'public',
                     }) => (
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6">{title}</Typography>
                {(editMode || showPrivacyForOwner) && privacyKey && (
                    <>
                        <Tooltip title="Privacy">
                            <IconButton
                                size="small"
                                onClick={(e) => onPrivacy?.(e, privacyKey)}
                                sx={{ ml: 0.5 }}
                            >
                                <PublicIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {ownerCanEdit && (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ ml: 0.25 }}
                            >
                                ({privacyLabel(currentPrivacy)})
                            </Typography>
                        )}
                    </>
                )}
            </Box>
            {action}
        </Box>
        <CardContent
            sx={{
                pt: 0.5,
                pb: 1.25,
                ...(maxBodyHeight ? { maxHeight: maxBodyHeight, overflowY: 'auto' } : null),
            }}
        >
            {children}
        </CardContent>
    </Card>
);

export default function UserProfilePage({ me }) {
    const { handleOrId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [activity, setActivity] = useState(null);
    const [error, setError] = useState('');

    const [editMode, setEditMode] = useState(false);

    // About
    const [bioDraft, setBioDraft] = useState('');
    const [relationship, setRelationship] = useState('');
    const [birthday, setBirthday] = useState('');
    const [homeCity, setHomeCity] = useState('');
    const [homeCounty, setHomeCounty] = useState('');

    // Contact
    const [contact, setContact] = useState({
        phone: '',
        email: '',
        facebook: '',
        instagram: '',
        website: '',
    });

    // History
    const [workHistory, setWorkHistory] = useState([]);
    const [eduHistory, setEduHistory] = useState([]);
    const [workOpen, setWorkOpen] = useState(false);
    const [eduOpen, setEduOpen] = useState(false);

    // Social
    const [isFollowing, setIsFollowing] = useState(false);

    // Staged media
    const [pendingAvatar, setPendingAvatar] = useState(null);
    const [pendingCover, setPendingCover] = useState(null);
    const [deleteAvatar, setDeleteAvatar] = useState(false);
    const [deleteCover, setDeleteCover] = useState(false);

    // Crop
    const [cropOpen, setCropOpen] = useState(false);
    const [cropSrc, setCropSrc] = useState('');
    const [cropRound, setCropRound] = useState(false); // true = avatar

    // Dialogs
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmType, setConfirmType] = useState('');
    const [discardOpen, setDiscardOpen] = useState(false);

    // Privacy
    const [privacy, setPrivacy] = useState({});
    const [privacyAnchor, setPrivacyAnchor] = useState(null);
    const [privacyFor, setPrivacyFor] = useState(null);

    // Flash
    const [flash, setFlash] = useState(null);

    // "View All" control for Follows section (handled via ref)
    const followsRef = useRef(null);

    // Expanded Community Posts page
    const [postsExpanded, setPostsExpanded] = useState(false);
    const [hoveredId, setHoveredId] = useState(null);
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    // Scroll ref for the expanded posts area
    const postsScrollRef = useRef(null);

    // Community post edit / history / mark-found dialogs (profile page)
    const [editOpen, setEditOpen] = useState(false);
    const [editPostId, setEditPostId] = useState(null);
    const [editPost, setEditPost] = useState(null);
    const [editDraft, setEditDraft] = useState(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');

    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyPostId, setHistoryPostId] = useState(null);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    const [markFoundOpen, setMarkFoundOpen] = useState(false);
    const [markFoundPostId, setMarkFoundPostId] = useState(null);
    const [markFoundPost, setMarkFoundPost] = useState(null);
    const [markFoundMessage, setMarkFoundMessage] = useState('');
    const [markFoundSaving, setMarkFoundSaving] = useState(false);
    const [markFoundError, setMarkFoundError] = useState('');

    const isMine = me && profile && me.id === profile.id;

    // Username (handle) editing
    const [handleDraft, setHandleDraft] = useState('');
    const [handleStats, setHandleStats] = useState({ remaining: 0, nextAllowed: null });
    const [handleError, setHandleError] = useState('');

    // Name (first/last) editing
    const [firstNameDraft, setFirstNameDraft] = useState('');
    const [lastNameDraft, setLastNameDraft] = useState('');

    // Track first render to avoid blanking UI on background refreshes
    const initialLoadRef = useRef(true);

    // Listen for per-card action requests (dispatched by ProfilePostCard)
    useEffect(() => {
        const onReqEdit = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setEditError('');
            setEditPostId(pid);
            // We may have a partial post from a list; we'll fetch the authoritative copy below
            setEditPost(e?.detail?.post || null);
            setEditDraft(null);
            setEditOpen(true);
        };

        const onReqHistory = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setHistoryError('');
            setHistoryRows([]);
            setHistoryPostId(pid);
            setHistoryOpen(true);
        };

        const onReqMarkFound = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setMarkFoundError('');
            setMarkFoundMessage('');
            setMarkFoundPostId(pid);
            setMarkFoundPost(e?.detail?.post || null);
            setMarkFoundOpen(true);
        };

        window.addEventListener('ll:communityPost:requestEdit', onReqEdit);
        window.addEventListener('ll:communityPost:requestHistory', onReqHistory);
        window.addEventListener('ll:communityPost:requestMarkFound', onReqMarkFound);

        return () => {
            window.removeEventListener('ll:communityPost:requestEdit', onReqEdit);
            window.removeEventListener('ll:communityPost:requestHistory', onReqHistory);
            window.removeEventListener('ll:communityPost:requestMarkFound', onReqMarkFound);
        };
    }, []);

    const buildEditDraftFromPost = useCallback((p) => {
        const toDateInput = (v) => {
            if (!v) return '';
            const s = String(v);
            return s.length >= 10 ? s.slice(0, 10) : s;
        };

        return {
            title: p?.title || '',
            description: p?.description || '',
            city: p?.city || '',
            county: p?.county || '',
            street_address: p?.street_address || '',
            // Category-specific
            lost_or_found: p?.lost_or_found || '',
            reward: p?.reward || '',
            rec_type: p?.rec_type || '',
            help_type: p?.help_type || '',
            request_kind: p?.request_kind || '',
            needed_date: toDateInput(p?.needed_date),
            contact: p?.contact || '',
        };
    }, []);

    // Fetch authoritative post data when editing
    useEffect(() => {
        if (!editOpen || !editPostId) return;
        let alive = true;
        const controller = new AbortController();

        (async () => {
            setEditLoading(true);
            setEditError('');
            try {
                const res = await axios.get(`${api}/api/community/${editPostId}`, {
                    withCredentials: true,
                    signal: controller.signal,
                });
                if (!alive) return;
                const p = res.data;
                setEditPost(p);
                setEditDraft(buildEditDraftFromPost(p));
            } catch (err) {
                if (!alive) return;
                const msg =
                    err?.response?.data?.message ||
                    err?.message ||
                    'Could not load the post for editing.';
                setEditError(msg);
            } finally {
                if (alive) setEditLoading(false);
            }
        })();

        return () => {
            alive = false;
            controller.abort();
        };
    }, [editOpen, editPostId, buildEditDraftFromPost]);

    // Fetch edit history when requested
    useEffect(() => {
        if (!historyOpen || !historyPostId) return;
        let alive = true;
        const controller = new AbortController();

        (async () => {
            setHistoryLoading(true);
            setHistoryError('');
            try {
                const res = await axios.get(`${api}/api/community/${historyPostId}/edits`, {
                    withCredentials: true,
                    signal: controller.signal,
                });
                if (!alive) return;
                const rows = Array.isArray(res.data) ? res.data : [];
                setHistoryRows(rows);
            } catch (err) {
                if (!alive) return;
                const msg =
                    err?.response?.data?.message ||
                    err?.message ||
                    'Could not load edit history.';
                setHistoryError(msg);
            } finally {
                if (alive) setHistoryLoading(false);
            }
        })();

        return () => {
            alive = false;
            controller.abort();
        };
    }, [historyOpen, historyPostId]);

    /* Utility: format ISO (YYYY-MM-DD) into MM/DD/YYYY */
    const formatMDY = useCallback((iso) => {
        if (!iso) return '';
        const s = String(iso).slice(0, 10);
        const parts = s.split('-');
        if (parts.length === 3) {
            const [y, m, d] = parts;
            const mm = (m || '').padStart(2, '0');
            const dd = (d || '').padStart(2, '0');
            return `${mm}/${dd}/${y}`;
        }
        return iso;
    }, []);

    /* Utility: format a date range */
    const formatRange = useCallback(
        (start, end, current) => {
            const left = formatMDY(start);
            const right = current ? 'Present' : formatMDY(end);
            if (!left && !right && !current) return '';
            return `${left || '—'} - ${right || '—'}`;
        },
        [formatMDY]
    );

    /* Load profile + activity */
    useEffect(() => {
        if (!handleOrId) {
            setLoading(false);
            setError('Profile not specified.');
            return;
        }
        let alive = true;
        const controller = new AbortController();

        (async () => {
            if (initialLoadRef.current) setLoading(true);
            setError('');
            try {
                const res = await axios.get(
                    `${api}/users/public/${encodeURIComponent(handleOrId)}`,
                    { withCredentials: true, signal: controller.signal }
                );
                if (!alive) return;

                const p = res.data.profile;
                setProfile(p);
                setActivity(res.data.activity || {});
                setBioDraft(p?.bio || '');
                setRelationship(p?.relationship || '');
                setBirthday(p?.birthday || '');
                setHomeCity(p?.home_city || '');
                setHomeCounty(p?.home_county || '');
                setHandleDraft(p?.handle || '');
                setFirstNameDraft(p?.first_name || '');
                setLastNameDraft(p?.last_name || '');

                const parseJ = (v) => (typeof v === 'string' ? JSON.parse(v || '[]') : v || []);
                setWorkHistory(parseJ(p?.work_history_json));
                setEduHistory(parseJ(p?.education_history_json));

                const pj = p?.privacy_json
                    ? typeof p.privacy_json === 'string'
                        ? JSON.parse(p.privacy_json)
                        : p.privacy_json
                    : {};
                setPrivacy(pj);

                // Seed Contact from social_json.contact
                const sj =
                    p?.social_json
                        ? typeof p.social_json === 'string'
                            ? JSON.parse(p.social_json)
                            : p.social_json
                        : {};
                const c = (sj && sj.contact) || {};
                setContact({
                    phone: c.phone || '',
                    email: c.email || '',
                    facebook: c.facebook || '',
                    instagram: c.instagram || '',
                    website: c.website || '',
                });

                setPendingAvatar(null);
                setPendingCover(null);
                setDeleteAvatar(false);
                setDeleteCover(false);
                setEditMode(false);
            } catch (err) {
                if (alive)
                    setError(err.response?.data?.message || 'Failed to load profile.');
            } finally {
                if (alive) setLoading(false);
                initialLoadRef.current = false;
            }
        })();

        return () => {
            alive = false;
            controller.abort();
        };
    }, [handleOrId]);

    // Fetch handle change stats for the owner (2 per 30 days)
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!isMine) return;
            try {
                const r = await axios.get(`${api}/users/profile`, { withCredentials: true });
                const u = r.data?.user || r.data || {};
                const stats = u.handle_change_stats || { remaining: 0, nextAllowed: null };
                if (alive) setHandleStats(stats);
            } catch {
                /* ignore; default stats (0) will hide input */
            }
        })();
        return () => {
            alive = false;
        };
    }, [isMine]);

    /* Derive follow state when viewer or profile changes */
    useEffect(() => {
        if (!profile) return;
        try {
            const sj =
                profile?.social_json &&
                (typeof profile.social_json === 'string'
                    ? JSON.parse(profile.social_json || '{}')
                    : profile.social_json);
            const isF = !!me && Array.isArray(sj?.followers) && sj.followers.includes(me.id);
            setIsFollowing(isF);
        } catch {
            setIsFollowing(false);
        }
    }, [me?.id, profile]);

    /* Expanded page open signal */
    useEffect(() => {
        const open = () => {
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'posts');
            window.history.pushState({ view: 'posts' }, '', url);
            setPostsExpanded(true);
        };
        window.addEventListener('profile-posts-expand', open);
        return () => window.removeEventListener('profile-posts-expand', open);
    }, []);

    /* Sync with URL on load and back/forward */
    useEffect(() => {
        const sync = () => {
            const url = new URL(window.location.href);
            setPostsExpanded(url.searchParams.get('view') === 'posts');
        };
        sync();
        window.addEventListener('popstate', sync);
        return () => window.removeEventListener('popstate', sync);
    }, []);

    /* File pickers / crop */
    const pickFile = (cb) => {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = 'image/*';
        i.onchange = () => {
            const f = i.files?.[0];
            if (f) cb(f);
        };
        i.click();
    };

    const changeAvatar = () =>
        pickFile((f) => {
            setCropSrc(URL.createObjectURL(f));
            setCropRound(true);
            setCropOpen(true);
        });
    const changeCover = () =>
        pickFile((f) => {
            setCropSrc(URL.createObjectURL(f));
            setCropRound(false);
            setCropOpen(true);
        });

    const onCropped = (blob) => {
        if (cropRound) {
            setPendingAvatar(blob);
            setDeleteAvatar(false);
        } else {
            setPendingCover(blob);
            setDeleteCover(false);
        }
        setCropOpen(false);
    };

    // 🔔 helper: cache-bust a URL (so new images render immediately)
    const bump = (url) => (url ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : url);

    // 🔔 helper: broadcast "me updated" so Header can refresh its avatar (only when editing own profile)
    const notifyMeUpdated = useCallback(
        (uLike) => {
            if (!isMine) return;
            try {
                const nextRaw = (uLike && (uLike.user || uLike)) || {};
                const merged = { ...(profile || {}), ...nextRaw };
                const payload = {
                    ...merged,
                    // cache-bust avatar/cover to defeat CDN/browser caching
                    avatar_url: bump(merged.avatar_url || merged.profile_picture),
                    profile_picture: bump(merged.profile_picture || merged.avatar_url),
                    cover_url: bump(merged.cover_url),
                };
                // Same-tab listeners
                window.dispatchEvent(new CustomEvent('me:updated', { detail: { user: payload } }));
                // Cross-tab listeners
                localStorage.setItem('ll:me:updated', JSON.stringify({ t: Date.now(), user: payload }));
            } catch {
                /* ignore */
            }
        },
        [isMine, profile]
    );

    const doDeleteAvatar = async () => {
        try {
            await axios.delete(`${api}/users/me/avatar`, { withCredentials: true });
            const updated = { avatar_url: null, profile_picture: null };
            setProfile((p) => (p ? { ...p, ...updated } : p));
            notifyMeUpdated(updated);
            setPendingAvatar(null);
            setDeleteAvatar(false);
            setConfirmOpen(false);
            setFlash({ type: 'success', text: 'Profile picture deleted.' });
        } catch {
            setFlash({ type: 'error', text: 'Failed to delete profile picture.' });
        }
    };

    const doDeleteCover = async () => {
        // Optimistically clear UI immediately
        setProfile((p) => (p ? { ...p, cover_url: null } : p));
        setPendingCover(null);
        setDeleteCover(true);
        setConfirmOpen(false);
        try {
            await axios.delete(`${api}/users/me/cover`, { withCredentials: true });
            setDeleteCover(false);
            setFlash({ type: 'success', text: 'Cover photo deleted.' });
        } catch {
            setFlash({
                type: 'info',
                text: 'Cover removed from view. It will be cleared from your account when you save.',
            });
        }
    };

    // Stable privacy opener
    const openPrivacy = useCallback((e, key) => {
        setPrivacyAnchor(e.currentTarget);
        setPrivacyFor(key);
    }, []);

    /** Persist privacy_json to /users/me (auto-save) */
    const setPrivacyLevel = async (val) => {
        if (!privacyFor) return;
        const up = { ...privacy, [privacyFor]: val };
        setPrivacy(up);
        try {
            await axios.put(`${api}/users/me`, { privacy_json: up }, { withCredentials: true });
            setFlash({ type: 'success', text: 'Privacy updated.' });
        } catch {
            setFlash({ type: 'error', text: 'Failed to update privacy.' });
        }
        setPrivacyAnchor(null);
    };

    // Section visibility helper (owner always sees)
    const canViewSection = useCallback(
        (value) => {
            const v = value || 'public';
            if (isMine) return true;
            if (v === 'private') return false;
            if (v === 'friends') return !!isFollowing;
            return true; // public
        },
        [isMine, isFollowing]
    );

    // Raw posts fallback
    const activityPosts = useMemo(() => activity?.posts || [], [activity]);

    // Fetch the profile's community posts (used by right rail & expanded grid)
    const [feedPosts, setFeedPosts] = useState([]);
    const [postsBootLoading, setPostsBootLoading] = useState(true);

    useEffect(() => {
        if (!profile) return;
        const postsPrivacy = (privacy && privacy.posts) || 'public';
        if (!canViewSection(postsPrivacy)) {
            setFeedPosts([]);
            setPostsBootLoading(false);
            return;
        }

        let alive = true;
        const ctrl = new AbortController();
        setPostsBootLoading(true);
        (async () => {
            try {
                const key = profile?.handle || profile?.public_id || profile?.id;
                if (!key) {
                    if (alive) setFeedPosts([]);
                    return;
                }
                const r = await axios.get(
                    `${api}/users/${encodeURIComponent(key)}/engagement/posts`,
                    { withCredentials: true, signal: ctrl.signal }
                );
                if (!alive) return;
                const got = Array.isArray(r.data?.posts)
                    ? r.data.posts
                    : Array.isArray(r.data)
                        ? r.data
                        : [];
                setFeedPosts(got);
            } catch {
                if (alive) setFeedPosts(activity?.posts || []);
            } finally {
                if (alive) setPostsBootLoading(false);
            }
        })();
        return () => {
            alive = false;
            ctrl.abort();
        };
    }, [profile, activity, privacy, canViewSection]);

    // Apply an updated post (after edit / mark-found) across the profile UI
    const applyUpdatedCommunityPost = useCallback((updated) => {
        if (!updated || !updated.id) return;
        const idNum = Number(updated.id);
        if (!Number.isFinite(idNum)) return;

        // Let other profile widgets (RightRail, etc.) patch in place
        try {
            window.dispatchEvent(
                new CustomEvent('ll:communityPost:updated', { detail: { post: updated } })
            );
        } catch {
            /* ignore */
        }

        const patchList = (prev) =>
            Array.isArray(prev)
                ? prev.map((p) => (Number(p?.id) === idNum ? { ...p, ...updated } : p))
                : prev;

        setFeedPosts((prev) => patchList(prev));
        setActivity((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            if (Array.isArray(prev.posts)) next.posts = patchList(prev.posts);
            if (Array.isArray(prev.reposts)) next.reposts = patchList(prev.reposts);
            if (Array.isArray(prev.likes)) next.likes = patchList(prev.likes);
            return next;
        });
    }, []);

    const closeEditDialog = useCallback(() => {
        setEditOpen(false);
        setEditPostId(null);
        setEditPost(null);
        setEditDraft(null);
        setEditError('');
        setEditLoading(false);
        setEditSaving(false);
    }, []);

    const closeHistoryDialog = useCallback(() => {
        setHistoryOpen(false);
        setHistoryPostId(null);
        setHistoryRows([]);
        setHistoryError('');
        setHistoryLoading(false);
    }, []);

    const closeMarkFoundDialog = useCallback(() => {
        setMarkFoundOpen(false);
        setMarkFoundPostId(null);
        setMarkFoundPost(null);
        setMarkFoundMessage('');
        setMarkFoundError('');
        setMarkFoundSaving(false);
    }, []);

    const submitEditPost = useCallback(async () => {
        if (!editPostId || !editDraft) return;
        setEditSaving(true);
        setEditError('');
        try {
            // Only send known fields; backend will enforce ownership & rate limit
            const payload = {
                title: editDraft.title,
                description: editDraft.description,
                city: editDraft.city,
                county: editDraft.county,
                street_address: editDraft.street_address,
                lost_or_found: editDraft.lost_or_found,
                reward: editDraft.reward,
                rec_type: editDraft.rec_type,
                help_type: editDraft.help_type,
                request_kind: editDraft.request_kind,
                needed_date: editDraft.needed_date,
                contact: editDraft.contact,
            };

            const res = await axios.patch(`${api}/api/community/${editPostId}`, payload, {
                withCredentials: true,
            });
            const updated = res.data;
            applyUpdatedCommunityPost(updated);
            closeEditDialog();
        } catch (err) {
            const msg =
                err?.response?.data?.message ||
                err?.message ||
                'Could not save your changes.';
            setEditError(msg);
        } finally {
            setEditSaving(false);
        }
    }, [editPostId, editDraft, applyUpdatedCommunityPost, closeEditDialog]);

    const submitMarkFound = useCallback(async () => {
        if (!markFoundPostId) return;
        setMarkFoundSaving(true);
        setMarkFoundError('');
        try {
            const payload = { message: markFoundMessage };
            const res = await axios.post(`${api}/api/community/${markFoundPostId}/mark-found`, payload, {
                withCredentials: true,
            });
            const updated = res.data;
            applyUpdatedCommunityPost(updated);
            closeMarkFoundDialog();
        } catch (err) {
            const msg =
                err?.response?.data?.message ||
                err?.message ||
                'Could not mark this item as found.';
            setMarkFoundError(msg);
        } finally {
            setMarkFoundSaving(false);
        }
    }, [markFoundPostId, markFoundMessage, applyUpdatedCommunityPost, closeMarkFoundDialog]);

    // Avoid object-URL churn and memory leaks for staged images
    const avatarObjectUrl = useMemo(
        () => (pendingAvatar ? URL.createObjectURL(pendingAvatar) : null),
        [pendingAvatar]
    );
    useEffect(() => {
        return () => {
            if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
        };
    }, [avatarObjectUrl]);

    const coverObjectUrl = useMemo(
        () => (pendingCover ? URL.createObjectURL(pendingCover) : null),
        [pendingCover]
    );
    useEffect(() => {
        return () => {
            if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
        };
    }, [coverObjectUrl]);

    const avatarSrc =
        avatarObjectUrl || profile?.avatar_url || profile?.profile_picture || undefined;
    const coverPreview = coverObjectUrl;

    // prefer freshly-fetched feedPosts; otherwise fall back to activity.posts
    const postsForRightRail = feedPosts && feedPosts.length ? feedPosts : activityPosts;

    // Posts privacy
    const canViewPosts = canViewSection(privacy?.posts || 'public');

    // --- helpers to save/restore scroll for profile page ---
    const saveProfileScrollState = useCallback(() => {
        const key = profile?.handle || profile?.public_id || profile?.id;
        if (!key) return;
        try {
            const winY = window.scrollY || document.documentElement.scrollTop || 0;
            sessionStorage.setItem(`ll:profile:${key}:winY`, String(winY));
            // If the posts list has its own scroller, prefer a data attribute if present
            const postsScroller =
                document.querySelector('[data-profile-posts-scroll]') ||
                document.querySelector('.profile-posts-scroller');
            if (postsScroller) {
                sessionStorage.setItem(
                    `ll:profile:${key}:posts:scroll`,
                    String(postsScroller.scrollTop || 0)
                );
            }
        } catch {
            /* ignore */
        }
    }, [profile?.handle, profile?.public_id, profile?.id]);

    // When returning from Post Page, restore the profile scroll positions once
    useEffect(() => {
        if (!profile) return;
        const key = profile?.handle || profile?.public_id || profile?.id;
        if (!key) return;
        try {
            const shouldRestore = sessionStorage.getItem(`ll:profile:${key}:restore`) === '1';
            if (!shouldRestore) return;

            // One-time restore then clear the flag
            sessionStorage.setItem(`ll:profile:${key}:restore`, '0');

            const y = Number(sessionStorage.getItem(`ll:profile:${key}:winY`) || '0');
            requestAnimationFrame(() => {
                window.scrollTo({ top: y, left: 0, behavior: 'auto' });
                const postsScroller =
                    document.querySelector('[data-profile-posts-scroll]') ||
                    document.querySelector('.profile-posts-scroller');
                if (postsScroller) {
                    const st = Number(sessionStorage.getItem(`ll:profile:${key}:posts:scroll`) || '0');
                    postsScroller.scrollTop = st;
                }
            });
        } catch {
            /* ignore */
        }
    }, [profile]);

    const rightRailEl = useMemo(
        () =>
            canViewPosts ? (
                <RightRail
                    me={me}
                    posts={postsForRightRail}
                    profile={profile}
                    editMode={editMode || isMine}
                    onPrivacy={openPrivacy}
                    privacy={{
                        posts: privacy?.posts || 'public',
                        reposts: privacy?.reposts || 'public',
                        likes: privacy?.likes || 'public',
                    }}
                    // NAVIGATE to Post Page instead of opening modal
                    onOpenPost={(post) => {
                        if (!post || !post.id) return;
                        saveProfileScrollState();
                        const key = profile?.handle || profile?.public_id || profile?.id;
                        // Ensure the profile restores its scroll position when navigating back
                        try {
                            sessionStorage.setItem(`ll:profile:${key}:restore`, '1');
                        } catch {
                            /* ignore */
                        }
                        const name =
                            `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Profile';
                        navigate(`/posts/${post.id}`, {
                            state: {
                                post,
                                fromProfile: true,
                                backProfileId: profile?.id,
                                backProfileHandle: key,
                                backProfileName: name,
                                backToProfileUrl: `/${key}`,
                            },
                        });
                    }}
                />
            ) : null,
        [
            canViewPosts,
            me,
            postsForRightRail,
            profile,
            editMode,
            isMine,
            privacy?.posts,
            privacy?.reposts,
            privacy?.likes,
            openPrivacy,
            navigate,
            saveProfileScrollState,
        ]
    );

    // Keep typing responsive
    const [, startTransition] = useTransition();
    const onChangeContact = useCallback(
        (next) => {
            startTransition(() => {
                setContact(next);
            });
        },
        [startTransition]
    );

    // FOLLOW/UNFOLLOW — aligned with user-card follow endpoint
    const toggleFollow = async () => {
        if (!me || !profile?.id) return;
        try {
            const urls = [`${api}/users/follow`, '/api/users/follow', '/users/follow'].filter(Boolean);
            const action = isFollowing ? 'unfollow' : 'follow';
            let ok = false;
            for (const u of urls) {
                try {
                    await axios.post(u, { target_id: profile.id, action }, { withCredentials: true });
                    ok = true;
                    break;
                } catch {}
            }
            if (!ok) throw new Error('follow api failed');

            setIsFollowing(!isFollowing);
            setFlash({
                type: 'success',
                text: `${isFollowing ? 'Unfollowed' : 'Now following'} ${profile.first_name || profile.handle || 'user'}`,
            });
        } catch (err) {
            setFlash({
                type: 'error',
                text: err.response?.data?.message || 'Failed to update follow status.',
            });
        }
    };

    // helper: refetch latest user profile + activity (soft refresh)
    const refetchProfile = async (key) => {
        try {
            const res = await axios.get(`${api}/users/public/${encodeURIComponent(key)}`, { withCredentials: true });
            const p = res.data.profile || {};
            // cache bust media so browser shows new files immediately
            const withBusted = {
                ...p,
                avatar_url: bump(p.avatar_url || p.profile_picture),
                profile_picture: bump(p.profile_picture || p.avatar_url),
                cover_url: bump(p.cover_url),
            };
            setProfile(withBusted);
            setActivity(res.data.activity || {});
            notifyMeUpdated(withBusted);
        } catch {
            // if refetch fails, fallback to a full reload
            window.location.reload();
        }
    };

    /**
     * SAVE PROFILE
     * - Save textual fields (/users/me)
     * - Save first_name/last_name (+ handle if changed) via /users/profile (form-data)
     * - Upload avatar/cover if staged
     * - Refresh view; if handle changed, redirect to the new URL and hard-reload
     */
    const saveProfile = async () => {
        try {
            setHandleError(''); // clear inline username error
            const currentHandle = profile?.handle || '';
            const nextHandle = (handleDraft || '').replace(/^@+/, '');
            const handleChanged = isMine && nextHandle !== currentHandle;

            // validate handle if user changed it
            if (handleChanged && !handleRegex.test(nextHandle)) {
                setHandleError('Username must be 3–30 chars: letters, numbers, dot, dash, underscore.');
                return;
            }

            // normalize contact for save
            const digits = String(contact.phone || '').replace(/\D/g, '').slice(0, 10);
            const phoneFmt =
                digits.length > 6
                    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
                    : digits.length > 3
                        ? `${digits.slice(0, 3)}-${digits.slice(3)}`
                        : digits;

            const canonicalizeSocialForSave = (v, which /* 'facebook'|'instagram' */) => {
                const s = String(v || '').trim();
                if (!s) return '';
                const base = which === 'facebook' ? 'https://facebook.com/' : 'https://instagram.com/';
                const domain = which === 'facebook' ? 'facebook.com' : 'instagram.com';

                if (/^https?:\/\//i.test(s) || s.startsWith('www.')) {
                    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
                    try {
                        const u = new URL(withScheme);
                        if (u.hostname.includes(domain)) {
                            const path = u.pathname.replace(/^\/+/, '');
                            return path ? `${base}${path}` : base;
                        }
                        return withScheme;
                    } catch {
                        return withScheme;
                    }
                }
                if (s.toLowerCase().includes(domain)) {
                    const idx = s.toLowerCase().indexOf(domain);
                    const after = s.slice(idx + domain.length).replace(/^\/+/, '');
                    return `${base}${after}`;
                }
                const handle = s.replace(/^@/, '');
                return `${base}${handle}`;
            };

            const normalizeWebsiteForSave = (input) => {
                const s = String(input || '').trim();
                if (!s) return '';
                const withScheme = /^https?:\/\//i.test(s) ? s : `http://${s}`;
                try {
                    const u = new URL(withScheme);
                    const host = u.hostname.startsWith('www.') ? u.hostname : `www.${u.hostname}`;
                    return `${u.protocol}//${host}${u.pathname}${u.search}${u.hash}`;
                } catch {
                    return withScheme.startsWith('http') ? withScheme : `http://${withScheme}`;
                }
            };

            const prevSJ =
                (profile?.social_json &&
                    (typeof profile.social_json === 'string'
                        ? JSON.parse(profile.social_json || '{}')
                        : profile.social_json)) ||
                {};

            const nextSJ = {
                ...prevSJ,
                contact: {
                    phone: phoneFmt || '',
                    email: String(contact.email || '').trim(),
                    facebook: canonicalizeSocialForSave(contact.facebook, 'facebook'),
                    instagram: canonicalizeSocialForSave(contact.instagram, 'instagram'),
                    website: normalizeWebsiteForSave(contact.website || ''),
                },
            };

            // 1) save fields + social_json.contact
            const payload = {
                bio: bioDraft || '',
                relationship: relationship || null,
                birthday: birthday || null,
                home_city: homeCity || null,
                home_county: homeCounty || null,
                work_history_json: Array.isArray(workHistory) ? workHistory : [],
                education_history_json: Array.isArray(eduHistory) ? eduHistory : [],
                social_json: nextSJ,
            };
            const fieldsRes = await axios.put(`${api}/users/me`, payload, { withCredentials: true });

            // 2) names (and handle if changed) via /users/profile (multipart form-data)
            const fd = new FormData();
            fd.append('first_name', String(firstNameDraft || '').slice(0, 50));
            fd.append('last_name', String(lastNameDraft || '').slice(0, 50));
            if (handleChanged) fd.append('handle', nextHandle);

            try {
                const profRes = await axios.put(`${api}/users/profile`, fd, { withCredentials: true });
                const userFromProf = profRes.data?.user || profRes.data || {};
                setProfile((p) => ({ ...(p || {}), ...userFromProf }));
            } catch (err) {
                const msg =
                    err.response?.data?.message ||
                    'Unable to update username at the moment.';
                setHandleError(msg);
                return; // stop; user will correct the input
            }

            // 3) avatar
            if (deleteAvatar) {
                await axios.delete(`${api}/users/me/avatar`, { withCredentials: true });
                const cleared = { avatar_url: null, profile_picture: null };
                setProfile((p) => (p ? { ...p, ...cleared } : p));
                notifyMeUpdated(cleared);
                setPendingAvatar(null);
            } else if (pendingAvatar) {
                const fdA = new FormData();
                fdA.append('file', pendingAvatar, 'avatar.jpg');
                try {
                    const rA = await axios.put(`${api}/users/me/avatar`, fdA, { withCredentials: true });
                    const uA = rA.data || {};
                    setProfile((p) => (p ? { ...p, ...uA } : uA));
                    notifyMeUpdated(uA);
                } catch {
                    const fdA2 = new FormData();
                    fdA2.append('avatar_file', pendingAvatar, 'avatar.jpg');
                    const rA2 = await axios.put(`${api}/users/me/avatar`, fdA2, { withCredentials: true });
                    const uA2 = rA2.data || {};
                    setProfile((p) => (p ? { ...p, ...uA2 } : uA2));
                    notifyMeUpdated(uA2);
                }
            }

            // 4) cover
            if (deleteCover) {
                await axios.delete(`${api}/users/me/cover`, { withCredentials: true });
                setProfile((p) => (p ? { ...p, cover_url: null } : p));
            } else if (pendingCover) {
                const fdC = new FormData();
                fdC.append('file', pendingCover, 'cover.jpg');
                try {
                    const r = await axios.put(`${api}/users/me/cover`, fdC, { withCredentials: true });
                    const u = r.data || {};
                    setProfile((p) => (p ? { ...p, ...u } : u));
                } catch {
                    const fdC2 = new FormData();
                    fdC2.append('cover_file', pendingCover, 'cover.jpg');
                    const r2 = await axios.put(`${api}/users/me/cover`, fdC2, { withCredentials: true });
                    const u2 = r2.data || {};
                    setProfile((p) => (p ? { ...p, ...u2 } : u2));
                }
            }

            // reflect latest fields from /users/me response
            const updated = fieldsRes.data || {};
            setProfile((p) => ({ ...p, ...updated }));
            notifyMeUpdated(updated);

            // clear staged media + exit edit mode
            setPendingAvatar(null);
            setPendingCover(null);
            setDeleteAvatar(false);
            setDeleteCover(false);
            setEditMode(false);
            setFlash({ type: 'success', text: 'Profile updated.' });

            // Refresh view:
            if (handleChanged) {
                // redirect to new handle and hard reload so the URL and data match
                const to = `/${nextHandle}`;
                navigate(to, { replace: true });
                window.location.replace(to);
            } else {
                // soft refresh (no full page reload)
                const key = profile?.handle || profile?.public_id || profile?.id;
                if (key) await refetchProfile(key);
            }
        } catch (err) {
            setFlash({
                type: 'error',
                text: err.response?.data?.message || 'Failed to save profile.',
            });
        }
    };

    const handleBackToProfile = () => {
        if (new URL(window.location.href).searchParams.get('view') === 'posts') {
            window.history.back();
        }
        setPostsExpanded(false);
    };

    // Restore scroll when expanded view opens
    useEffect(() => {
        if (!postsExpanded || !profile) return;
        const key = profile?.handle || profile?.public_id || profile?.id;
        const saved = Number(sessionStorage.getItem(`ll:profile:${key}:posts:scroll`) || '0');
        const el = postsScrollRef.current;
        if (el && saved > 0) {
            requestAnimationFrame(() => {
                el.scrollTop = saved;
            });
        }
    }, [postsExpanded, profile]);

    // Expanded grid: block any *location-like* anchor clicks (failsafe)
    const blockLocationClicks = useCallback((e) => {
        const t = e?.target;
        if (!t || typeof t.closest !== 'function') return;

        // Any element that looks like the location row (not just anchors)
        const locEl = t.closest(
            '[data-post-location], [data-location], [data-role="location"], .post-location, .postLocation, .location-line'
        );
        const anchor = t.closest('a');
        const href = (anchor?.getAttribute('href') || '').toLowerCase();
        const text = (anchor?.textContent || '').trim().toLowerCase();
        const looksLikeLocation =
            !!locEl ||
            /\/(community|posts)\?/.test(href) && /(location|city|county|region)=/.test(href) ||
            /county|city|parish|borough|township|village|province|state|region|place|location|map/.test(
                href + ' ' + text
            );

        if (looksLikeLocation) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    // Open post page from expanded view
    const openPostFromExpanded = useCallback(
        (post) => {
            if (!post || !post.id) return;
            const key = profile?.handle || profile?.public_id || profile?.id;
            const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Profile';
            const scTop = postsScrollRef.current?.scrollTop || 0;

            try {
                sessionStorage.setItem(`ll:profile:${key}:posts:expanded`, '1');
                sessionStorage.setItem(`ll:profile:${key}:posts:scroll`, String(scTop));
                // Also save window scroll as a fallback
                const winY = window.scrollY || document.documentElement.scrollTop || 0;
                sessionStorage.setItem(`ll:profile:${key}:winY`, String(winY));
            } catch {
                /* ignore */
            }

            const backUrl = `/${profile?.handle || profile?.public_id || profile?.id}?view=posts`;
            navigate(`/posts/${post.id}`, {
                state: {
                    post,
                    fromProfile: true,
                    backProfileId: profile?.id,
                    backProfileHandle: key,
                    backProfileName: name,
                    backToProfileUrl: backUrl,
                },
            });
        },
        [navigate, profile]
    );

    // Gate initial render behind profile + first posts load (and no hard error)
    const pageLoading = !error && (loading || postsBootLoading);
    if (pageLoading) {
        return <FullScreenDots />;
    }

    // Section privacy checks
    const canViewAbout = canViewSection(privacy?.about);
    const canViewContact = canViewSection(privacy?.contact);
    const canViewWork = canViewSection(privacy?.work_history);
    const canViewEducation = canViewSection(privacy?.education_history);
    const canViewFollows = canViewSection(privacy?.follows);
    const canViewPhotos = canViewSection(privacy?.photos);

    return (
        <Box
            sx={{
                pb: 4,
                background: 'linear-gradient(135deg, #f7fbff 0%, #f4f6fb 50%, #f8fafc 100%)',
                minHeight: '100vh',
            }}
        >
            {flash && (
                <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, mt: 1 }}>
                    <Alert severity={flash.type} onClose={() => setFlash(null)}>
                        {flash.text}
                    </Alert>
                </Box>
            )}
            {error && (
                <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, mt: 1 }}>
                    <Alert severity="error" onClose={() => setError('')}>
                        {error}
                    </Alert>
                </Box>
            )}

            {/* MAIN PROFILE — hidden when the expanded page is active */}
            <Box sx={{ display: postsExpanded ? 'none' : 'block' }}>
                <ProfileHeader
                    profile={profile}
                    avatarSrc={avatarSrc}
                    coverPreview={coverPreview}
                    isMine={isMine}
                    editMode={editMode}
                    onEnterEdit={() => setEditMode(true)}
                    onSave={saveProfile}
                    onCancel={() => setDiscardOpen(true)}
                    onChangeAvatar={changeAvatar}
                    onDeleteAvatar={() => {
                        setConfirmType('avatar');
                        setConfirmOpen(true);
                    }}
                    onChangeCover={changeCover}
                    onDeleteCover={() => {
                        setConfirmType('cover');
                        setConfirmOpen(true);
                    }}
                    viewer={me}
                    isFollowing={isFollowing}
                    onToggleFollow={toggleFollow}
                    // handle + name editing props
                    handleDraft={handleDraft}
                    onHandleDraftChange={setHandleDraft}
                    handleStats={handleStats}
                    handleError={handleError}
                    onClearHandleError={() => setHandleError('')}
                    firstNameDraft={firstNameDraft}
                    lastNameDraft={lastNameDraft}
                    onFirstNameDraftChange={setFirstNameDraft}
                    onLastNameDraftChange={setLastNameDraft}
                />

                {/* Two-column grid (collapses to one column if right rail is hidden) */}
                <Box
                    sx={{
                        maxWidth: 1400,
                        mx: 'auto',
                        px: 2,
                        mt: 2,
                        display: 'grid',
                        columnGap: 3,
                        rowGap: 1.5,
                        gridTemplateColumns: {
                            xs: '1fr',
                            md: rightRailEl ? 'minmax(0,500px) minmax(0,1fr)' : '1fr',
                        },
                        alignItems: 'start',
                    }}
                >
                    {/* LEFT rail */}
                    <Box
                        sx={{
                            position: { md: 'sticky' },
                            bottom: { md: 16 },
                            alignSelf: 'start',
                            display: 'grid',
                            gap: 1.5,
                        }}
                    >
                        {/* About */}
                        {canViewAbout && (
                            <SectionCard
                                title="About"
                                privacyKey="about"
                                editMode={editMode || isMine}
                                showPrivacyForOwner={isMine}
                                ownerCanEdit={isMine}
                                currentPrivacy={privacy?.about || 'public'}
                                onPrivacy={openPrivacy}
                            >
                                <AboutSection
                                    editMode={editMode}
                                    isOwner={isMine}
                                    profile={profile}
                                    privacyValue={privacy?.about || 'public'}
                                    isFollower={isFollowing}
                                />
                            </SectionCard>
                        )}

                        {/* Contact */}
                        {canViewContact && (
                            <SectionCard
                                title="Contact"
                                privacyKey="contact"
                                editMode={editMode || isMine}
                                showPrivacyForOwner={isMine}
                                ownerCanEdit={isMine}
                                currentPrivacy={privacy?.contact || 'public'}
                                onPrivacy={openPrivacy}
                            >
                                <ContactSection
                                    editMode={editMode}
                                    isOwner={isMine}
                                    isFollower={isFollowing}
                                    privacyValue={privacy?.contact || 'public'}
                                    contact={contact}
                                    onChange={onChangeContact}
                                />
                            </SectionCard>
                        )}

                        {/* Work History */}
                        {canViewWork && (
                            <SectionCard
                                title="Work History"
                                privacyKey="work_history"
                                editMode={editMode || isMine}
                                showPrivacyForOwner={isMine}
                                ownerCanEdit={isMine}
                                currentPrivacy={privacy?.work_history || 'public'}
                                onPrivacy={openPrivacy}
                                // Show ADD/EDIT for owner even when not in edit mode
                                action={isMine && <Button onClick={() => setWorkOpen(true)}>ADD / EDIT</Button>}
                                maxBodyHeight={240}
                            >
                                {Array.isArray(workHistory) && workHistory.length > 0 ? (
                                    <Box sx={{ display: 'grid', gap: 1.25 }}>
                                        {workHistory.map((w, i) => {
                                            const dateLine = formatRange(w.start_date, w.end_date, w.current);
                                            return (
                                                <Box
                                                    key={`${w.title || 'role'}-${i}`}
                                                    sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}
                                                >
                                                    <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                        <b>Job Title:</b> {w.title || '—'}
                                                    </Typography>
                                                    {w.company && (
                                                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                            <b>Company:</b> {w.company}
                                                        </Typography>
                                                    )}
                                                    {w.location && (
                                                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                            <b>Location:</b> {w.location}
                                                        </Typography>
                                                    )}
                                                    {(w.start_date || w.end_date || w.current) && (
                                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                                            <b>Dates:</b> {dateLine}
                                                        </Typography>
                                                    )}
                                                    {w.description && (
                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                                                            <b>Description:</b> {w.description}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                ) : (
                                    <Typography color="text.secondary">No work history yet.</Typography>
                                )}
                            </SectionCard>
                        )}

                        {/* Education */}
                        {canViewEducation && (
                            <SectionCard
                                title="Education"
                                privacyKey="education_history"
                                editMode={editMode || isMine}
                                showPrivacyForOwner={isMine}
                                ownerCanEdit={isMine}
                                currentPrivacy={privacy?.education_history || 'public'}
                                onPrivacy={openPrivacy}
                                // Show ADD/EDIT for owner even when not in edit mode
                                action={isMine && <Button onClick={() => setEduOpen(true)}>ADD / EDIT</Button>}
                                maxBodyHeight={240}
                            >
                                {Array.isArray(eduHistory) && eduHistory.length > 0 ? (
                                    <Box sx={{ display: 'grid', gap: 1.25 }}>
                                        {eduHistory.map((e, i) => {
                                            const dateLine = formatRange(e.start_date, e.end_date, e.current);
                                            return (
                                                <Box
                                                    key={`${e.school || 'school'}-${i}`}
                                                    sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}
                                                >
                                                    <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                        <b>School:</b> {e.school || '—'}
                                                    </Typography>
                                                    {e.degree && (
                                                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                            <b>Degree:</b> {e.degree}
                                                        </Typography>
                                                    )}
                                                    {e.field && (
                                                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                            <b>Field of Study:</b> {e.field}
                                                        </Typography>
                                                    )}
                                                    {e.location && (
                                                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                                                            <b>Location:</b> {e.location}
                                                        </Typography>
                                                    )}
                                                    {(e.start_date || e.end_date || e.current) && (
                                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                                            <b>Dates:</b> {dateLine}
                                                        </Typography>
                                                    )}
                                                    {e.description && (
                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                                                            <b>Description:</b> {e.description}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                ) : (
                                    <Typography color="text.secondary">No education listed yet.</Typography>
                                )}
                            </SectionCard>
                        )}

                        {/* Followers & Following */}
                        {canViewFollows && (
                            <SectionCard
                                title="Followers & Following"
                                privacyKey="follows"
                                editMode={editMode || isMine}
                                showPrivacyForOwner={isMine}
                                ownerCanEdit={isMine}
                                currentPrivacy={privacy?.follows || 'public'}
                                onPrivacy={openPrivacy}
                                action={
                                    <Button size="small" onClick={() => followsRef.current?.openAll()}>
                                        VIEW ALL
                                    </Button>
                                }
                                maxBodyHeight={420}
                            >
                                <FollowsSection
                                    ref={followsRef}
                                    viewer={me}
                                    profileId={profile?.id}
                                    profileHandle={profile?.handle}
                                    profileAvatar={avatarSrc}
                                    profileName={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}
                                    profileUsername={profile?.handle || profile?.public_id || profile?.id}
                                    onFlash={setFlash}
                                    isFollowingProfile={isFollowing}
                                    onToggleFollowProfile={toggleFollow}
                                    showFollowingTabInSection={true}
                                />
                            </SectionCard>
                        )}

                        {/* Photos */}
                        {canViewPhotos && (
                            <PhotosSection
                                profileHandle={profile?.handle || profile?.public_id || profile?.id}
                                isOwner={isMine}
                                viewer={me}
                                editMode={editMode}
                                onOpenPrivacy={(e) => openPrivacy(e, 'photos')}
                                currentPrivacy={privacy?.photos || 'public'}
                                canView={canViewPhotos}
                            />
                        )}
                    </Box>

                    {/* RIGHT rail */}
                    {rightRailEl}
                </Box>
            </Box>

            {/* EXPANDED COMMUNITY POSTS PAGE */}
            {postsExpanded && canViewPosts && (
                <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, pt: 2, pb: 4 }}>
                    {/* Back control */}
                    <Button onClick={handleBackToProfile} startIcon={<ArrowBackIcon />} sx={{ textTransform: 'none', mb: 1 }}>
                        Return to Profile
                    </Button>

                    {/* Community Posts card */}
                    <Card
                        variant="outlined"
                        sx={{
                            borderRadius: 3,
                            overflow: 'hidden',
                            borderColor: 'rgba(2,6,23,0.08)',
                            boxShadow: '0 6px 20px rgba(2,6,23,0.08)',
                            bgcolor: '#fff',
                            display: 'grid',
                            gridTemplateRows: 'auto 1fr',
                            minHeight: 0,
                        }}
                    >
                        {/* Bar */}
                        <Box
                            sx={{
                                px: 2,
                                py: 1,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                background:
                                    'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.00) 60%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <Typography variant="h6">Community Posts</Typography>
                            <Box />
                        </Box>

                        {/* Scrollable body */}
                        <CardContent
                            sx={{
                                p: { xs: 1.25, sm: 2 },
                                minHeight: 0,
                                height: {
                                    xs: 'calc(100vh - 220px)',
                                    md: 'calc(100vh - 260px)',
                                },
                                overflowY: 'auto',
                            }}
                            ref={postsScrollRef}
                            onClickCapture={blockLocationClicks}
                        >
                            <Box
                                sx={{
                                    display: 'grid',
                                    gap: 2,
                                    gridTemplateColumns: {
                                        xs: '1fr',
                                        sm: 'repeat(2, minmax(0, 1fr))',
                                        lg: 'repeat(3, minmax(0, 1fr))',
                                    },
                                    alignContent: 'start',
                                    pb: 1,
                                }}
                            >
                                {(postsForRightRail || []).map((p) => (
                                    <ProfilePostCard
                                        key={`${p.category || 'post'}-${p.id}`}
                                        post={p}
                                        user={me}
                                        hoveredId={hoveredId}
                                        setHoveredId={setHoveredId}
                                        // Location clicks are intentionally disabled by the ProfilePostCard wrapper
                                        onCardClick={openPostFromExpanded}
                                        onOpenUserCard={(el, post) => {
                                            setUserAnchor(el);
                                            setUserForCard({
                                                id: post.user_id || post.id,
                                                first_name: post.first_name,
                                                last_name: post.last_name,
                                                handle: post.handle,
                                                avatar_url: post.avatar_url || post.profile_picture,
                                            });
                                        }}
                                        onOpenShare={(post) => {
                                            setSharePost(post);
                                            setShareOpen(true);
                                        }}
                                    />
                                ))}
                            </Box>
                        </CardContent>
                    </Card>

                    {/* helpers */}
                    <UserCardPopover
                        anchorEl={userAnchor}
                        onClose={() => setUserAnchor(null)}
                        user={userForCard}
                        isSelf={!!(me && me.handle === userForCard?.handle)}
                        following={false}
                        onFollow={() => {}}
                        onMessage={() =>
                            window.dispatchEvent(
                                new CustomEvent('open-message-center', {
                                    detail: { userId: userForCard?.id },
                                })
                            )
                        }
                        onViewProfile={(u) => {
                            setUserAnchor(null);
                            navigate(`/${u.handle || u.id}`);
                        }}
                    />
                    <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={me} post={sharePost} />
                </Box>
            )}

            {/* Work / Education modals */}
            <HistoryDialog
                type="work"
                open={workOpen}
                onClose={() => setWorkOpen(false)}
                value={workHistory}
                onChange={setWorkHistory}
            />
            <HistoryDialog
                type="education"
                open={eduOpen}
                onClose={() => setEduOpen(false)}
                value={eduHistory}
                onChange={setEduHistory}
            />

            {/* Cropper */}
            <ImageCropDialog
                open={cropOpen}
                src={cropSrc}
                aspect={cropRound ? 1 : 3.2}
                round={cropRound}
                onClose={() => setCropOpen(false)}
                onCropped={onCropped}
            />

            {/* Delete confirmations (X in corner; no click-away close) */}
            <Dialog
                open={confirmOpen}
                onClose={(_, reason) => {
                    if (reason !== 'backdropClick') setConfirmOpen(false);
                }}
            >
                <DialogTitle
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    {confirmType === 'avatar' ? 'Delete profile picture?' : 'Delete cover photo?'}
                    <IconButton onClick={() => setConfirmOpen(false)} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
                    <Button color="error" onClick={confirmType === 'avatar' ? doDeleteAvatar : doDeleteCover}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Discard changes (X in corner; no click-away close) */}
            <Dialog
                open={discardOpen}
                onClose={(_, reason) => {
                    if (reason !== 'backdropClick') setDiscardOpen(false);
                }}
            >
                <DialogTitle
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    Discard all changes?
                    <IconButton onClick={() => setDiscardOpen(false)} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogActions>
                    <Button onClick={() => setDiscardOpen(false)}>Cancel</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            // reset staged edits
                            setPendingAvatar(null);
                            setPendingCover(null);
                            setDeleteAvatar(false);
                            setDeleteCover(false);
                            setEditMode(false);
                            setDiscardOpen(false);
                            setFlash({ type: 'info', text: 'Changes discarded.' });
                        }}
                    >
                        Discard
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Privacy popover (X in corner; block outside click) */}
            <Popover
                open={!!privacyAnchor}
                anchorEl={privacyAnchor}
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return; // don't close from outside click
                    setPrivacyAnchor(null);
                    setPrivacyFor(null);
                }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, pt: 1 }}>
                    <Typography variant="subtitle2">Privacy</Typography>
                    <IconButton
                        size="small"
                        onClick={() => {
                            setPrivacyAnchor(null);
                            setPrivacyFor(null);
                        }}
                        aria-label="Close"
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
                <Box sx={{ px: 2, pb: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {`Who can see this ${privacyFor === 'posts' ? 'section' : 'field'}?`}
                    </Typography>
                    <RadioGroup value={(privacy && privacy[privacyFor]) || 'public'} onChange={(e) => setPrivacyLevel(e.target.value)}>
                        <FormControlLabel value="public" control={<Radio />} label="Public" />
                        <FormControlLabel value="friends" control={<Radio />} label="Followers" />
                        <FormControlLabel value="private" control={<Radio />} label="Only Me" />
                    </RadioGroup>
                </Box>
            </Popover>

            {/* Edit community post dialog */}
            <Dialog
                open={editOpen}
                fullWidth
                maxWidth="sm"
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return;
                    closeEditDialog();
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Edit Post
                    <IconButton onClick={closeEditDialog} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {editError ? (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {editError}
                        </Alert>
                    ) : null}

                    {editLoading ? (
                        <Typography variant="body2" color="text.secondary">
                            Loading post...
                        </Typography>
                    ) : null}

                    {editDraft ? (
                        <Stack spacing={2} sx={{ mt: editLoading ? 1 : 0 }}>
                            <TextField
                                label="Category"
                                value={editPost?.categoryLabel || editPost?.category || ''}
                                fullWidth
                                disabled
                            />
                            <TextField
                                label="Title"
                                value={editDraft.title}
                                onChange={(e) =>
                                    setEditDraft((prev) => ({ ...prev, title: e.target.value }))
                                }
                                fullWidth
                            />
                            <TextField
                                label="Description"
                                value={editDraft.description}
                                onChange={(e) =>
                                    setEditDraft((prev) => ({ ...prev, description: e.target.value }))
                                }
                                fullWidth
                                multiline
                                minRows={4}
                            />

                            <Divider />
                            <Typography variant="subtitle2">Location</Typography>
                            <TextField
                                label="Street Address"
                                value={editDraft.street_address}
                                onChange={(e) =>
                                    setEditDraft((prev) => ({ ...prev, street_address: e.target.value }))
                                }
                                fullWidth
                            />
                            <TextField
                                label="City"
                                value={editDraft.city}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, city: e.target.value }))}
                                fullWidth
                            />
                            <TextField
                                label="County"
                                value={editDraft.county}
                                onChange={(e) =>
                                    setEditDraft((prev) => ({ ...prev, county: e.target.value }))
                                }
                                fullWidth
                            />

                            {/* Category-specific fields */}
                            {String(editPost?.category || '').toLowerCase() === 'lost-and-found' ? (
                                <>
                                    <Divider />
                                    <Typography variant="subtitle2">Lost &amp; Found</Typography>
                                    <TextField
                                        select
                                        label="Lost or Found"
                                        value={editDraft.lost_or_found}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, lost_or_found: e.target.value }))
                                        }
                                        fullWidth
                                    >
                                        <MenuItem value="">—</MenuItem>
                                        <MenuItem value="lost">Lost</MenuItem>
                                        <MenuItem value="found">Found</MenuItem>
                                    </TextField>
                                    <TextField
                                        label="Reward"
                                        value={editDraft.reward}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, reward: e.target.value }))
                                        }
                                        fullWidth
                                    />
                                </>
                            ) : null}

                            {String(editPost?.category || '').toLowerCase() === 'recommendations-and-tips' ? (
                                <>
                                    <Divider />
                                    <Typography variant="subtitle2">Recommendation / Tip</Typography>
                                    <TextField
                                        label="Type"
                                        value={editDraft.rec_type}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, rec_type: e.target.value }))
                                        }
                                        fullWidth
                                    />
                                </>
                            ) : null}

                            {String(editPost?.category || '').toLowerCase() === 'volunteer-help' ? (
                                <>
                                    <Divider />
                                    <Typography variant="subtitle2">Volunteer Help</Typography>
                                    <TextField
                                        label="Help Type"
                                        value={editDraft.help_type}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, help_type: e.target.value }))
                                        }
                                        fullWidth
                                    />
                                    <TextField
                                        label="Request Kind"
                                        value={editDraft.request_kind}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, request_kind: e.target.value }))
                                        }
                                        fullWidth
                                    />
                                    <TextField
                                        label="Needed Date"
                                        type="date"
                                        value={editDraft.needed_date}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, needed_date: e.target.value }))
                                        }
                                        InputLabelProps={{ shrink: true }}
                                        fullWidth
                                    />
                                    <TextField
                                        label="Contact"
                                        value={editDraft.contact}
                                        onChange={(e) =>
                                            setEditDraft((prev) => ({ ...prev, contact: e.target.value }))
                                        }
                                        fullWidth
                                    />
                                </>
                            ) : null}

                            <Alert severity="info">
                                You can edit a post up to 5 times within a 24-hour window.
                            </Alert>
                        </Stack>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeEditDialog} disabled={editSaving}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={submitEditPost}
                        disabled={!editDraft || editLoading || editSaving}
                    >
                        {editSaving ? 'Saving…' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Post edit history dialog */}
            <Dialog
                open={historyOpen}
                fullWidth
                maxWidth="md"
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return;
                    closeHistoryDialog();
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Post Edit History
                    <IconButton onClick={closeHistoryDialog} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {historyError ? (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {historyError}
                        </Alert>
                    ) : null}

                    {historyLoading ? (
                        <Typography variant="body2" color="text.secondary">
                            Loading history...
                        </Typography>
                    ) : null}

                    {!historyLoading && (!historyRows || historyRows.length === 0) ? (
                        <Typography variant="body2" color="text.secondary">
                            No edit history available.
                        </Typography>
                    ) : null}

                    {Array.isArray(historyRows) && historyRows.length ? (
                        <List>
                            {historyRows.map((row) => {
                                const snap = row?.snapshot || {};
                                const when = row?.edited_at
                                    ? new Date(row.edited_at).toLocaleString()
                                    : '';
                                const who = row?.editor_handle ? `@${row.editor_handle}` : '';
                                const headerBits = [
                                    `Version ${row.version}`,
                                    row.action ? `(${row.action})` : '',
                                    when,
                                    who,
                                ].filter(Boolean);
                                const locBits = [snap.street_address, snap.city, snap.county]
                                    .map((v) => (v ? String(v).trim() : ''))
                                    .filter(Boolean);
                                const locLine = locBits.length ? locBits.join(', ') : '';

                                return (
                                    <Box key={row.id || `${row.post_id}-${row.version}`} sx={{ mb: 2 }}>
                                        <ListItem disableGutters>
                                            <ListItemText
                                                primary={headerBits.join(' • ')}
                                                secondary={
                                                    <Box sx={{ mt: 0.5 }}>
                                                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                                            {snap.title || '(No title)'}
                                                        </Typography>
                                                        {locLine ? (
                                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                                {locLine}
                                                            </Typography>
                                                        ) : null}
                                                        {snap.description ? (
                                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                                {snap.description}
                                                            </Typography>
                                                        ) : null}

                                                        {/* Category-specific */}
                                                        {snap.lost_or_found ? (
                                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                                Lost/Found: {snap.lost_or_found}
                                                                {snap.reward ? ` • Reward: ${snap.reward}` : ''}
                                                                {snap.resolved_at ? ' • Marked Found' : ''}
                                                            </Typography>
                                                        ) : null}
                                                        {snap.help_type || snap.request_kind || snap.needed_date ? (
                                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                                {snap.help_type ? `Help: ${snap.help_type}` : ''}
                                                                {snap.request_kind ? ` • Kind: ${snap.request_kind}` : ''}
                                                                {snap.needed_date ? ` • Needed: ${String(snap.needed_date).slice(0, 10)}` : ''}
                                                            </Typography>
                                                        ) : null}
                                                        {snap.rec_type ? (
                                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                                Type: {snap.rec_type}
                                                            </Typography>
                                                        ) : null}
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                        <Divider />
                                    </Box>
                                );
                            })}
                        </List>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeHistoryDialog}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Mark Lost item as Found */}
            <Dialog
                open={markFoundOpen}
                fullWidth
                maxWidth="sm"
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return;
                    closeMarkFoundDialog();
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Mark as Found
                    <IconButton onClick={closeMarkFoundDialog} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {markFoundError ? (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {markFoundError}
                        </Alert>
                    ) : null}

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {markFoundPost?.title
                            ? `You're marking “${markFoundPost.title}” as found.`
                            : 'You are marking this item as found.'}
                        {' '}This will update the post card to show “Marked as Found by the Owner”.
                        You can optionally add an update message (e.g., “Update: Thank you all for looking!”).
                    </Typography>

                    <TextField
                        label="Update message (optional)"
                        value={markFoundMessage}
                        onChange={(e) => setMarkFoundMessage(e.target.value)}
                        fullWidth
                        multiline
                        minRows={3}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeMarkFoundDialog} disabled={markFoundSaving}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={submitMarkFound} disabled={markFoundSaving}>
                        {markFoundSaving ? 'Saving…' : 'Mark as Found'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Removed: PostDetailModal (we now route to /posts/:id) */}
        </Box>
    );
}
