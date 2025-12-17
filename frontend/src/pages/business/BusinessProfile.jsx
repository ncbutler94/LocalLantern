// src/components/SidePanel/Business/BusinessProfile.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    IconButton,
    Link,
    Paper,
    Rating,
    Snackbar,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    Alert,
} from '@mui/material';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import ShareIcon from '@mui/icons-material/Share';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlaceIcon from '@mui/icons-material/Place';
import LanguageIcon from '@mui/icons-material/Language';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import { useLocation, useNavigate } from 'react-router-dom';

import useBusinessDetail from '../../hooks/business/useBusinessDetail';
import {
    listBusinessMedia,
    listBusinessPosts,
    listDeals,
    setBusinessFollow,
} from '../../api/business/businesses';

import BusinessMediaLightbox from './BusinessDetail/BusinessMediaLightbox';
import ReviewsPanel from './BusinessDetail/ReviewsPanel';
import { ProfilePostCard } from '../../pages/profile/userProfile/ProfilePostsList';
import BusinessPhotoCarousel from './BusinessPhotoCarousel';

function ensureHttp(url = '') {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function shortUrl(url = '') {
    try {
        const u = new URL(ensureHttp(url));
        return u.hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'media', label: 'Photos & Videos' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'deals', label: 'Deals' },
];

export default function BusinessProfile({ businessId, onBack, user }) {
    const { data: biz, media: mediaFromHook, loading, error, refetch } =
        useBusinessDetail(businessId, { enabled: true });

    const [tab, setTab] = useState('overview');
    const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });
    const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

    const viewerIsOwner = !!biz?.viewer_is_owner;
    const [ownerMode, setOwnerMode] = useState(false);
    const [isFollowing, setIsFollowing] = useState(!!biz?.viewer_is_following);
    useEffect(() => setIsFollowing(!!biz?.viewer_is_following), [biz?.viewer_is_following]);

    // Router for "Back to All Businesses"
    const location = useLocation();
    const navigate = useNavigate();
    const [showBackToList, setShowBackToList] = useState(false);
    const [canGoBack, setCanGoBack] = useState(false);

    useEffect(() => {
        const qs = new URLSearchParams(location.search);
        const fromParam = qs.get('from');
        const fromState = location.state?.from === 'businesses' || location.state?.cameFrom === 'businesses';
        const ref = document.referrer || '';
        const fromRef = /\/businesses(?:\/|\?|$)/i.test(ref);

        const cameFromBusinesses = Boolean(fromParam === 'businesses' || fromParam === 'list' || fromState || fromRef);
        setShowBackToList(cameFromBusinesses);
        setCanGoBack(fromRef); // if they truly navigated from that page in history
    }, [location]);

    const handleBackToList = () => {
        if (typeof onBack === 'function') {
            onBack();
            return;
        }
        if (canGoBack) {
            navigate(-1);
        } else {
            navigate('/businesses');
        }
    };

    // Right‑rail data
    const [media, setMedia] = useState(mediaFromHook || []);
    const [posts, setPosts] = useState([]);
    const [deals, setDeals] = useState([]);

    const refreshMedia = useCallback(async () => {
        try {
            const j = await listBusinessMedia(businessId);
            const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
            setMedia(items);
        } catch {/* ignore */ }
    }, [businessId]);

    const loadPosts = useCallback(async () => {
        try {
            const j = await listBusinessPosts(businessId, { limit: 60 });
            setPosts(Array.isArray(j?.items) ? j.items : []);
        } catch { setPosts([]); }
    }, [businessId]);

    const loadDeals = useCallback(async () => {
        try {
            const j = await listDeals(businessId);
            setDeals(Array.isArray(j?.items) ? j.items : []);
        } catch { setDeals([]); }
    }, [businessId]);

    useEffect(() => {
        if (tab === 'overview') { refreshMedia(); loadPosts(); }
        if (tab === 'deals') loadDeals();
    }, [tab, refreshMedia, loadPosts, loadDeals]);

    // Lightbox for carousel
    const [lightbox, setLightbox] = useState({ open: false, index: 0 });
    const openLightboxAt = (i) => setLightbox({ open: true, index: i });
    const closeLightbox = () => setLightbox({ open: false, index: 0 });

    const ratingValue = useMemo(() => {
        if (typeof biz?.rating === 'number') return Number(biz.rating);
        if (typeof biz?.rating_half_stars === 'number') return Math.round(Number(biz.rating_half_stars)) / 2;
        if (typeof biz?.avg_rating === 'number') return Number(biz.avg_rating);
        return 0;
    }, [biz?.rating, biz?.rating_half_stars, biz?.avg_rating]);

    const mapsUrl = useMemo(() => {
        if (!biz) return '';
        const q = biz.latitude != null && biz.longitude != null
            ? `${biz.latitude},${biz.longitude}`
            : [biz.street_address, biz.city, biz.county].filter(Boolean).join(', ');
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    }, [biz]);

    // Owner “Overview” edit
    const [form, setForm] = useState({
        long_description: biz?.long_description || '',
        phone: biz?.phone || '',
        website: biz?.website || '',
        street_address: biz?.street_address || '',
        city: biz?.city || '',
        county: biz?.county || '',
    });
    useEffect(() => {
        setForm({
            long_description: biz?.long_description || '',
            phone: biz?.phone || '',
            website: biz?.website || '',
            street_address: biz?.street_address || '',
            city: biz?.city || '',
            county: biz?.county || '',
        });
    }, [biz?.long_description, biz?.phone, biz?.website, biz?.street_address, biz?.city, biz?.county]);

    const onChangeField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const saveOwnerEdits = async () => {
        try {
            const payload = {
                long_description: form.long_description,
                phone: form.phone || null,
                website: form.website || null,
                street_address: form.street_address || null,
                city: form.city || null,
                county: form.county || null,
            };
            const res = await fetch(`/api/businesses/${businessId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('save failed');
            await refetch();
            setOwnerMode(false);
            showToast('Profile updated');
        } catch {
            showToast('Could not save changes', 'error');
        }
    };

    const handleToggleFollow = async () => {
        try {
            const next = isFollowing ? 'unfollow' : 'follow';
            const r = await setBusinessFollow(businessId, next);
            setIsFollowing(!!r?.isFollowing);
            showToast(r?.isFollowing ? 'Following' : 'Unfollowed');
        } catch { showToast('Could not update follow', 'error'); }
    };

    const onShare = async () => {
        try {
            const shareData = { title: biz?.name || 'Business', text: biz?.description || '', url: window.location.href };
            if (navigator.share) await navigator.share(shareData);
            else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(shareData.url); showToast('Profile link copied'); return; }
            showToast('Share dialog opened');
        } catch {/* ignore */ }
    };

    if (loading) {
        return (
            <Box sx={{ p: 2, display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
                <CircularProgress />
            </Box>
        );
    }
    if (error || !biz) {
        return (
            <Box sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <IconButton onClick={onBack} aria-label="Back"><ArrowBackIcon /></IconButton>
                    <Typography variant="h6">Business not found</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">Please try again.</Typography>
            </Box>
        );
    }

    const cover = biz.cover_url || '';
    const AVATAR = 112;

    return (
        <Box sx={{ pb: 6, background: 'linear-gradient(135deg,#f7fbff 0%,#f4f6fb 50%,#f8fafc 100%)' }}>
            {/* Back to list – only if they came from /businesses */}
            {showBackToList && (
                <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, pt: 1, pb: 1 }}>
                    <Button onClick={handleBackToList} startIcon={<ArrowBackIcon />}>
                        Back to All Businesses
                    </Button>
                </Box>
            )}

            {/* COVER with full-width identity band inside */}
            <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2 }}>
                <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                    <Box
                        role={cover ? 'img' : undefined}
                        sx={{
                            position: 'relative',
                            height: { xs: 260, sm: 340, md: 440 },
                            background: cover ? `url(${cover}) center/cover no-repeat` : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: cover ? 'transparent' : 'grey.100',
                        }}
                    >
                        {!cover && (
                            <Typography variant="body2" color="text.secondary">No cover photo yet.</Typography>
                        )}

                        {/* FADE overlay to hide cover edges beneath the white band */}
                        <Box
                            aria-hidden
                            sx={{
                                pointerEvents: 'none',
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                height: 72,
                                background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 90%)',
                                zIndex: 1,
                            }}
                        />

                        {/* White identity band (top straight edge; fills entire bottom so corners never peek) */}
                        <Box
                            sx={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                bgcolor: '#fff',
                                borderTop: '1px solid rgba(2,6,23,0.08)',
                                // No side/bottom borders and no own bottom radius; the Card provides curved corners.
                                borderLeft: 'none',
                                borderRight: 'none',
                                borderBottom: 'none',
                                borderRadius: 0,
                                boxShadow: '0 -8px 22px rgba(2,6,23,0.10)',
                                py: { xs: 0.75, sm: 1 },
                                minHeight: { xs: 76, sm: 88 },
                                zIndex: 2,
                            }}
                        >
                            {/* Avatar straddling the band edge */}
                            <Avatar
                                src={biz.logo_url || ''}
                                alt={biz.name}
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: { xs: '50%', md: 20 },
                                    transform: { xs: 'translate(-50%,-50%)', md: 'translateY(-50%)' },
                                    width: AVATAR,
                                    height: AVATAR,
                                    border: '4px solid #fff',
                                    boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
                                    bgcolor: 'primary.light',
                                    fontWeight: 700,
                                }}
                            >
                                {(biz?.name || 'B').slice(0, 1)}
                            </Avatar>

                            {/* Content and actions */}
                            <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                alignItems={{ xs: 'center', md: 'center' }}
                                justifyContent="space-between"
                                spacing={1.25}
                                sx={{
                                    pt: { xs: `${AVATAR / 2 + 6}px`, md: 0 },
                                    // Extra spacing from avatar -> name
                                    pl: { xs: 0, md: `${AVATAR + 56}px` },
                                }}
                            >
                                <Box sx={{ flex: 1, minWidth: 0, textAlign: { xs: 'center', md: 'left' } }}>
                                    <Typography
                                        variant="h5"
                                        sx={{
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                            wordBreak: 'break-word',
                                            hyphens: 'auto',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {biz.name}
                                    </Typography>
                                    {!!biz.slug && (
                                        <Typography variant="body2" color="text.secondary">@{biz.slug}</Typography>
                                    )}
                                    {!!biz.category && (
                                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                                            {biz.category}
                                        </Typography>
                                    )}
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', justifyContent: { xs: 'center', md: 'flex-start' } }}>
                                        <Rating value={ratingValue} precision={0.5} readOnly />
                                        <Typography variant="caption" color="text.secondary">
                                            {ratingValue.toFixed(1)} · {biz.review_count || 0} {(biz.review_count || 0) === 1 ? 'review' : 'reviews'}
                                        </Typography>
                                    </Stack>
                                </Box>

                                <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <Button startIcon={<ChatBubbleOutlineIcon />} variant="outlined" onClick={() => showToast('Messaging is coming soon')}>
                                        Message
                                    </Button>
                                    {!viewerIsOwner && (
                                        <Button variant={isFollowing ? 'contained' : 'outlined'} onClick={handleToggleFollow}>
                                            {isFollowing ? 'Following' : 'Follow'}
                                        </Button>
                                    )}
                                    {viewerIsOwner && (
                                        !ownerMode ? (
                                            <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setOwnerMode(true)}>Customize</Button>
                                        ) : (
                                            <>
                                                <Button startIcon={<SaveIcon />} variant="contained" onClick={saveOwnerEdits}>Save</Button>
                                                <Button onClick={() => { setOwnerMode(false); refetch(); }}>Cancel</Button>
                                            </>
                                        )
                                    )}
                                    <Button startIcon={<ShareIcon />} onClick={onShare}>Share</Button>
                                </Stack>
                            </Stack>
                        </Box>
                    </Box>
                </Card>
            </Box>

            {/* BODY TABS */}
            <Box sx={{ mt: 2, maxWidth: 1400, mx: 'auto', px: 2 }}>
                <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                    <Tabs
                        value={tab}
                        onChange={(_, v) => setTab(v)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ px: 1 }}
                    >
                        {tabs.map((t) => <Tab key={t.key} label={t.label} value={t.key} />)}
                    </Tabs>
                    <Divider />
                    <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
                        {/* OVERVIEW */}
                        {tab === 'overview' && (
                            <Grid container spacing={2.5} alignItems="flex-start">
                                {/* LEFT RAIL */}
                                <Grid item xs={12} md={7}>
                                    {/* About */}
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>About</Typography>
                                    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                                        {!ownerMode ? (
                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                {biz.long_description || biz.description || 'No about information yet.'}
                                            </Typography>
                                        ) : (
                                            <TextField
                                                label="About"
                                                value={form.long_description}
                                                onChange={(e) => onChangeField('long_description', e.target.value)}
                                                fullWidth
                                                multiline
                                                minRows={6}
                                            />
                                        )}
                                    </Paper>

                                    {/* Contact */}
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Contact</Typography>
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        {!ownerMode ? (
                                            <Stack spacing={1.25}>
                                                {biz?.phone && (
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <PhoneIcon fontSize="small" />
                                                        <Link href={`tel:${biz.phone}`}>{biz.phone}</Link>
                                                    </Stack>
                                                )}
                                                {biz?.contact_email && (
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <EmailOutlinedIcon fontSize="small" />
                                                        <Link href={`mailto:${biz.contact_email}`}>{biz.contact_email}</Link>
                                                    </Stack>
                                                )}
                                                {biz?.website && (
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <LanguageIcon fontSize="small" />
                                                        <Link href={ensureHttp(biz.website)} target="_blank" rel="noopener">
                                                            {shortUrl(biz.website)}
                                                        </Link>
                                                    </Stack>
                                                )}
                                                {(!biz?.phone && !biz?.contact_email && !biz?.website) && (
                                                    <Typography variant="body2" color="text.secondary">No contact details yet.</Typography>
                                                )}
                                            </Stack>
                                        ) : (
                                            <Stack spacing={1}>
                                                <TextField size="small" label="Phone" value={form.phone} onChange={(e) => onChangeField('phone', e.target.value)} />
                                                <TextField size="small" label="Website" value={form.website} onChange={(e) => onChangeField('website', e.target.value)} />
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                                    <TextField size="small" label="Street Address" value={form.street_address} onChange={(e) => onChangeField('street_address', e.target.value)} fullWidth />
                                                </Stack>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                                    <TextField size="small" label="City" value={form.city} onChange={(e) => onChangeField('city', e.target.value)} />
                                                    <TextField size="small" label="County" value={form.county} onChange={(e) => onChangeField('county', e.target.value)} />
                                                </Stack>
                                            </Stack>
                                        )}
                                    </Paper>

                                    {/* Location */}
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>Location</Typography>
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        {(biz?.street_address || biz?.city || biz?.county) ? (
                                            <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                                <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                                                <Box>
                                                    <Typography variant="body2">
                                                        {[biz?.street_address, biz?.city].filter(Boolean).join(', ')}
                                                    </Typography>
                                                    <Typography variant="body2">{biz?.county}</Typography>
                                                    <Button
                                                        size="small"
                                                        component="a"
                                                        href={mapsUrl}
                                                        target="_blank"
                                                        rel="noopener"
                                                        startIcon={<OpenInNewIcon />}
                                                        sx={{ mt: 0.5 }}
                                                    >
                                                        Directions
                                                    </Button>
                                                </Box>
                                            </Stack>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">No address on file.</Typography>
                                        )}
                                    </Paper>
                                </Grid>

                                {/* RIGHT RAIL */}
                                <Grid item xs={12} md={5}>
                                    {/* Slideshow */}
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Photos</Typography>
                                    <BusinessPhotoCarousel
                                        items={media}
                                        onOpen={(i) => openLightboxAt(i)}
                                    />
                                    <Divider sx={{ my: 2 }} />

                                    {/* Posts */}
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Business Posts</Typography>
                                    <Paper variant="outlined" sx={{ p: 1.25 }}>
                                        <Box
                                            sx={{
                                                maxHeight: 520,
                                                overflowY: 'auto',
                                                overflowX: 'hidden',
                                                pr: { xs: 1.5, md: 2 },
                                                pl: 1.5,
                                                pt: 1,
                                                pb: 1,
                                            }}
                                        >
                                            {posts.length === 0 ? (
                                                <Typography variant="body2" color="text.secondary">
                                                    No posts yet.
                                                </Typography>
                                            ) : (
                                                <Stack spacing={1.5}>
                                                    {posts.map((p) => (
                                                        <ProfilePostCard
                                                            key={`${p.category || 'post'}-${p.id}`}
                                                            post={p}
                                                            user={user}
                                                            hoveredId={null}
                                                            setHoveredId={() => {}}
                                                            onLocationClick={() => {}}
                                                            onCardClick={() => {}}
                                                            onOpenUserCard={() => {}}
                                                            onOpenShare={() => {}}
                                                        />
                                                    ))}
                                                </Stack>
                                            )}
                                        </Box>
                                    </Paper>
                                </Grid>
                            </Grid>
                        )}

                        {tab === 'media' && (
                            <>
                                {media.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No photos or videos yet.</Typography>
                                ) : (
                                    <Grid container spacing={1.5}>
                                        {media.map((m, idx) => (
                                            <Grid key={(m.id || `g-${idx}`)} item xs={4} sm={3} md={3} lg={2.4}>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{ position: 'relative', borderRadius: 1.25, overflow: 'hidden', cursor: 'pointer' }}
                                                    onClick={() => openLightboxAt(idx)}
                                                >
                                                    <Box sx={{ pt: '100%', position: 'relative' }}>
                                                        <Box
                                                            component={m.type === 'video' ? 'video' : 'img'}
                                                            src={m.url}
                                                            alt=""
                                                            controls={m.type === 'video'}
                                                            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    </Box>
                                                </Paper>
                                            </Grid>
                                        ))}
                                    </Grid>
                                )}
                            </>
                        )}

                        {tab === 'reviews' && (
                            <ReviewsPanel business={biz} onBack={() => setTab('overview')} onCloseAll={() => setTab('overview')} user={user} />
                        )}

                        {tab === 'deals' && (
                            <Stack spacing={1.25}>
                                {deals.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No active deals posted yet.</Typography>
                                ) : deals.map((d) => (
                                    <Paper key={d.id} variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{d.title}</Typography>
                                        {!!d.description && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{d.description}</Typography>}
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
                                            {!!d.promo_code && <Chip size="small" label={`Code: ${d.promo_code}`} />}
                                            {!!d.url && <Button size="small" endIcon={<OpenInNewIcon />} href={ensureHttp(d.url)} target="_blank" rel="noopener">Learn more</Button>}
                                            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                                {d.starts_at ? `Starts ${new Date(d.starts_at).toLocaleDateString()}` : ''}{d.ends_at ? ` · Ends ${new Date(d.ends_at).toLocaleDateString()}` : ''}
                                            </Typography>
                                        </Stack>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </CardContent>
                </Paper>
            </Box>

            {/* LIGHTBOX */}
            {lightbox.open && (
                <BusinessMediaLightbox
                    items={media}
                    index={lightbox.index}
                    onClose={closeLightbox}
                    user={user}
                />
            )}

            {/* Toast */}
            <Snackbar
                open={toast.open}
                autoHideDuration={2800}
                onClose={() => setToast({ open: false, msg: '', severity: 'success' })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
            </Snackbar>
        </Box>
    );
}
