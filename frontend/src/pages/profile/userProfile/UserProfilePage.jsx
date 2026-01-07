// src/pages/profile/userProfile/UserProfilePage.jsx
// Layout: LEFT rail (About → Contact → Work → Education → Followers & Following → Photos → Location)
// RIGHT rail: Tabbed Community Activity (Posts / Likes / Reposts)
//
// Updates in this version:
// - NEW: Right-rail is now a single card with tabs (Posts / Likes / Reposts) so Likes/Reposts are not pushed to the bottom.
// - FIX: Profile posts list no longer incorrectly calls /users/:id/engagement/posts for the user's own posts.
//        Likes/Reposts are loaded by the tab card using that endpoint; owner Posts come from /users/public/:handleOrId.
// - All existing save/crop/delete flows preserved.
// - Existing scroll-restore behavior preserved.
//
// UPDATE (Profile Posts Filters + Counts + 50-at-a-time):
// - Category dropdown uses the same human category names as Community.
// - Count text is filter-accurate: "Displaying X of Y posts".
// - Expanded posts view shows filters at top (Search, Category, Sort) and scrolls to top on expand.
// - Profile posts render 50 at a time, loading more as you scroll (via ProfilePostsList + expanded grid chunking).

import React, {useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect} from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { alpha } from '@mui/material/styles';
import {
    Alert,
    Box,
    Avatar,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Popover,
    Radio,
    RadioGroup,
    Select,
    FormControlLabel,
    TextField,
    Tab,
    Tabs,
    Tooltip,
    Typography,
} from '@mui/material';
import { keyframes } from '@mui/system';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PublicIcon from '@mui/icons-material/Public';
import CloseIcon from '@mui/icons-material/Close';

import ProfileHeader from './ProfileHeader';
import AboutSection from './AboutSection';
import ContactSection from './ContactSection';
import HistoryDialog from './HistoryDialog';
import ImageCropDialog from './ImageCropDialog';
import FollowsSection from './FollowsSection';
import PhotosSection from './PhotosSection';

import postsIcon from '../../../assets/posts_icon.png';
import likeIconLit from '../../../assets/actionBar/like_icon_lit.png';
import repostIconLit from '../../../assets/actionBar/repost_lit.png';
import commentIconLit from '../../../assets/actionBar/comment_lit.png';

import ProfileEngagementTabs from './ProfileEngagementTabs';

// Used by expanded posts page
import { ProfilePostCard } from './ProfilePostsList';
import UserCardPopover from '../../../components/UserCardPopover';
import SharePostDialog from '../../../components/SharePostDialog';
import EditCommunityPostDialog from '../../../components/community/EditCommunityPostDialog';
import DeletePostConfirmDialog from '../../../components/community/DeletePostConfirmDialog';

const api = process.env.REACT_APP_API_URL;

// same rule as Register.jsx (3–30, letters/numbers/dot/dash/underscore)
const handleRegex = /^[a-zA-Z0-9_.-]{3,30}$/;

const privacyLabel = (val) =>
    val === 'private' ? 'Only Me' : val === 'friends' ? 'Followers' : 'Public';


function ExpandedTabIcon({ src, alt = '', size = 20, squeezeX = 1 }) {
    const sx = Number(squeezeX) || 1;
    return (
        <Box
            component="img"
            src={src}
            alt={alt}
            draggable={false}
            sx={{
                width: size,
                height: size,
                display: 'block',
                objectFit: 'contain',
                mr: 0.9,
                transform: sx === 1 ? 'none' : `scaleX(${sx})`,
                transformOrigin: 'center',
                filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.12))',
            }}
        />
    );
}

function ExpandedEmptyState({ iconSrc, title, subtitle }) {
    return (
        <Box
            sx={{
                py: 5,
                px: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                minHeight: 220,
            }}
        >
            {iconSrc ? (
                <Box
                    sx={(t) => ({
                        width: { xs: 92, sm: 104 },
                        height: { xs: 92, sm: 104 },
                        borderRadius: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 1.75,
                        background: alpha(t.palette.secondary.main, 0.10),
                        border: `1px solid ${alpha(t.palette.secondary.main, 0.22)}`,
                        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
                    })}
                >
                    <Box
                        component="img"
                        src={iconSrc}
                        alt=""
                        draggable={false}
                        sx={{
                            width: { xs: 56, sm: 62 },
                            height: { xs: 56, sm: 62 },
                            objectFit: 'contain',
                            opacity: 1,
                        }}
                    />
                </Box>
            ) : null}

            <Typography sx={{ fontWeight: 900, fontSize: 22, color: '#0f172a' }}>
                {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 560 }}>
                {subtitle}
            </Typography>
        </Box>
    );
}


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
                         fixedBodyHeight = false,
                         contentSx,
                         cardSx,
                         showPrivacyForOwner = false,
                         ownerCanEdit = false,
                         currentPrivacy = 'public',
                     }) => (
    <Card
        variant="outlined"
        sx={{
            borderRadius: 3,
            overflow: 'visible',
            borderColor: (t) => alpha(t.palette.primary.main, 0.14),
            boxShadow: '0 14px 44px rgba(15, 23, 42, 0.10)',
            bgcolor: '#FFFFFF',
            backdropFilter: 'none',
            ...(cardSx || null),
        }}
    >
        <Box
            sx={{
                p: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: (t) => `linear-gradient(90deg, ${alpha(t.palette.secondary.main, 0.18)} 0%, ${alpha(t.palette.secondary.main, 0.04)} 60%, rgba(255,255,255,0) 100%)`,
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
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>
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
                ...(maxBodyHeight
                    ? {
                        maxHeight: maxBodyHeight,
                        ...(fixedBodyHeight ? { minHeight: maxBodyHeight } : null),
                        overflowY: 'auto',
                    }
                    : null),
                ...(contentSx || null),
            }}
        >
            {children}
        </CardContent>
    </Card>
);

/* categories (same naming as Community page) */
const PROFILE_CATEGORY_OPTIONS = [
    { value: '', label: 'All Categories' },
    { value: 'announcement', label: 'Announcements' },
    { value: 'general-discussion', label: 'General Discussion' },
    { value: 'help-requests', label: 'Help Requests' },
    { value: 'lost-and-found', label: 'Lost & Found' },
    { value: 'public-safety-alerts', label: 'Public Safety Alerts' },
    { value: 'tips', label: 'Tips' },
    { value: 'recommendations', label: 'Recommendations' },
    { value: 'volunteers', label: 'Volunteers' },
];

const ENABLE_EDIT_DETAIL_SECTIONS = false;


function normalizeCategoryKey(v) {
    const s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'public-safety') return 'public-safety-alerts';
    if (s === 'recommendation') return 'recommendations';
    return s;
}

function matchesCategoryFilter(postCatRaw, selected) {
    const selectedKey = normalizeCategoryKey(selected);
    if (!selectedKey) return true;

    const postKey = normalizeCategoryKey(postCatRaw);

    if (selectedKey === 'recommendations') {
        return postKey === 'recommendations' || postKey === 'recommendations-tips' || postKey === 'recommendation';
    }
    if (selectedKey === 'tips') {
        return postKey === 'tips' || postKey === 'recommendations-tips';
    }
    if (selectedKey === 'help-requests') {
        return (
            postKey === 'help-requests' ||
            postKey === 'volunteer-requests' ||
            postKey === 'volunteer-help' ||
            postKey === 'volunteer-help-requests' ||
            postKey === 'volunteer-and-help-requests'
        );
    }
    if (selectedKey === 'volunteers') {
        return (
            postKey === 'volunteers' ||
            postKey === 'volunteer-requests' ||
            postKey === 'volunteer-help' ||
            postKey === 'volunteer-help-requests' ||
            postKey === 'volunteer-and-help-requests'
        );
    }

    return postKey === selectedKey;
}


function sortPosts(list, sortKey) {
    const out = Array.isArray(list) ? list.slice() : [];
    if (sortKey === 'popular') {
        out.sort((a, b) => Number(b?.likesCount ?? b?.likes_count ?? b?.likes ?? 0) - Number(a?.likesCount ?? a?.likes_count ?? a?.likes ?? 0));
        return out;
    }
    out.sort((a, b) => new Date(b?.posted_at || b?.date_created || 0) - new Date(a?.posted_at || a?.date_created || 0));
    return out;
}

export default function UserProfilePage({ me }) {
    const { handleOrId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

// Pre-scroll: React Router may preserve scroll position between routes.
// Start at the top unless this navigation is a "Return to Profile" restore flow.
    useLayoutEffect(() => {
        if (!handleOrId) return;

        let shouldRestore = false;
        try {
            shouldRestore = sessionStorage.getItem(`ll:profile:${handleOrId}:restore`) === '1';
            if (!shouldRestore && typeof handleOrId === 'string') {
                const norm = handleOrId.replace(/^@/, '');
                shouldRestore = sessionStorage.getItem(`ll:profile:${norm}:restore`) === '1';
            }
            if (!shouldRestore) {
                shouldRestore = !!location?.state?.restoreProfile;
            }
        } catch {
            /* ignore */
        }

        if (!shouldRestore) {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }

        // allow the “forceTop” guard to run once after data loads
        try {
            sessionStorage.removeItem(`ll:profile:${handleOrId}:forcedTop`);
        } catch {
            /* ignore */
        }
    }, [handleOrId]);


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

    // Account privacy (public vs followers-only)
    const [accountPrivacyDraft, setAccountPrivacyDraft] = useState('public');

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

    // Refresh trigger for Followers/Following section when follow state changes
    const [followsRefreshNonce, setFollowsRefreshNonce] = useState(0);

    const [postsRefreshNonce, setPostsRefreshNonce] = useState(0);

    // Staged media
    const [pendingAvatar, setPendingAvatar] = useState(null);
    const [deleteAvatar, setDeleteAvatar] = useState(false);

    // Determine whether the Edit Profile dialog has any unsaved changes.


// Crop
    const [cropOpen, setCropOpen] = useState(false);
    const [cropSrc, setCropSrc] = useState('');
    const [cropRound, setCropRound] = useState(false); // true = avatar
// Dialogs
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);

    // Privacy
    const [privacy, setPrivacy] = useState({});
    const [privacyAnchor, setPrivacyAnchor] = useState(null);
    const [privacyFor, setPrivacyFor] = useState(null);

    // Flash
    const [flash, setFlash] = useState(null);

    // Auto-dismiss flash banner when the user interacts anywhere
    useEffect(() => {
        if (!flash) return;

        const clear = () => setFlash(null);

        window.addEventListener('pointerdown', clear, true);
        window.addEventListener('keydown', clear, true);
        return () => {
            window.removeEventListener('pointerdown', clear, true);
            window.removeEventListener('keydown', clear, true);
        };
    }, [flash]);

    // "View All" control for Follows section (handled via ref)
    const followsRef = useRef(null);

    // Expanded Community Posts page
    const [postsExpanded, setPostsExpanded] = useState(false);
    const [expandedTab, setExpandedTab] = useState(0); // 0=Posts, 1=Comments, 2=Likes, 3=Reposts
    const [hoveredId, setHoveredId] = useState(null);
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    // Scroll ref for the expanded posts area
    const postsScrollRef = useRef(null);


    // Prevent the entire page from scrolling behind the expanded Community Activity overlay.
    // (The overlay has its own internal scroll area.)
    useEffect(() => {
        if (!postsExpanded) return undefined;
        if (typeof document === 'undefined') return undefined;

        const prevBodyOverflow = document.body.style.overflow;
        const prevHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevHtmlOverflow;
        };
    }, [postsExpanded]);

    // Desktop layout: keep BOTH columns pinned to the viewport and use internal scroll areas.
// This keeps the profile loading at the top and avoids page-level scrolling on desktop.
    const pageRef = useRef(null);
    const gridRef = useRef(null);
    const leftColRef = useRef(null);
    const rightColRef = useRef(null);

    const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return !!window.matchMedia('(min-width:900px)').matches;
    });
    const [desktopContainerHeight, setDesktopContainerHeight] = useState(null);
    const [rightScrollBoxHeight, setRightScrollBoxHeight] = useState(680);
    const desktopHeightsLockedRef = useRef(false);

// Slight bottom gutter so the last card shadow isn’t clipped
    const RIGHT_BOTTOM_GUTTER = 240;

    useEffect(() => {
        const mq = window.matchMedia('(min-width:900px)');
        const apply = () => setIsDesktopLayout(!!mq.matches);
        apply();
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        }
        mq.addListener(apply);
        return () => mq.removeListener(apply);
    }, []);


    useLayoutEffect(() => {
        if (!isDesktopLayout || postsExpanded) return;

        // Fix the right rail to a stable height so the Community Activity card doesn't "pulse" as content loads.
        // Only compute once per desktop session.
        if (desktopHeightsLockedRef.current && rightScrollBoxHeight) return;

        const minH = 560;
        const maxH = 720;

        // Use viewport height only (avoid gridTop changes causing reflow).
        const raw = window.innerHeight - 200; // header / nav / breathing room
        const h = Math.max(minH, Math.min(maxH, Math.floor(raw)));

        setRightScrollBoxHeight(h);
        desktopHeightsLockedRef.current = true;
    }, [isDesktopLayout, postsExpanded, rightScrollBoxHeight]);

// Community post dialogs (profile page)

    const [editOpen, setEditOpen] = useState(false);
    const [editPostId, setEditPostId] = useState(null);

    // Shared delete confirm (used by Delete buttons on post cards)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletePostId, setDeletePostId] = useState(null);

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

    const isMine = !!(me && profile && me.id === profile.id);

    // Determine whether the Edit Profile dialog has any unsaved changes.



    // Username (handle) editing
    const [handleDraft, setHandleDraft] = useState('');
    const [handleStats, setHandleStats] = useState({ remaining: 0, nextAllowed: null });
    const [handleError, setHandleError] = useState('');

    // Name (first/last) editing
    const [firstNameDraft, setFirstNameDraft] = useState('');
    const [lastNameDraft, setLastNameDraft] = useState('');

    // Determine whether the Edit Profile dialog has any unsaved changes.
    const isEditDirty = useMemo(() => {
        if (!isMine || !profile) return false;

        const norm = (v) => String(v ?? '').trim();
        const normLower = (v) => norm(v).toLowerCase();

        const changed =
            norm(bioDraft).slice(0, 50) !== norm(profile?.bio).slice(0, 50) ||
            norm(relationship) !== norm(profile?.relationship) ||
            norm(birthday) !== norm(profile?.birthday) ||
            norm(homeCity) !== norm(profile?.home_city) ||
            norm(homeCounty) !== norm(profile?.home_county) ||
            (accountPrivacyDraft === 'private' ? 1 : 0) !== (profile?.is_private ? 1 : 0) ||
            norm(firstNameDraft) !== norm(profile?.first_name) ||
            norm(lastNameDraft) !== norm(profile?.last_name) ||
            normLower(handleDraft).replace(/^@+/, '') !== normLower(profile?.handle).replace(/^@+/, '') ||
            Boolean(pendingAvatar) ||
            Boolean(deleteAvatar);

        // NOTE: Contact fields are saved as part of /users/me, but the edit popup currently focuses on core profile fields.
        return Boolean(changed);
    }, [
        isMine,
        profile,
        bioDraft,
        relationship,
        birthday,
        homeCity,
        homeCounty,
        accountPrivacyDraft,
        firstNameDraft,
        lastNameDraft,
        handleDraft,
        pendingAvatar,
        deleteAvatar,
    ]);


    // Track first render to avoid blanking UI on background refreshes
    const initialLoadRef = useRef(true);

    // Listen for per-card action requests (dispatched by ProfilePostCard)
    useEffect(() => {
        const onReqEdit = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || 0);
            if (!pid) return;
            setEditPostId(pid);
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

        const onReqDelete = (e) => {
            const pid = Number(e?.detail?.postId || e?.detail?.post?.id || e?.detail?.id || 0);
            if (!pid) return;
            setDeletePostId(pid);
            setDeleteConfirmOpen(true);
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
        window.addEventListener('ll:communityPost:requestDelete', onReqDelete);

        return () => {
            window.removeEventListener('ll:communityPost:requestEdit', onReqEdit);
            window.removeEventListener('ll:communityPost:requestHistory', onReqHistory);
            window.removeEventListener('ll:communityPost:requestMarkFound', onReqMarkFound);
            window.removeEventListener('ll:communityPost:requestDelete', onReqDelete);
        };
    }, []);

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
                const msg = err?.response?.data?.message || err?.message || 'Could not load edit history.';
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

    const formatDate = (v) => {
        const d = v ? new Date(v) : null;
        if (!d || Number.isNaN(d.valueOf())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };
    const formatTime = (v) => {
        const d = v ? new Date(v) : null;
        if (!d || Number.isNaN(d.valueOf())) return '';
        return d
            .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
            .toLowerCase();
    };
    const dateTimeLabel = (v) => {
        const a = formatDate(v);
        const b = formatTime(v);
        return a && b ? `${a} · ${b}` : a || b || '';
    };

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
                const res = await axios.get(`${api}/users/public/${encodeURIComponent(handleOrId)}`, {
                    withCredentials: true,
                    signal: controller.signal,
                });
                if (!alive) return;

                const p = res.data.profile;
                setProfile(p);
                setActivity(res.data.activity || {});
                setBioDraft(String(p?.bio || '').slice(0, 50));
                setRelationship(p?.relationship || '');
                setBirthday(p?.birthday || '');
                setHomeCity(p?.home_city || '');
                setHomeCounty(p?.home_county || '');
                setHandleDraft(p?.handle || '');
                setFirstNameDraft(p?.first_name || '');
                setLastNameDraft(p?.last_name || '');
                setAccountPrivacyDraft(p?.is_private ? 'private' : 'public');

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
                setDeleteAvatar(false);
                setEditMode(false);
            } catch (err) {
                if (alive) setError(err.response?.data?.message || 'Failed to load profile.');
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
        const open = (e) => {
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'posts');
            window.history.pushState({ view: 'posts' }, '', url);
            const detail = e?.detail;
            const idxRaw = typeof detail === 'number' ? detail : detail?.tabIndex;
            const idx = Number.isFinite(Number(idxRaw)) ? Number(idxRaw) : 0;
            setExpandedTab(idx);
            setPostsExpanded(true);

            // required: scroll to top when expanding
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            requestAnimationFrame(() => {
                if (postsScrollRef.current) postsScrollRef.current.scrollTop = 0;
            });
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
    const onCropped = (blob) => {
        setPendingAvatar(blob);
        setDeleteAvatar(false);
        setCropOpen(false);
    };

    // 🔔 helper: cache-bust a URL (so new images render immediately)
    const bump = useCallback((url) => (url ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : url), []);
    // 🔔 helper: cache-bust post photo urls while preserving the original photos type
    const bumpPhotos = useCallback(
        (photosRaw) => {
            if (photosRaw == null) return photosRaw;

            const bumpOne = (u) => bump(String(u || '').trim());

            // Array form
            if (Array.isArray(photosRaw)) {
                return photosRaw.map(bumpOne);
            }

            // String form: either JSON array string or single URL
            if (typeof photosRaw === 'string') {
                const raw = photosRaw.trim();
                if (!raw || raw === 'null') return photosRaw;

                if (raw.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) return JSON.stringify(parsed.map(bumpOne));
                        // not an array; fall back
                    } catch {
                        // ignore parse failures
                    }
                }

                return bumpOne(raw);
            }

            return photosRaw;
        },
        [bump]
    );




    // 🔔 helper: broadcast "me updated" so Header can refresh its avatar (only when editing own profile)
    const notifyMeUpdated = useCallback(
        (uLike) => {
            if (!isMine) return;
            try {
                const nextRaw = (uLike && (uLike.user || uLike)) || {};
                const merged = { ...(profile || {}), ...nextRaw };
                const payload = {
                    ...merged,
                    avatar_url: bump(merged.avatar_url || merged.profile_picture),
                    profile_picture: bump(merged.profile_picture || merged.avatar_url),
                };
                // Same-tab listeners
                window.dispatchEvent(new CustomEvent('me:updated', { detail: { user: payload } }));
                // Cross-tab listeners
                localStorage.setItem('ll:me:updated', JSON.stringify({ t: Date.now(), user: payload }));
            } catch {
                /* ignore */
            }
        },
        [isMine, profile, bump]
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

    const activityPosts = useMemo(() => activity?.posts || [], [activity]);

    // Pull full post list once, then filter + paginate on the client (50-at-a-time render)
    const profileKey = useMemo(() => {
        const raw = profile?.handle || profile?.public_id || profile?.id || null;
        if (raw == null) return null;
        if (typeof raw === 'string') return raw.replace(/^@/, '');
        return raw;
    }, [profile]);
    const profilePageStateKey = profileKey ? `ll:profilePageState:${profileKey}` : null;

    // -------------------------------
    // Preserve profile UI state when navigating away (e.g., into a Post page)
    // -------------------------------


    useEffect(() => {
        if (!profilePageStateKey || profilePageRestoredRef.current) return;

        let raw = null;
        try {
            raw = sessionStorage.getItem(profilePageStateKey);
        } catch {
            raw = null;
        }
        if (!raw) {
            profilePageRestoredRef.current = true;
            return;
        }

        try {
            const s = JSON.parse(raw);

            // Restore expanded overlay first so the scroller exists before setting scrollTop.
            if (typeof s.postsExpanded === 'boolean') setPostsExpanded(s.postsExpanded);
            if (Number.isFinite(s.expandedTab)) setExpandedTab(s.expandedTab);
            if (typeof s.expandedCategory === 'string') setExpandedCategory(s.expandedCategory);
            if (typeof s.expandedSort === 'string') setExpandedSort(s.expandedSort);
            if (Number.isFinite(s.expandedRenderCount)) setExpandedRenderCount(s.expandedRenderCount);

            requestAnimationFrame(() => {
                if (postsScrollRef.current && Number.isFinite(s.expandedScrollTop)) {
                    postsScrollRef.current.scrollTop = s.expandedScrollTop;
                }
                if (Number.isFinite(s.windowScrollY)) {
                    window.scrollTo(0, s.windowScrollY);
                }
            });
        } catch {
            // ignore malformed saved state
        } finally {
            profilePageRestoredRef.current = true;
        }
    }, [profilePageStateKey]);
    const [profilePostsAll, setProfilePostsAll] = useState([]);
    const [profilePostsLoading, setProfilePostsLoading] = useState(false);

    useEffect(() => {
        if (!profileKey) return;
        let alive = true;
        const controller = new AbortController();
        (async () => {
            setProfilePostsLoading(true);
            try {
                const res = await fetch(
                    `${api}/api/community?user=${encodeURIComponent(profileKey)}&limit=5000`,
                    { credentials: 'include', signal: controller.signal }
                );
                const j = await res.json();
                if (!alive) return;
                const arr = Array.isArray(j) ? j : Array.isArray(j?.posts) ? j.posts : [];
                setProfilePostsAll(arr);
            } catch {
                if (alive) setProfilePostsAll(Array.isArray(activityPosts) ? activityPosts : []);
            } finally {
                if (alive) setProfilePostsLoading(false);
            }
        })();
        return () => {
            alive = false;
            controller.abort();
        };
    }, [profileKey, activityPosts]);

    // Keep a local posts list for patching after edits/deletes
    const [feedPosts, setFeedPosts] = useState([]);
    useEffect(() => {
        setFeedPosts(Array.isArray(profilePostsAll) && profilePostsAll.length ? profilePostsAll : Array.isArray(activityPosts) ? activityPosts : []);
    }, [profilePostsAll, activityPosts]);


    // Expanded tabs need full Likes/Reposts data (photos + counts)
    // Fetch once per profile key so expanded view can show Likes/Reposts.
    const [engagementLoading, setEngagementLoading] = useState(false);
    const [engagementLikes, setEngagementLikes] = useState([]);
    const [engagementReposts, setEngagementReposts] = useState([]);
    const [engagementComments, setEngagementComments] = useState([]);

    const normalizeEngagementPost = useCallback((post) => {
        if (!post) return null;

        let photos = [];
        const raw = post.photos;

        if (raw) {
            if (typeof raw === 'string') {
                if (raw.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(raw);
                        photos = Array.isArray(parsed)
                            ? parsed.filter((p) => p && typeof p === 'string' && p !== 'null')
                            : [];
                    } catch {
                        if (raw !== 'null' && raw.trim()) photos = [raw];
                    }
                } else if (raw !== 'null' && raw.trim()) {
                    photos = [raw];
                }
            } else if (Array.isArray(raw)) {
                photos = raw.filter((p) => p && typeof p === 'string' && p !== 'null');
            }
        }

        return {
            ...post,
            photos,
            likesCount: Number(post.likesCount ?? post.likes_count ?? post.like_count ?? post.likes ?? 0),
            commentsCount: Number(post.commentsCount ?? post.comments_count ?? post.comment_count ?? post.comments ?? 0),
            repostsCount: Number(post.repostsCount ?? post.reposts_count ?? post.repost_count ?? post.reposts ?? 0),
            viewerLiked: Boolean(post.viewerLiked ?? post.viewer_liked ?? post.liked ?? post.is_liked ?? false),
            viewerReposted: Boolean(post.viewerReposted ?? post.viewer_reposted ?? post.reposted ?? post.is_reposted ?? false),
        };
    }, []);

    useEffect(() => {
        if (!profileKey) {
            setEngagementLikes([]);
            setEngagementReposts([]);
            setEngagementComments([]);
            return;
        }

        let alive = true;
        const controller = new AbortController();

        const tryFetch = async (url) => {
            const res = await fetch(url, { credentials: 'include', signal: controller.signal });
            if (!res.ok) throw new Error('bad_status');
            return res.json();
        };

        (async () => {
            setEngagementLoading(true);
            try {
                const key = encodeURIComponent(profileKey);
                const urls = [
                    `${api}/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                    `${api}/api/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                    `/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                    `/api/users/${key}/engagement/posts?types=likes,reposts,comments&limit=500`,
                ];

                let j = null;
                for (const u of urls) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        j = await tryFetch(u);
                        break;
                    } catch {
                        // try next
                    }
                }

                if (!alive) return;

                const mapPosts = (arr) => (Array.isArray(arr) ? arr.map(normalizeEngagementPost).filter(Boolean) : []);
                const mapComments = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : []);

                setEngagementLikes(mapPosts(j?.likes));
                setEngagementReposts(mapPosts(j?.reposts));
                setEngagementComments(mapComments(j?.comments));
            } catch {
                if (!alive) return;
                setEngagementLikes([]);
                setEngagementReposts([]);
                setEngagementComments([]);
            } finally {
                if (alive) setEngagementLoading(false);
            }
        })();

        return () => {
            alive = false;
            controller.abort();
        };
    }, [api, profileKey, normalizeEngagementPost]);
// Keep Likes/Reposts lists in sync when the user toggles actions from any post card
    useEffect(() => {
        const findInAny = (idNum) => {
            const findPost = (arr) => (Array.isArray(arr) ? arr.find((p) => Number(p?.id) === idNum) : null);
            return findPost(feedPosts) || findPost(engagementLikes) || findPost(engagementReposts) || null;
        };

        const onLikeEvt = (e) => {
            const d = e?.detail || {};
            const idNum = Number(d.postId);
            if (!Number.isFinite(idNum)) return;

            const liked = Boolean(d.liked);
            const likesCount = Number(d.likes);

            const base = findInAny(idNum);

            const patch = (p) => {
                if (!p || Number(p?.id) !== idNum) return p;
                return {
                    ...p,
                    viewerLiked: liked,
                    viewer_liked: liked,
                    liked,
                    is_liked: liked,
                    likesCount: Number.isFinite(likesCount) ? likesCount : Number(p?.likesCount ?? p?.likes_count ?? p?.likes ?? 0),
                    likes_count: Number.isFinite(likesCount) ? likesCount : p?.likes_count,
                };
            };

            setEngagementLikes((prev) => {
                const arr = Array.isArray(prev) ? prev.map(patch) : [];
                const exists = arr.some((p) => Number(p?.id) === idNum);

                if (liked && !exists) {
                    const toAdd = base ? patch(base) : { id: idNum, viewerLiked: true, likesCount: Number.isFinite(likesCount) ? likesCount : 0 };
                    return [toAdd, ...arr];
                }
                if (!liked && exists) {
                    return arr.filter((p) => Number(p?.id) !== idNum);
                }
                return arr;
            });

            // Also keep the main posts feed cards accurate
            setFeedPosts((prev) => (Array.isArray(prev) ? prev.map(patch) : prev));
        };

        const onRepostEvt = (e) => {
            const d = e?.detail || {};
            const idNum = Number(d.postId);
            if (!Number.isFinite(idNum)) return;

            const reposted = Boolean(d.reposted);
            const repostsCount = Number(d.reposts);

            const base = findInAny(idNum);

            const patch = (p) => {
                if (!p || Number(p?.id) !== idNum) return p;
                return {
                    ...p,
                    viewerReposted: reposted,
                    viewer_reposted: reposted,
                    reposted,
                    is_reposted: reposted,
                    repostsCount: Number.isFinite(repostsCount) ? repostsCount : Number(p?.repostsCount ?? p?.reposts_count ?? p?.reposts ?? 0),
                    reposts_count: Number.isFinite(repostsCount) ? repostsCount : p?.reposts_count,
                };
            };

            setEngagementReposts((prev) => {
                const arr = Array.isArray(prev) ? prev.map(patch) : [];
                const exists = arr.some((p) => Number(p?.id) === idNum);

                if (reposted && !exists) {
                    const toAdd = base ? patch(base) : { id: idNum, viewerReposted: true, repostsCount: Number.isFinite(repostsCount) ? repostsCount : 0 };
                    return [toAdd, ...arr];
                }
                if (!reposted && exists) {
                    return arr.filter((p) => Number(p?.id) !== idNum);
                }
                return arr;
            });

            setFeedPosts((prev) => (Array.isArray(prev) ? prev.map(patch) : prev));
        };

        window.addEventListener('ll:post:like-changed', onLikeEvt);
        window.addEventListener('ll:post:repost-changed', onRepostEvt);
        return () => {
            window.removeEventListener('ll:post:like-changed', onLikeEvt);
            window.removeEventListener('ll:post:repost-changed', onRepostEvt);
        };
    }, [feedPosts, engagementLikes, engagementReposts]);
    // Apply an updated post (after edit / mark-found) across the profile UI
    const applyUpdatedCommunityPost = useCallback((updated) => {
        if (!updated || !updated.id) return;
        const idNum = Number(updated.id);
        if (!Number.isFinite(idNum)) return;

        const patched = { ...updated, photos: bumpPhotos(updated.photos) };

        try {
            window.dispatchEvent(new CustomEvent('ll:communityPost:updated', { detail: { post: patched } }));
        } catch {
            /* ignore */
        }

        const patchList = (prev) =>
            Array.isArray(prev)
                ? prev.map((p) => (Number(p?.id) === idNum ? { ...p, ...patched } : p))
                : prev;

        setFeedPosts((prev) => patchList(prev));
        setProfilePostsAll((prev) => patchList(prev));
        setEngagementLikes((prev) => patchList(prev));
        setEngagementReposts((prev) => patchList(prev));
        setActivity((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            if (Array.isArray(prev.posts)) next.posts = patchList(prev.posts);
            if (Array.isArray(prev.reposts)) next.reposts = patchList(prev.reposts);
            if (Array.isArray(prev.likes)) next.likes = patchList(prev.likes);
            return next;
        });

        setPostsRefreshNonce((n) => n + 1);
    }, [bumpPhotos]);

    const applyDeletedCommunityPost = useCallback((postId) => {
        const idNum = Number(postId);
        if (!Number.isFinite(idNum) || !idNum) return;

        try {
            window.dispatchEvent(new CustomEvent('ll:communityPost:deleted', { detail: { postId: idNum } }));
        } catch {
            /* ignore */
        }

        const removeFromList = (prev) =>
            Array.isArray(prev) ? prev.filter((p) => Number(p?.id) !== idNum) : prev;

        setFeedPosts((prev) => removeFromList(prev));
        setProfilePostsAll((prev) => removeFromList(prev));
        setEngagementLikes((prev) => removeFromList(prev));
        setEngagementReposts((prev) => removeFromList(prev));
        setActivity((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            if (Array.isArray(prev.posts)) next.posts = removeFromList(prev.posts);
            if (Array.isArray(prev.reposts)) next.reposts = removeFromList(prev.reposts);
            if (Array.isArray(prev.likes)) next.likes = removeFromList(prev.likes);
            return next;
        });

        setPostsRefreshNonce((n) => n + 1);
    }, []);


    // After editing a post (especially photos), refresh the post so the profile list shows the new images immediately.
    // This also cache-busts image URLs via applyUpdatedCommunityPost → bumpPhotos.
    const refreshPostAfterEdit = useCallback(
        async (postId) => {
            const pid = Number(postId);
            if (!Number.isFinite(pid) || pid <= 0) return;

            // Try to fetch the updated post directly (includes updated photos)
            const urls = [
                `${api}/api/community/${pid}`,
                `/api/community/${pid}`,
            ];

            let postObj = null;

            for (const u of urls) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const res = await axios.get(u, { withCredentials: true });
                    const data = res?.data;

                    const candidate =
                        (data && typeof data === 'object' && (data.post || data.row || data.data)) ||
                        data;

                    if (candidate && typeof candidate === 'object' && Number(candidate.id) === pid) {
                        postObj = candidate;
                        break;
                    }
                } catch {
                    // try next
                }
            }

            if (postObj) {
                applyUpdatedCommunityPost(postObj);
                return;
            }

            // Fallback: re-fetch the user's posts feed for this profile.
            if (!profileKey) return;

            try {
                const res = await fetch(
                    `${api}/api/community?user=${encodeURIComponent(profileKey)}&limit=5000`,
                    { credentials: 'include' }
                );
                const j = await res.json();
                const arr = Array.isArray(j) ? j : Array.isArray(j?.posts) ? j.posts : [];
                setProfilePostsAll(arr);
            } catch {
                // ignore
            }
        },
        [api, applyUpdatedCommunityPost, profileKey]
    );

    const closeEditDialog = useCallback(() => {
        const pid = editPostId;
        setEditOpen(false);
        setEditPostId(null);
        if (pid) refreshPostAfterEdit(pid);
    }, [editPostId, refreshPostAfterEdit]);

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
            const msg = err?.response?.data?.message || err?.message || 'Could not mark this item as found.';
            setMarkFoundError(msg);
        } finally {
            setMarkFoundSaving(false);
        }
    }, [markFoundPostId, markFoundMessage, applyUpdatedCommunityPost, closeMarkFoundDialog]);

    // Avoid object-URL churn and memory leaks for staged images
    const avatarObjectUrl = useMemo(() => (pendingAvatar ? URL.createObjectURL(pendingAvatar) : null), [pendingAvatar]);
    useEffect(() => {
        return () => {
            if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
        };
    }, [avatarObjectUrl]);
    const avatarSrc = avatarObjectUrl || profile?.avatar_url || profile?.profile_picture || undefined;
// About edits bubble up from <AboutSection /> so Save Profile persists them
    const onAboutEdit = useCallback((partial) => {
        if (!partial || typeof partial !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(partial, 'bio')) setBioDraft(String(partial.bio ?? '').slice(0, 50));
        if (Object.prototype.hasOwnProperty.call(partial, 'relationship')) setRelationship(partial.relationship ?? '');
        if (Object.prototype.hasOwnProperty.call(partial, 'birthday')) setBirthday(partial.birthday ?? '');
        if (Object.prototype.hasOwnProperty.call(partial, 'home_city')) setHomeCity(partial.home_city ?? '');
        if (Object.prototype.hasOwnProperty.call(partial, 'home_county')) setHomeCounty(partial.home_county ?? '');
    }, []);

    // --- helpers to save/restore scroll for profile page ---
    const saveProfileScrollState = useCallback(() => {
        const key = profile?.handle || profile?.public_id || profile?.id;
        if (!key) return;
        try {
            const winY = window.scrollY || document.documentElement.scrollTop || 0;
            sessionStorage.setItem(`ll:profile:${key}:winY`, String(winY));
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

            sessionStorage.setItem(`ll:profile:${key}:restore`, '0');

            const y = Number(sessionStorage.getItem(`ll:profile:${key}:winY`) || '0');
            requestAnimationFrame(() => {
                window.scrollTo({ top: y, left: 0, behavior: 'auto' });
            });
        } catch {
            /* ignore */
        }
    }, [profile]);

    // Contact updates (kept simple to avoid hook-lint issues)
    const onChangeContact = (next) => {
        setContact(next);
    };

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
                } catch {
                    // try next
                }
            }
            if (!ok) throw new Error('follow api failed');

            setIsFollowing(!isFollowing);
            setFollowsRefreshNonce((n) => n + 1);
            try {
                followsRef.current?.refresh?.();
            } catch {
                /* ignore */
            }
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
            const withBusted = {
                ...p,
                avatar_url: bump(p.avatar_url || p.profile_picture),
                profile_picture: bump(p.profile_picture || p.avatar_url),
            };
            setProfile(withBusted);
            setActivity(res.data.activity || {});
            notifyMeUpdated(withBusted);
        } catch {
            window.location.reload();
        }
    };

    /**
     * SAVE PROFILE
     * - Save textual fields (/users/me)
     * - Save first_name/last_name (+ handle if changed) via /users/profile (form-data)
     * - Refresh view; if handle changed, redirect to the new URL and hard-reload
     */
    const saveProfile = async () => {
        try {
            setHandleError('');
            const currentHandle = profile?.handle || '';
            const nextHandle = (handleDraft || '').replace(/^@+/, '');
            const handleChanged = isMine && nextHandle !== currentHandle;

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

            const canonicalizeSocialForSave = (v, which) => {
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
                        : profile.social_json)) || {};

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
                bio: String(bioDraft || '').slice(0, 50),
                relationship: relationship || null,
                birthday: birthday || null,
                home_city: homeCity || null,
                home_county: homeCounty || null,
                is_private: accountPrivacyDraft === 'private' ? 1 : 0,
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
                const msg = err.response?.data?.message || 'Unable to update username at the moment.';
                setHandleError(msg);
                return;
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

            // reflect latest fields from /users/me response
            const updated = fieldsRes.data || {};
            setProfile((p) => ({ ...p, ...updated }));
            notifyMeUpdated(updated);

            setPendingAvatar(null);
            setDeleteAvatar(false);
            setEditMode(false);
            setFlash({ type: 'success', text: 'Profile updated.' });

            // Refresh view:
            if (handleChanged) {
                const to = `/${nextHandle}`;
                navigate(to, { replace: true });
                window.location.replace(to);
            } else {
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
    // Expanded grid: block any *location-like* anchor clicks/keyboard activation (failsafe)
    // Expanded/profile posts: block location-like interactions (location should not be a link on profile pages)
    const blockLocationClicks = (e) => {
        const t = e?.target;
        if (!t || typeof t.closest !== 'function') return;

        // Keyboard: only intercept Enter / Space activations
        if (e?.type === 'keydown') {
            const k = String(e?.key || '');
            if (k !== 'Enter' && k !== ' ') return;
        }

        const interactive = t.closest('a, button, [role="button"]');
        if (!interactive) return;

        const isAnchor = interactive.tagName === 'A';
        const hrefRaw = isAnchor ? String(interactive.getAttribute('href') || '') : '';
        const href = hrefRaw.toLowerCase();
        const label = String(interactive.textContent || '').trim();
        const labelLower = label.toLowerCase();

        const hasLocationLikeClass = (() => {
            const el = t.closest('[data-location], [data-post-location], [data-post-location-link], [class*="location"], [class*="Location"]');
            return !!el;
        })();

        const looksLikeMapHref = isAnchor && (href.includes('maps') || href.includes('google.com/maps') || href.includes('/map'));
        const looksLikeFilteredHref = isAnchor && (/\/(community|posts)\?/.test(href) && /(location|city|county|region)=/.test(href));
        const looksLikeLocationText =
            /\b(county|city|parish|borough|township|village|province|state|region|place|location)\b/.test(labelLower) ||
            /,\s*[a-z]{2}\b/i.test(label) ||
            /\bcounty\b/i.test(label);

        const looksLikeLocation = hasLocationLikeClass || looksLikeMapHref || looksLikeFilteredHref || looksLikeLocationText;
        if (!looksLikeLocation) return;

        e.preventDefault();
        e.stopPropagation();
    };

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
                const winY = window.scrollY || document.documentElement.scrollTop || 0;
                sessionStorage.setItem(`ll:profile:${key}:winY`, String(winY));
            } catch {
                /* ignore */
            }

            const backHandle = (profile?.handle || '').replace(/^@/, '');
            const backUrl = `/${backHandle || profile?.public_id || profile?.id}?view=posts`;
            navigate(`/posts/${post.id}`, {
                state: {
                    post,
                    fromProfile: true,
                    backProfileId: profile?.id,
                    backProfileHandle: typeof key === 'string' ? key.replace(/^@/, '') : key,
                    backProfileName: name,
                    backToProfileUrl: backUrl,
                },
            });
        },
        [navigate, profile]
    );



    const openCommentFromExpanded = useCallback(
        (commentItem) => {
            const c = commentItem || {};
            const post0 = c.post || {};
            if (!post0 || !post0.id) return;

            const key0 = profile?.handle || profile?.public_id || profile?.id;
            const name0 = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Profile';
            const scTop = postsScrollRef.current?.scrollTop || 0;

            try {
                sessionStorage.setItem(`ll:profile:${key0}:posts:expanded`, '1');
                sessionStorage.setItem(`ll:profile:${key0}:posts:scroll`, String(scTop));
                const winY = window.scrollY || document.documentElement.scrollTop || 0;
                sessionStorage.setItem(`ll:profile:${key0}:winY`, String(winY));
            } catch {
                /* ignore */
            }

            const backHandle = (profile?.handle || '').replace(/^@/, '');
            const backUrl = `/${backHandle || profile?.public_id || profile?.id}?view=posts`;
            navigate(`/posts/${post0.id}`, {
                state: {
                    post: post0,
                    fromProfile: true,
                    backProfileId: profile?.id,
                    backProfileHandle: typeof key0 === 'string' ? key0.replace(/^@/, '') : key0,
                    backProfileName: name0,
                    backToProfileUrl: backUrl,
                    scrollToCommentId: Number(c?.comment_id || c?.id || 0) || undefined,
                },
            });
        },
        [navigate, profile]
    );
    // Expanded posts filters
    const [expandedCategory, setExpandedCategory] = useState('');
    const [expandedSort, setExpandedSort] = useState('newest');

    const expandedActiveBase = useMemo(() => {
        if (expandedTab === 2) return Array.isArray(engagementLikes) ? engagementLikes : [];
        if (expandedTab === 3) return Array.isArray(engagementReposts) ? engagementReposts : [];
        if (expandedTab === 1) return Array.isArray(engagementComments) ? engagementComments : [];
        return Array.isArray(feedPosts) ? feedPosts : [];
    }, [expandedTab, feedPosts, engagementLikes, engagementReposts, engagementComments]);


    const expandedActiveFiltered = useMemo(() => {
        let list = expandedActiveBase;

        if (expandedTab === 1) {
            // Comments activity: group by post
            let out = Array.isArray(list) ? list.slice() : [];

            if (expandedCategory) {
                out = out.filter((c) => matchesCategoryFilter(c?.post?.category || c?.post?.subtype, expandedCategory));
            }

            // Always sort comments newest-first before grouping (so each group has newest first)
            out.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

            const map = new Map();
            const groups = [];

            for (const c of out) {
                const post = c?.post && typeof c.post === 'object' ? c.post : null;
                const pid = Number(post?.id ?? c?.post_id ?? 0);
                if (!Number.isFinite(pid) || pid <= 0) continue;

                if (!map.has(pid)) {
                    const g = { post: post || {}, post_id: pid, comments: [] };
                    map.set(pid, g);
                    groups.push(g);
                }

                map.get(pid).comments.push(c);
            }

            if (expandedSort === 'popular') {
                groups.sort((a, b) => {
                    const aLikes = Number(a?.post?.likesCount ?? a?.post?.likes_count ?? a?.post?.likes ?? 0);
                    const bLikes = Number(b?.post?.likesCount ?? b?.post?.likes_count ?? b?.post?.likes ?? 0);
                    return bLikes - aLikes;
                });
            }

            return groups;
        }

        // Posts / Likes / Reposts
        let out = list;

        if (expandedCategory) {
            out = out.filter((p) => matchesCategoryFilter(p?.category || p?.subtype, expandedCategory));
        }

        return sortPosts(out, expandedSort);
    }, [expandedActiveBase, expandedCategory, expandedSort, expandedTab]);


    // Expanded grid chunking (50 at a time)
    const [expandedRenderCount, setExpandedRenderCount] = useState(50);


    const profilePageRestoredRef = useRef(false);

    const saveProfilePageState = useCallback(() => {
        if (!profilePageStateKey) return;

        const expandedScrollTop = postsScrollRef.current ? postsScrollRef.current.scrollTop : 0;

        const snapshot = {
            // page scroll (for the non-expanded profile view)
            windowScrollY: typeof window !== 'undefined' ? window.scrollY : 0,

            // expanded overlay state
            postsExpanded: !!postsExpanded,
            expandedTab: Number.isFinite(expandedTab) ? expandedTab : 0,
            expandedCategory: expandedCategory || '',
            expandedSort: expandedSort || 'newest',
            expandedRenderCount: Number.isFinite(expandedRenderCount) ? expandedRenderCount : 0,
            expandedScrollTop: Number.isFinite(expandedScrollTop) ? expandedScrollTop : 0,

            // keep query string state (so /:handle?view=posts stays / not)
            path: location?.pathname || '',
            search: location?.search || '',
        };

        try {
            sessionStorage.setItem(profilePageStateKey, JSON.stringify(snapshot));
        } catch {
            // ignore storage errors
        }
    }, [
        profilePageStateKey,
        postsExpanded,
        expandedTab,
        expandedCategory,
        expandedSort,
        expandedRenderCount,
        location?.pathname,
        location?.search,
    ]);


    useEffect(() => {
        return () => {
            saveProfilePageState();
        };
    }, [saveProfilePageState]);

    useEffect(() => {
        setExpandedRenderCount(50);
        requestAnimationFrame(() => {
            if (postsScrollRef.current) postsScrollRef.current.scrollTop = 0;
        });
    }, [expandedCategory, expandedSort, expandedTab]);

    const expandedVisibleCount = Math.min(expandedRenderCount, expandedActiveFiltered.length);
    const expandedSentinelIndex = Math.max(0, expandedVisibleCount - 10);
    const expandedLoadMoreRef = useRef(null);

    useEffect(() => {
        const el = expandedLoadMoreRef.current;
        const rootEl = postsScrollRef.current;
        if (!el || !rootEl) return;

        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                setExpandedRenderCount((c) => Math.min(c + 50, expandedActiveFiltered.length));
            },
            { root: rootEl, rootMargin: '600px' }
        );

        io.observe(el);
        return () => io.disconnect();
    }, [expandedActiveFiltered.length, expandedVisibleCount]);


    const expandedCountText = useMemo(() => {
        const total = expandedActiveFiltered.length;
        const showing = Math.min(expandedVisibleCount, total);
        const word = total === 1 ? 'post' : 'posts';
        return `Displaying ${showing} of ${total} ${word}`;
    }, [expandedActiveFiltered.length, expandedVisibleCount]);


    // Ensure the profile initially stays at the top.
    // (We already scroll to top on route change above, but this prevents any child component from pulling the page down
    // during the first paint / data hydrate.)
    useLayoutEffect(() => {
        if (!handleOrId) return;
        if (postsExpanded) return;
        if (loading) return;

        let shouldRestore = false;
        try {
            shouldRestore = sessionStorage.getItem(`ll:profile:${handleOrId}:restore`) === '1';
            if (!shouldRestore && typeof handleOrId === 'string') {
                const norm = handleOrId.replace(/^@/, '');
                shouldRestore = sessionStorage.getItem(`ll:profile:${norm}:restore`) === '1';
            }
            if (!shouldRestore) {
                shouldRestore = !!location?.state?.restoreProfile;
            }
        } catch {
            /* ignore */
        }
        if (shouldRestore) return;

        // Only force once per profile load
        const k = `ll:profile:${handleOrId}:forcedTop`;
        try {
            if (sessionStorage.getItem(k) === '1') return;
            sessionStorage.setItem(k, '1');
        } catch {
            /* ignore */
        }
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [handleOrId, loading, postsExpanded]);

    // Gate initial render behind profile load (and no hard error)
    const pageLoading = !error && loading;
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

    // Posts privacy
    const canViewPosts = canViewSection(privacy?.posts || 'public');

    return (
        <Box
            ref={pageRef}
            sx={{
                pb: { xs: 4, md: 0 },
                background: (t) => t.palette.background.default,
                minHeight: { xs: '100vh', md: 0 },
                display: { xs: 'block', md: 'flex' },
                flexDirection: { md: 'column' },
            }}
        >
            {/* Flash slot (reserved space so banners never shrink the layout on desktop) */}
            <Box
                sx={{
                    width: '100%',
                    display: postsExpanded && !flash ? 'none' : 'block',
                    position: { xs: 'static', md: 'sticky' },
                    top: { md: 0 },
                    zIndex: 1200,
                    height: { xs: 'auto', md: 64 },
                    minHeight: { xs: 0, md: 64 },
                    flexShrink: 0,
                    pointerEvents: 'none',
                }}
            >
                {flash ? (
                    <Box
                        sx={{
                            position: { xs: 'static', md: 'absolute' },
                            inset: { md: 0 },
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pt: { xs: 1, md: 0 },
                            pb: { xs: 1, md: 0 },
                            background: {
                                md: 'linear-gradient(180deg, rgba(247,251,255,0.92) 0%, rgba(247,251,255,0.72) 100%)',
                            },
                            backdropFilter: { md: 'blur(6px)' },
                            pointerEvents: 'auto',
                        }}
                    >
                        <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, width: '100%' }}>
                            <Alert
                                variant="filled"
                                severity={flash.type}
                                onClose={() => setFlash(null)}
                                sx={(t) => {
                                    const type = String(flash?.type || '').toLowerCase();
                                    const primary = t.palette.primary.main; // dark green
                                    const gold = t.palette.secondary.main; // gold
                                    const bg =
                                        type === 'success'
                                            ? primary
                                            : type === 'info'
                                                ? `linear-gradient(90deg, ${gold} 0%, rgba(201, 162, 77, 0.82) 55%, rgba(201, 162, 77, 0.70) 100%)`
                                                : type === 'error'
                                                    ? t.palette.error.main
                                                    : primary;

                                    const isInfo = type === 'info';

                                    return {
                                        borderRadius: 2,
                                        boxShadow: '0 10px 26px rgba(2,6,23,0.12)',
                                        alignItems: 'center',
                                        background: bg,
                                        color: '#fff',
                                        '& .MuiAlert-message': {
                                            fontWeight: 900,
                                            color: '#fff',
                                        },
                                        '& .MuiAlert-icon': {
                                            color: '#fff',
                                        },
                                        '& .MuiAlert-action': {
                                            color: '#fff',
                                        },
                                        '& .MuiIconButton-root': {
                                            color: '#fff',
                                        },
                                    };
                                }}
                            >
                                {flash.text}
                            </Alert>
                        </Box>
                    </Box>
                ) : null}
            </Box>

            {error && (
                <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, mt: 1 }}>
                    <Alert severity="error" onClose={() => setError('')}>
                        {error}
                    </Alert>
                </Box>
            )}

            {/* MAIN PROFILE — hidden when the expanded page is active */}
            <Box
                sx={{
                    display: postsExpanded ? 'none' : 'block',
                    flex: { md: 1 },
                    minHeight: { md: 0 },
                    overflow: { md: 'visible' },
                }}
            >
                <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                    <ProfileHeader
                        viewerId={me?.id || 0}
                        layout="full"
                        profile={profile}
                        avatarSrc={avatarSrc}
                        isMine={isMine}
                        editMode={editMode}
                        onEnterEdit={() => setEditMode(true)}
                        onSave={saveProfile}
                        onCancel={() => {
                            if (isEditDirty) setDiscardOpen(true);
                            else {
                                setPendingAvatar(null);
                                setDeleteAvatar(false);
                                setEditMode(false);
                                setDiscardOpen(false);
                            }
                        }}
                        onChangeAvatar={changeAvatar}
                        onDeleteAvatar={() => {
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
                        bioDraft={bioDraft}
                        onBioDraftChange={(v) => setBioDraft(String(v || '').slice(0, 50))}
                        homeCityDraft={homeCity}
                        onHomeCityDraftChange={setHomeCity}
                        homeCountyDraft={homeCounty}
                        onHomeCountyDraftChange={setHomeCounty}
                        privacyDraft={accountPrivacyDraft}
                        onPrivacyDraftChange={setAccountPrivacyDraft}
                    />
                </Box>


                {/* Two-column grid (collapses to one column if right rail is hidden) */}
                <Box
                    ref={gridRef}
                    sx={{
                        maxWidth: 1400,
                        mx: 'auto',
                        px: 2,
                        mt: { xs: 2, md: 0 },
                        flex: { md: 1 },
                        minHeight: { md: 0 },
                        display: { xs: 'flex', md: 'grid' },
                        flexDirection: { xs: 'column', md: 'initial' },
                        columnGap: 3,
                        rowGap: 1.5,
                        gridTemplateColumns: {
                            xs: '1fr',
                            md: canViewPosts ? 'minmax(0,500px) minmax(0,1fr)' : '1fr',
                        },
                        alignItems: 'start',
                    }}
                >
                    {/* LEFT rail */}
                    <Box ref={leftColRef} sx={{ minWidth: 0, order: { xs: 2, md: 1 } }}>
                        <Box
                            sx={{
                                position: { xs: 'static', md: 'sticky' },
                                top: { md: 0 },
                                alignSelf: 'start',
                                minHeight: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 1,
                            }}
                        >
                            {/* Desktop: avatar pinned in left rail */}
                            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                                <ProfileHeader
                                    layout="sidebar"
                                    profile={profile}
                                    avatarSrc={avatarSrc}
                                    isMine={isMine}
                                    editMode={editMode}
                                    onEnterEdit={() => setEditMode(true)}
                                    onSave={saveProfile}
                                    onCancel={() => {
                                        if (isEditDirty) setDiscardOpen(true);
                                        else {
                                            setPendingAvatar(null);
                                            setDeleteAvatar(false);
                                            setEditMode(false);
                                            setDiscardOpen(false);
                                        }
                                    }}
                                    onChangeAvatar={changeAvatar}
                                    onDeleteAvatar={() => {
                                        setConfirmOpen(true);
                                    }}
                                    viewer={me}
                                    isFollowing={isFollowing}
                                    onToggleFollow={toggleFollow}
                                    handleDraft={handleDraft}
                                    onHandleDraftChange={setHandleDraft}
                                    handleStats={handleStats}
                                    firstNameDraft={firstNameDraft}
                                    lastNameDraft={lastNameDraft}
                                    onFirstNameDraftChange={setFirstNameDraft}
                                    onLastNameDraftChange={setLastNameDraft}
                                    bioDraft={bioDraft}
                                    onBioDraftChange={(v) => setBioDraft(String(v || '').slice(0, 50))}
                                    homeCityDraft={homeCity}
                                    onHomeCityDraftChange={setHomeCity}
                                    homeCountyDraft={homeCounty}
                                    onHomeCountyDraftChange={setHomeCounty}
                                    privacyDraft={accountPrivacyDraft}
                                    onPrivacyDraftChange={setAccountPrivacyDraft}
                                    handleError={handleError}
                                    stagedDeleteAvatar={deleteAvatar}
                                />
                            </Box>

                            {/* About info scroll box (desktop) */}
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 1.5,
                                    flex: { md: 1 },
                                    minHeight: 0,
                                    pr: { xs: 0, md: 0.5 },
                                    pb: { xs: 0, md: 1 },
                                    overflow: 'hidden',
                                }}
                                data-profile-about-scroller
                            >

                                {/* About */}
                                {ENABLE_EDIT_DETAIL_SECTIONS && editMode && canViewAbout && (
                                    <SectionCard
                                        title="About"
                                        privacyKey="about"
                                        currentPrivacy={privacy?.about || 'public'}
                                    >
                                        <AboutSection
                                            editMode={editMode}
                                            isOwner={isMine}
                                            profile={profile}
                                            privacyValue={privacy?.about || 'public'}
                                            isFollower={isFollowing}
                                            onEdit={onAboutEdit}
                                        />
                                    </SectionCard>
                                )}

                                {/* Contact */}
                                {ENABLE_EDIT_DETAIL_SECTIONS && editMode && canViewContact && (
                                    <SectionCard
                                        title="Contact"
                                        privacyKey="contact"
                                        currentPrivacy={privacy?.contact || 'public'}
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
                                {ENABLE_EDIT_DETAIL_SECTIONS && editMode && canViewWork && (
                                    <SectionCard
                                        title="Work History"
                                        privacyKey="work_history"
                                        currentPrivacy={privacy?.work_history || 'public'}
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
                                {ENABLE_EDIT_DETAIL_SECTIONS && editMode && canViewEducation && (
                                    <SectionCard
                                        title="Education"
                                        privacyKey="education_history"
                                        currentPrivacy={privacy?.education_history || 'public'}
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
                                {!editMode && canViewFollows && (
                                    <SectionCard
                                        title="Followers & Following"
                                        fixedBodyHeight
                                        cardSx={{ boxShadow: 'none', overflow: 'hidden' }}
                                        maxBodyHeight={220}
                                        action={
                                            <Button size="small" onClick={() => followsRef.current?.openAll()}>
                                                VIEW ALL
                                            </Button>
                                        }
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
                                            refreshNonce={followsRefreshNonce}
                                            showFollowingTabInSection={true}
                                            fillHeight={false}
                                        />
                                    </SectionCard>
                                )}

                                {/* Photos */}
                                {ENABLE_EDIT_DETAIL_SECTIONS && editMode && canViewPhotos && (
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
                        </Box>
                    </Box>

                    {/* RIGHT rail */}
                    {canViewPosts ? (
                        <Box
                            ref={rightColRef}
                            sx={{
                                minWidth: 0,
                                order: { xs: 1, md: 2 },
                                position: { xs: 'static', md: isDesktopLayout ? 'sticky' : 'static' },
                                top: { md: 0 },
                                alignSelf: 'start',

                            }}
                        >
                            <ProfileEngagementTabs
                                key={`${profileKey || 'profile'}:${postsRefreshNonce}`}
                                me={me}
                                isScrollBox={isDesktopLayout}
                                scrollBoxHeight={rightScrollBoxHeight || 680}
                                disableInitialAutoScroll={true}
                                pageScrollOffset={0}
                                profile={profile}
                                posts={feedPosts}
                                isMine={isMine}
                                isFollowing={isFollowing}
                                privacy={{
                                    posts: privacy?.posts || 'public',
                                    likes: privacy?.likes || 'public',
                                    reposts: privacy?.reposts || 'public',
                                    comments: privacy?.comments || 'public',
                                }}
                                canViewSection={canViewSection}
                                onOpenPost={(post) => {
                                    if (!post || !post.id) return;
                                    saveProfileScrollState();
                                    const key = profile?.handle || profile?.public_id || profile?.id;
                                    try {
                                        sessionStorage.setItem(`ll:profile:${key}:restore`, '1');
                                    } catch {
                                        /* ignore */
                                    }
                                    const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Profile';
                                    saveProfilePageState();
                                    navigate(`/posts/${post.id}`, {
                                        state: {
                                            post,
                                            fromProfile: true,
                                            backProfileId: profile?.id,
                                            backProfileHandle: typeof key === 'string' ? key.replace(/^@/, '') : key,
                                            backProfileName: name,
                                            backToProfileUrl: `/${key}`,
                                        },
                                    });
                                }}
                                onOpenComment={(commentItem) => {
                                    const c = commentItem || {};
                                    const post0 = c.post || {};
                                    if (!post0?.id) return;

                                    saveProfileScrollState();
                                    const key0 = profile?.handle || profile?.public_id || profile?.id;

                                    try {
                                        sessionStorage.setItem(`ll:profile:${key0}:restore`, '1');
                                        if (typeof key0 === 'string') {
                                            const norm = key0.replace(/^@/, '');
                                            sessionStorage.setItem(`ll:profile:${norm}:restore`, '1');
                                        }
                                        sessionStorage.setItem(`ll:profile:${key0}:rightRail:tab`, '1');
                                    } catch {
                                        /* ignore */
                                    }

                                    const name0 = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Profile';
                                    saveProfilePageState();
                                    navigate(`/posts/${post0.id}`, {
                                        state: {
                                            post: post0,
                                            fromProfile: true,
                                            backProfileId: profile?.id,
                                            backProfileHandle: typeof key0 === 'string' ? key0.replace(/^@/, '') : key0,
                                            backProfileName: name0,
                                            backToProfileUrl: `/${key0}`,
                                            scrollToCommentId: Number(c?.comment_id || c?.id || 0) || undefined,
                                        },
                                    });
                                }}
                                onExpandPosts={(tabIndex) => {
                                    const url = new URL(window.location.href);
                                    url.searchParams.set('view', 'posts');
                                    window.history.pushState({ view: 'posts' }, '', url);
                                    const idx = Number.isFinite(Number(tabIndex)) ? Number(tabIndex) : 0;
                                    setExpandedTab(idx);
                                    setPostsExpanded(true);

                                    // required: scroll to top on expand
                                    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                                    requestAnimationFrame(() => {
                                        if (postsScrollRef.current) postsScrollRef.current.scrollTop = 0;
                                    });
                                }}
                            />

                        </Box>
                    ) : null}
                </Box>
            </Box>

            {postsExpanded && canViewPosts && (
                <Box sx={{ width: '100%', maxWidth: 'none', mx: 'auto', px: { xs: 1.25, sm: 2, md: 4 }, pt: { xs: 1.5, sm: 2, md: 2.5 }, pb: 3 }}>
                    {(() => {
                        const canViewCommentsExpanded = canViewSection(privacy?.comments || 'public');
                        const canViewLikesExpanded = canViewSection(privacy?.likes || 'public');
                        const canViewRepostsExpanded = canViewSection(privacy?.reposts || 'public');

                        const cannotViewText = (val) => {
                            const v = val || 'public';
                            if (v === 'private') return 'This section is visible to this user only.';
                            return 'This section is visible to followers.';
                        };

                        const tabCanView = expandedTab === 0 ? true : expandedTab === 1 ? canViewCommentsExpanded : expandedTab === 2 ? canViewLikesExpanded : canViewRepostsExpanded;

                        const emptyIcon =
                            expandedTab === 0 ? postsIcon : expandedTab === 1 ? commentIconLit : expandedTab === 2 ? likeIconLit : repostIconLit;
                        const emptyTitle =
                            expandedTab === 0
                                ? 'No current activity'
                                : expandedTab === 1
                                    ? 'No comments'
                                    : expandedTab === 2
                                        ? 'No liked posts'
                                        : 'No reposts';
                        const emptySubtitle =
                            expandedTab === 0
                                ? 'This user doesn’t have any posts yet.'
                                : expandedTab === 1
                                    ? 'This user hasn’t commented on any posts yet.'
                                    : expandedTab === 2
                                        ? 'This user hasn’t liked any posts yet.'
                                        : 'This user hasn’t reposted anything yet.';


                        return (
                            <Card
                                variant="outlined"
                                sx={{
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                    borderColor: (t) => alpha(t.palette.primary.main, 0.14),
                                    boxShadow: '0 14px 44px rgba(15, 23, 42, 0.10)',
                                    bgcolor: '#FFFFFF',
                                    width: '100%',
                                    maxWidth: { xs: '100%', md: 1120, lg: 1260 },
                                    mx: 'auto',

                                    height: {
                                        xs: 'calc(100vh - 152px)',
                                        sm: 'calc(100vh - 176px)',
                                        md: 'calc(100vh - 210px)',
                                    },
                                    maxHeight: {
                                        xs: 'calc(100vh - 152px)',
                                        sm: 'calc(100vh - 176px)',
                                        md: 'calc(100vh - 210px)',
                                    },
                                    display: 'grid',
                                    gridTemplateRows: 'auto auto 1fr auto',
                                    minHeight: 0,
                                }}
                            >
                                {/* Title row */}
                                <Box
                                    sx={{
                                        px: 2,
                                        py: 0.85,
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                        background: (t) =>
                                            `linear-gradient(90deg, ${alpha(t.palette.secondary.main, 0.18)} 0%, ${alpha(
                                                t.palette.secondary.main,
                                                0.04
                                            )} 60%, rgba(255,255,255,0) 100%)`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 2,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                                        <Button
                                            onClick={handleBackToProfile}
                                            startIcon={<ArrowBackIcon />}
                                            sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                                        >
                                            {(() => {
                                                const fn = String(profile?.first_name || '').trim() || 'User';
                                                const lower = fn.toLowerCase();
                                                const possessive = lower.endsWith('s') ? `${fn}’` : `${fn}’s`;
                                                return `Return to ${possessive} Profile`;
                                            })()}
                                        </Button>

                                        <Typography variant="h6" sx={{ fontWeight: 900 }}>
                                            Community Activity
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Tabs */}
                                <Box
                                    data-profile-expanded-tabs
                                    sx={{
                                        mt: 1,
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: '#FFFFFF',
                                    }}
                                >
                                    <Tabs
                                        value={expandedTab}
                                        onChange={(_, v) => setExpandedTab(v)}
                                        variant="fullWidth"
                                        sx={{
                                            minHeight: { xs: 46, sm: 58 },
                                            '& .MuiTab-root': {
                                                textTransform: 'none',
                                                minHeight: { xs: 46, sm: 58 },
                                                fontWeight: 800,
                                                py: { xs: 0.75, sm: 1.05 },
                                                '& .MuiTab-iconWrapper': {
                                                    marginBottom: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                },
                                            },
                                        }}
                                    >
                                        <Tab
                                            icon={<ExpandedTabIcon src={postsIcon} alt="Posts" size={24} />}
                                            iconPosition="start"
                                            label="Posts"
                                        />
                                        <Tab
                                            icon={<ExpandedTabIcon src={commentIconLit} alt="Comments" size={24} />}
                                            iconPosition="start"
                                            label="Comments"
                                        />
                                        <Tab
                                            icon={<ExpandedTabIcon src={likeIconLit} alt="Likes" size={26} squeezeX={0.8} />}
                                            iconPosition="start"
                                            label="Likes"
                                        />
                                        <Tab
                                            icon={<ExpandedTabIcon src={repostIconLit} alt="Reposts" size={24} />}
                                            iconPosition="start"
                                            label="Reposts"
                                        />
                                    </Tabs>
                                </Box>

                                <CardContent
                                    sx={{
                                        px: { xs: 1.25, sm: 2 },
                                        pt: 0,
                                        pb: { xs: 1.25, sm: 2 },
                                        bgcolor: '#FFFFFF',
                                        minHeight: 0,
                                        height: '100%',
                                        overflowY: 'auto',
                                        overflowX: 'hidden',
                                        overscrollBehaviorY: 'contain',
                                        WebkitOverflowScrolling: 'touch',

                                    }}
                                    ref={postsScrollRef}
                                    onClickCapture={blockLocationClicks}
                                    onKeyDownCapture={blockLocationClicks}
                                >
                                    {/* Filters row */}
                                    <Box
                                        sx={{
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 30,
                                            isolation: 'isolate',
                                            bgcolor: '#FFFFFF',
                                            backgroundColor: '#FFFFFF',
                                            pr: { xs: 1.25, sm: 2 },
                                            mx: { xs: -1.25, sm: -2 },
                                            px: { xs: 1.25, sm: 2 },
                                            pt: 1.25,
                                            pb: 1.25,
                                            borderBottom: '1px solid',
                                            borderColor: 'divider',
                                            boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
                                            '& .MuiInputLabel-root': {
                                                bgcolor: '#FFFFFF',
                                                px: 0.6,
                                            },
                                            '& .MuiInputLabel-shrink': {
                                                bgcolor: '#FFFFFF',
                                                px: 0.6,
                                            },
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                gap: 1.5,
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Box sx={{ flex: '1 1 220px', minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: '#FFFFFF' } }}>
                                                <FormControl size="small" fullWidth>
                                                    <InputLabel id="profile-expanded-category" shrink>Category</InputLabel>
                                                    <Select
                                                        labelId="profile-expanded-category"
                                                        label="Category"
                                                        value={expandedCategory}
                                                        onChange={(e) => setExpandedCategory(e.target.value)}
                                                        displayEmpty
                                                        renderValue={(val) => {
                                                            const v = String(val || '').trim().toLowerCase();
                                                            if (!v) return 'All Categories';
                                                            const found = PROFILE_CATEGORY_OPTIONS.find((o) => String(o.value || '').trim().toLowerCase() === v);
                                                            return found ? found.label : v;
                                                        }}
                                                    >
                                                        {PROFILE_CATEGORY_OPTIONS.map((o) => (
                                                            <MenuItem key={o.value || 'all'} value={o.value}>
                                                                {o.label}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </Box>

                                            <Box sx={{ flex: '1 1 180px', minWidth: 160, '& .MuiOutlinedInput-root': { bgcolor: '#FFFFFF' } }}>
                                                <FormControl size="small" fullWidth>
                                                    <InputLabel id="profile-expanded-sort" shrink>Sort</InputLabel>
                                                    <Select
                                                        labelId="profile-expanded-sort"
                                                        label="Sort"
                                                        value={expandedSort}
                                                        onChange={(e) => setExpandedSort(e.target.value)}
                                                    >
                                                        <MenuItem value="newest">Newest</MenuItem>
                                                        <MenuItem value="popular">Popular</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            </Box>
                                        </Box>
                                    </Box>

                                    {expandedTab !== 0 && engagementLoading ? (
                                        <Typography variant="body2" color="text.secondary" sx={{ px: 1, mb: 1 }}>
                                            Loading…
                                        </Typography>
                                    ) : null}

                                    {!tabCanView ? (
                                        <Box sx={{ py: 2 }}>
                                            <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
                                                {expandedTab === 1 ? cannotViewText(privacy?.comments) : expandedTab === 2 ? cannotViewText(privacy?.likes) : cannotViewText(privacy?.reposts)}
                                            </Typography>
                                        </Box>
                                    ) : expandedActiveFiltered.length === 0 ? (
                                        <ExpandedEmptyState
                                            iconSrc={emptyIcon}
                                            title={emptyTitle}
                                            subtitle={emptySubtitle}
                                        />
                                    ) : (
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

                                            {expandedActiveFiltered.slice(0, expandedVisibleCount).map((item, idx) => (
                                                <React.Fragment
                                                    key={`${expandedTab === 1 ? 'comment-group' : (item?.category || 'post')}-${expandedTab === 1 ? (item?.post_id || item?.post?.id || idx) : item?.id}-${expandedTab}`}
                                                >
                                                    {expandedTab === 1 ? (
                                                        (() => {
                                                            const g = item || {};
                                                            const post0 = g.post || {};
                                                            const comments = Array.isArray(g.comments) ? g.comments : [];
                                                            const total = comments.length;
                                                            const latest = comments[0] || null;

                                                            const timeLabel = (iso) => {
                                                                const d = iso ? new Date(iso) : null;
                                                                if (!d || Number.isNaN(d.valueOf())) return '';
                                                                return d.toLocaleString();
                                                            };

                                                            const truncate = (t, n) => {
                                                                const s0 = String(t || '').trim();
                                                                if (!s0) return '';
                                                                return s0.length > n ? `${s0.slice(0, n)}…` : s0;
                                                            };

                                                            return (
                                                                <Box
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault();
                                                                            if (latest) openCommentFromExpanded(latest);
                                                                        }
                                                                    }}
                                                                    onClick={() => {
                                                                        if (latest) openCommentFromExpanded(latest);
                                                                    }}
                                                                    sx={(t) => ({
                                                                        border: '1px solid',
                                                                        borderColor: 'rgba(2,6,23,0.10)',
                                                                        borderRadius: 2,
                                                                        bgcolor: '#fff',
                                                                        overflow: 'hidden',
                                                                        cursor: 'pointer',
                                                                        boxShadow: '0 10px 26px rgba(2,6,23,0.08)',
                                                                        '&:hover': { borderColor: t.palette.primary.main },
                                                                    })}
                                                                >
                                                                    <Box
                                                                        sx={(t) => ({
                                                                            px: 1.5,
                                                                            py: 1,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'space-between',
                                                                            gap: 1,
                                                                            background: `linear-gradient(90deg, ${alpha(t.palette.secondary.main, 0.14)} 0%, rgba(255,255,255,0) 75%)`,
                                                                            borderBottom: '1px solid rgba(2,6,23,0.08)',
                                                                        })}
                                                                    >
                                                                        <Box sx={{ minWidth: 0 }}>
                                                                            <Typography sx={{ fontWeight: 900 }} noWrap title={String(post0?.title || '')}>
                                                                                {String(post0?.title || '').trim() || 'Post'}
                                                                            </Typography>
                                                                            <Typography variant="caption" color="text.secondary" noWrap>
                                                                                {String(post0?.handle || '').trim() ? `@${String(post0.handle).trim()} • ` : ''}
                                                                                {latest?.created_at ? timeLabel(latest.created_at) : ''}
                                                                            </Typography>
                                                                        </Box>

                                                                        <Box
                                                                            sx={(t) => ({
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: 0.5,
                                                                                px: 1.1,
                                                                                py: 0.4,
                                                                                borderRadius: 999,
                                                                                border: `1px solid ${alpha(t.palette.primary.main, 0.16)}`,
                                                                                bgcolor: alpha(t.palette.primary.main, 0.06),
                                                                            })}
                                                                        >
                                                                            <Typography variant="caption" sx={{ fontWeight: 900, color: 'primary.main' }}>
                                                                                {total === 1 ? '1 comment' : `${total} comments`}
                                                                            </Typography>
                                                                        </Box>
                                                                    </Box>

                                                                    <Box sx={{ px: 1.5, py: 1.25, display: 'grid', gap: 1 }}>
                                                                        {comments.slice(0, 3).map((c) => {
                                                                            const cText = String(c?.content || '').trim();
                                                                            const isReply = !!c?.parent_id;
                                                                            const cTime = c?.created_at || null;

                                                                            return (
                                                                                <Box
                                                                                    key={`comment-${c?.id || c?.comment_id || ''}`}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        openCommentFromExpanded(c);
                                                                                    }}
                                                                                    role="button"
                                                                                    tabIndex={0}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            openCommentFromExpanded(c);
                                                                                        }
                                                                                    }}
                                                                                    sx={(t) => ({
                                                                                        border: '1px solid',
                                                                                        borderColor: 'rgba(2,6,23,0.08)',
                                                                                        borderRadius: 2,
                                                                                        px: 1.25,
                                                                                        py: 1,
                                                                                        bgcolor: alpha(t.palette.primary.main, 0.02),
                                                                                        '&:hover': { borderColor: alpha(t.palette.primary.main, 0.32) },
                                                                                    })}
                                                                                >
                                                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                                                                        <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>
                                                                                            {isReply ? 'Reply' : 'Comment'}
                                                                                        </Typography>
                                                                                        <Typography variant="caption" color="text.secondary">
                                                                                            {cTime ? timeLabel(cTime) : ''}
                                                                                        </Typography>
                                                                                    </Box>
                                                                                    <Typography
                                                                                        variant="body2"
                                                                                        sx={{
                                                                                            fontWeight: 800,
                                                                                            color: 'text.primary',
                                                                                            mt: 0.5,
                                                                                            whiteSpace: 'pre-wrap',
                                                                                            overflowWrap: 'anywhere',
                                                                                        }}
                                                                                    >
                                                                                        {truncate(cText, 260)}
                                                                                    </Typography>
                                                                                </Box>
                                                                            );
                                                                        })}

                                                                        {total > 3 ? (
                                                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                                                                                View all comments on this post
                                                                            </Typography>
                                                                        ) : null}
                                                                    </Box>
                                                                </Box>
                                                            );
                                                        })()
                                                    ) : (
                                                        <ProfilePostCard
                                                            post={item}
                                                            user={me}
                                                            hoveredId={hoveredId}
                                                            setHoveredId={setHoveredId}
                                                            onCardClick={openPostFromExpanded}
                                                            onEditPost={(post0) => {
                                                                const pid = Number(post0?.id || 0);
                                                                if (!pid) return;
                                                                setEditPostId(pid);
                                                                setEditOpen(true);
                                                            }}
                                                            onDeletePost={(post0) => {
                                                                const pid = Number(post0?.id || 0);
                                                                if (!pid) return;
                                                                setDeletePostId(pid);
                                                                setDeleteConfirmOpen(true);
                                                            }}
                                                            onOpenUserCard={(el, post0) => {
                                                                setUserAnchor(el);
                                                                setUserForCard({
                                                                    id: post0.user_id || post0.id,
                                                                    first_name: post0.first_name,
                                                                    last_name: post0.last_name,
                                                                    handle: post0.handle,
                                                                    avatar_url: post0.avatar_url || post0.profile_picture,
                                                                });
                                                            }}
                                                            onOpenShare={(post0) => {
                                                                setSharePost(post0);
                                                                setShareOpen(true);
                                                            }}
                                                        />
                                                    )}

                                                    {idx === expandedSentinelIndex - 1 ? (
                                                        <Box ref={expandedLoadMoreRef} sx={{ height: 1 }} />
                                                    ) : null}
                                                </React.Fragment>
                                            ))}
                                        </Box>
                                    )}
                                </CardContent>

                                {/* Single count location: footer ONLY */}
                                <Box
                                    sx={{
                                        px: 2,
                                        py: 1.1,
                                        borderTop: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: '#FFFFFF',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {tabCanView ? (
                                        <Box
                                            sx={(t) => ({
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                px: 2.25,
                                                py: 0.85,
                                                borderRadius: 999,
                                                background: alpha(t.palette.secondary.main, 0.10),
                                                border: `1px solid ${alpha(t.palette.secondary.main, 0.22)}`,
                                            })}
                                        >
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }}>
                                                {expandedCountText}
                                            </Typography>
                                        </Box>
                                    ) : null}
                                </Box>
                            </Card>
                        );
                    })()}

                    <UserCardPopover
                        anchorEl={userAnchor}
                        onClose={() => setUserAnchor(null)}
                        user={userForCard}
                        isSelf={!!(me && me.handle === userForCard?.handle)}
                        following={false}
                        onFollow={() => {}}
                        onMessage={() =>
                            window.dispatchEvent(new CustomEvent('open-message-center', { detail: { userId: userForCard?.id } }))
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
            <HistoryDialog type="work" open={workOpen} onClose={() => setWorkOpen(false)} value={workHistory} onChange={setWorkHistory} />
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
                aspect={1}
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
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Delete profile picture?
                    <IconButton onClick={() => setConfirmOpen(false)} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
                    <Button color="error" onClick={doDeleteAvatar}>
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
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Discard all changes?
                    <IconButton onClick={() => setDiscardOpen(false)} size="small" aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogActions>
                    <Button onClick={() => setDiscardOpen(false)}>Cancel</Button>
                    <Button
                        variant="outlined"
                        onClick={() => {
                            setPendingAvatar(null);
                            setDeleteAvatar(false);
                            setEditMode(false);
                            setDiscardOpen(false);
                            setFlash({ type: 'info', text: 'Changes discarded.' });
                        }}
                        sx={(t) => ({
                            textTransform: 'none',
                            borderColor: `rgba(201, 162, 77, 0.65)`,
                            color: t.palette.primary.main,
                            bgcolor: '#fff',
                            '&:hover': {
                                bgcolor: `rgba(201, 162, 77, 0.10)`,
                                borderColor: `rgba(201, 162, 77, 0.90)`,
                            },
                        })}
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
                    if (reason === 'backdropClick') return;
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

            {/* Edit community post dialog (shared component) */}
            <EditCommunityPostDialog open={editOpen} postId={editPostId} onClose={closeEditDialog} />

            {/* Shared delete confirmation (for delete buttons in post lists) */}
            <DeletePostConfirmDialog
                open={deleteConfirmOpen}
                postId={deletePostId}
                onClose={() => {
                    setDeleteConfirmOpen(false);
                    setDeletePostId(null);
                }}
                onDeleted={(deletedId) => {
                    const id = Number(deletedId ?? deletePostId);
                    applyDeletedCommunityPost(id);
                    setDeleteConfirmOpen(false);
                    setDeletePostId(null);
                }}
            />

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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2" color="text.secondary">
                                Loading history...
                            </Typography>
                        </Box>
                    ) : null}

                    {!historyLoading && (!historyRows || historyRows.length === 0) ? (
                        <Typography variant="body2" color="text.secondary">
                            No edit history found.
                        </Typography>
                    ) : null}

                    {!historyLoading && historyRows && historyRows.length ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {historyRows.map((row) => (
                                <Box
                                    key={row.id || row.version}
                                    sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 2, p: 1.25 }}
                                >
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        Version {row.version}
                                        {row.action ? ` • (${row.action})` : ''}
                                        {row.edited_at ? ` • ${dateTimeLabel(row.edited_at)}` : ''}
                                        {row.editor_handle ? ` • @${row.editor_handle}` : ''}
                                    </Typography>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                        {row?.snapshot?.title || '(no title)'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {row?.snapshot?.description || ''}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    ) : null}
                </DialogContent>
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
                        {markFoundPost?.title ? `You're marking “${markFoundPost.title}” as found.` : 'You are marking this item as found.'}{' '}
                        This will update the post card to show “Marked as Found by the Owner”. You can optionally add an update message (e.g., “Update: Thank you all for looking!”).
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

            {/* keep for future */}
            <Box sx={{ display: 'none' }} data-profile-key={profileKey} />
        </Box>
    );
}