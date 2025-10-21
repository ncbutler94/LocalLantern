// src/pages/profile/UserProfilePage.jsx
// Layout: LEFT rail (About → Work → Education → Followers & Following → Photos → Location)
// RIGHT rail: Community Posts (one-card scroller).
// Fresh UI: gradient page bg, glassy cards, soft shadows, tighter vertical rhythm.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
    Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogTitle,
    Popover, Radio, RadioGroup, FormControlLabel, Typography,
} from '@mui/material';

import PostDetailModal from '../../../components/SidePanel/Community/PostDetailModal';

import ProfileHeader from '../userProfile/ProfileHeader';
import AboutSection from '../userProfile/AboutSection';
import LocationSection from '../userProfile/LocationSection';
import HistoryDialog from '../userProfile/HistoryDialog';
import ImageCropDialog from '../userProfile/ImageCropDialog';
import FollowsSection from '../userProfile/FollowsSection';
import PhotosSection from '../userProfile/PhotosSection';
import RightRail from '../userProfile/RightRail';

const api = process.env.REACT_APP_API_URL;

/** Glassy section card */
const SectionCard = ({ title, action, children, maxBodyHeight }) => (
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
            <Typography variant="h6">{title}</Typography>
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
    const [cropRound, setCropRound] = useState(false);

    // Dialogs
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmType, setConfirmType] = useState('');
    const [discardOpen, setDiscardOpen] = useState(false);

    // Privacy
    const [privacy, setPrivacy] = useState({});
    const [privacyAnchor, setPrivacyAnchor] = useState(null);
    const [privacyFor, setPrivacyFor] = useState(null);

    // Activity (right rail)
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedPost, setSelectedPost] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);
    const [catFilter, setCatFilter] = useState('all');
    const [sortOrder, setSortOrder] = useState('newest');
    const postsScrollRef = useRef(null);

    // Flash
    const [flash, setFlash] = useState(null);

    const isMine = me && profile && me.id === profile.id;

    /* Load profile + activity (abort-safe) */
    useEffect(() => {
        if (!handleOrId) { setLoading(false); setError('Profile not specified.'); return; }
        let alive = true;
        const controller = new AbortController();
        (async () => {
            setLoading(true); setError('');
            try {
                const res = await axios.get(`${api}/users/public/${encodeURIComponent(handleOrId)}`, {
                    withCredentials: true, signal: controller.signal
                });
                if (!alive) return;
                const p = res.data.profile;
                setProfile(p);
                setActivity(res.data.activity || {});
                setBioDraft(p?.bio || '');
                setRelationship(p?.relationship || '');
                setBirthday(p?.birthday || '');
                setHomeCity(p?.home_city || '');
                setHomeCounty(p?.home_county || '');
                const parseJ = (v) => (typeof v === 'string' ? JSON.parse(v || '[]') : (v || []));
                setWorkHistory(parseJ(p?.work_history_json));
                setEduHistory(parseJ(p?.education_history_json));
                const pj = p?.privacy_json ? (typeof p.privacy_json === 'string' ? JSON.parse(p.privacy_json) : p.privacy_json) : {};
                setPrivacy(pj);
                const sj = p?.social_json ? (typeof p.social_json === 'string' ? JSON.parse(p.social_json) : p.social_json) : {};
                setIsFollowing(!!me && Array.isArray(sj?.followers) && sj.followers.includes(me.id));
                setPendingAvatar(null); setPendingCover(null);
                setDeleteAvatar(false); setDeleteCover(false);
                setEditMode(false);
            } catch (err) {
                if (alive) setError(err.response?.data?.message || 'Failed to load profile');
            } finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; controller.abort(); };
    }, [handleOrId, me]);

    /* File pickers / crop */
    const pickFile = (cb) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => { const f = i.files?.[0]; if (f) cb(f); }; i.click(); };
    const changeAvatar = () => { pickFile((file) => { const r = new FileReader(); r.onload = () => { setCropSrc(r.result); setCropRound(true); setCropOpen(true); }; r.readAsDataURL(file); }); };
    const changeCover = () => { pickFile((file) => { const r = new FileReader(); r.onload = () => { setCropSrc(r.result); setCropRound(false); setCropOpen(true); }; r.readAsDataURL(file); }); };
    const onCropped = async (blob) => { if (cropRound) { setPendingAvatar(blob); setDeleteAvatar(false); setProfile((p) => ({ ...p, avatar_url: URL.createObjectURL(blob) })); } else { setPendingCover(blob); setDeleteCover(false); setProfile((p) => ({ ...p, cover_url: URL.createObjectURL(blob) })); } };
    const doDeleteAvatar = () => { setDeleteAvatar(true); setPendingAvatar(null); setProfile((p) => ({ ...p, avatar_url: null, profile_picture: null })); setConfirmOpen(false); };
    const doDeleteCover = () => { setDeleteCover(true); setPendingCover(null); setProfile((p) => ({ ...p, cover_url: null })); setConfirmOpen(false); };

    const saveProfile = async () => {
        try {
            setError('');
            const fd = new FormData();
            fd.append('bio', (bioDraft || '').slice(0, 500));
            if (relationship != null) fd.append('relationship', relationship || '');
            if (birthday) fd.append('birthday', birthday);
            if (homeCity) fd.append('home_city', homeCity.slice(0, 120));
            if (homeCounty) fd.append('home_county', homeCounty.slice(0, 120));
            fd.append('work_history_json', JSON.stringify(workHistory || []));
            fd.append('education_history_json', JSON.stringify(eduHistory || []));
            fd.append('privacy_json', JSON.stringify(privacy || {}));
            if (pendingAvatar) fd.append('profile_picture', pendingAvatar, 'avatar.jpg');
            if (pendingCover) fd.append('cover_photo', pendingCover, 'cover.jpg');
            if (deleteAvatar) fd.append('delete_avatar', '1');
            if (deleteCover) fd.append('delete_cover', '1');
            const res = await axios.put(`${api}/users/profile`, fd, { withCredentials: true });
            setProfile(res.data.user);
            setPendingAvatar(null); setPendingCover(null);
            setDeleteAvatar(false); setDeleteCover(false);
            setEditMode(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save profile');
        }
    };

    const openPrivacy = (e, key) => { setPrivacyFor(key); setPrivacyAnchor(e.currentTarget); };
    const setPrivacyLevel = async (lvl) => {
        setPrivacy((p) => ({ ...p, [privacyFor]: lvl }));
        try { await axios.put(`${api}/users/privacy`, { section: privacyFor, level: lvl }, { withCredentials: true }); }
        catch (e) { setPrivacy((p) => ({ ...p, [privacyFor]: (privacy?.[privacyFor] || 'public') })); setError(e.response?.data?.message || 'Failed to save privacy'); }
        finally { setPrivacyAnchor(null); setPrivacyFor(null); }
    };

    const toggleFollow = async () => {
        if (!me || !profile) return;
        try {
            const act = isFollowing ? 'unfollow' : 'follow';
            const r = await axios.post(`${api}/users/follow`, { target_id: profile.id, action: act }, { withCredentials: true });
            setIsFollowing(r.data.isFollowing);
            setFlash({ type: 'success', text: r.data.isFollowing ? 'You are now following this user.' : 'Unfollowed.' });
        } catch (e) { setFlash({ type: 'error', text: e.response?.data?.message || 'Failed to update follow.' }); }
    };

    /* Build Activity posts */
    const photosByPost = useMemo(() => {
        const m = {}; (activity?.photos || []).forEach((ph) => { if (!ph?.post_id) return; (m[ph.post_id] ||= []).push(ph.url); }); return m;
    }, [activity]);
    const author = useMemo(() => ({
        first_name: profile?.first_name, last_name: profile?.last_name,
        avatar_url: profile?.avatar_url || profile?.profile_picture || '',
    }), [profile]);
    const enrich = (arr, cat) => (arr || []).map((x) => ({
        ...x, key: `${cat}-${x.id}`, category: cat,
        first_name: author.first_name, last_name: author.last_name, avatar_url: author.avatar_url,
        date_created: x.date_created || x.posted_at || x.created_at, photos: x.photos || [],
    }));
    const activityPosts = useMemo(() => {
        const posts = (activity?.posts || []).map((p) => ({
            ...p, key: `post-${p.id}`,
            category: p.category || (p.lost_or_found ? 'lost-found' : 'post'),
            first_name: author.first_name, last_name: author.last_name, avatar_url: author.avatar_url,
            date_created: p.date_created || p.posted_at || p.created_at, photos: photosByPost[p.id] || [],
        }));
        const lf = enrich(activity?.lostFound,'lost-found');
        const alerts = enrich(activity?.alerts,'public-safety-alerts');
        const recs = enrich(activity?.recsTips,'recommendation');
        const vols = enrich(activity?.volunteer,'volunteer-requests');
        return [...posts, ...lf, ...alerts, ...recs, ...vols];
    }, [activity, author, photosByPost]);

    const filteredSorted = useMemo(() => {
        let arr = activityPosts.slice();
        if (catFilter !== 'all') arr = arr.filter((p) => (p.category || 'post') === catFilter);
        arr.sort((a, b) => (sortOrder === 'newest'
            ? new Date(b.date_created) - new Date(a.date_created)
            : new Date(a.date_created) - new Date(b.date_created)));
        return arr;
    }, [activityPosts, catFilter, sortOrder]);

    if (loading) return null;
    const avatarSrc = pendingAvatar ? URL.createObjectURL(pendingAvatar) : (profile?.avatar_url || profile?.profile_picture || undefined);

    return (
        <Box
            sx={{
                pb: 4,
                background: 'linear-gradient(135deg, #f7fbff 0%, #f4f6fb 50%, #f8fafc 100%)',
                minHeight: '100vh',
            }}
        >
            {flash && <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2, mt: 1 }}><Alert severity={flash.type} onClose={() => setFlash(null)}>{flash.text}</Alert></Box>}
            {error && <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2, mt: 1 }}><Alert severity="error" onClose={() => setError('')}>{error}</Alert></Box>}

            <ProfileHeader
                profile={profile}
                avatarSrc={avatarSrc}
                isMine={isMine}
                editMode={editMode}
                onEnterEdit={() => setEditMode(true)}
                onSave={saveProfile}
                onCancel={() => setDiscardOpen(true)}
                onChangeAvatar={changeAvatar}
                onDeleteAvatar={() => { setConfirmType('avatar'); setConfirmOpen(true); }}
                onChangeCover={changeCover}
                onDeleteCover={() => { setConfirmType('cover'); setConfirmOpen(true); }}
                viewer={me}
                isFollowing={isFollowing}
                onToggleFollow={toggleFollow}
            />

            {/* Two-column grid */}
            <Box
                sx={{
                    maxWidth: 1100, mx: 'auto', px: 2, mt: 2,
                    display: 'grid', columnGap: 2, rowGap: 1.5,
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0,560px) minmax(0,1fr)' },
                    alignItems: 'start',
                }}
            >
                {/* LEFT rail */}
                <Box sx={{ position: { md: 'sticky' }, bottom: { md: 16 }, alignSelf: 'start', display: 'grid', gap: 1.5 }}>
                    <AboutSection
                        editMode={editMode}
                        profile={profile}
                        bioDraft={bioDraft} setBioDraft={setBioDraft}
                        relationship={relationship} setRelationship={setRelationship}
                        birthday={birthday} setBirthday={setBirthday}
                        onPrivacy={(e, key) => openPrivacy(e, key)}
                    />

                    <SectionCard title="Work History" action={editMode ? <Button onClick={() => setWorkOpen(true)}>Add / Edit</Button> : null} maxBodyHeight={240}>
                        {Array.isArray(workHistory) && workHistory.length > 0 ? (
                            <Box sx={{ display: 'grid', gap: 1.25 }}>
                                {workHistory.map((w, i) => (
                                    <Box key={`${w.title || 'role'}-${i}`} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                                        <Typography fontWeight={600}>{w.title || 'Role'}{w.company ? ` · ${w.company}` : ''}</Typography>
                                        {w.location && <Typography variant="body2" color="text.secondary">{w.location}</Typography>}
                                        {(w.start_date || w.end_date || w.current) && (
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                                <b>Start:</b> {w.start_date || '—'} &nbsp;&nbsp; <b>End:</b> {w.current ? 'Present' : (w.end_date || '—')}
                                            </Typography>
                                        )}
                                        {w.description && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: .5 }}>{w.description}</Typography>}
                                    </Box>
                                ))}
                            </Box>
                        ) : <Typography color="text.secondary">No work history yet.</Typography>}
                    </SectionCard>

                    <SectionCard title="Education History" action={editMode ? <Button onClick={() => setEduOpen(true)}>Add / Edit</Button> : null} maxBodyHeight={240}>
                        {Array.isArray(eduHistory) && eduHistory.length > 0 ? (
                            <Box sx={{ display: 'grid', gap: 1.25 }}>
                                {eduHistory.map((ed, i) => (
                                    <Box key={`${ed.school || 'school'}-${i}`} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                                        <Typography fontWeight={600}>{ed.school || 'School'}{ed.degree ? ` · ${ed.degree}` : ''}</Typography>
                                        {ed.field && <Typography variant="body2" color="text.secondary">{ed.field}</Typography>}
                                        {(ed.start_date || ed.end_date || ed.current) && (
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                                <b>Start:</b> {ed.start_date || '—'} &nbsp;&nbsp; <b>End:</b> {ed.current ? 'Present' : (ed.end_date || '—')}
                                            </Typography>
                                        )}
                                        {ed.description && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: .5 }}>{ed.description}</Typography>}
                                    </Box>
                                ))}
                            </Box>
                        ) : <Typography color="text.secondary">No education history yet.</Typography>}
                    </SectionCard>

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
                            <Typography variant="h6">Followers &amp; Following</Typography>
                        </Box>
                        <CardContent sx={{ pt: 0.5, pb: 1.25 }}>
                            <FollowsSection
                                viewer={me}
                                profileId={profile?.id}
                                profileHandle={profile?.handle}
                                onFlash={setFlash}
                                isFollowingProfile={isFollowing}
                                onToggleFollowProfile={toggleFollow}
                            />
                        </CardContent>
                    </Card>

                    <PhotosSection profileHandle={profile?.handle} isOwner={isMine} viewer={me} />

                    <LocationSection
                        editMode={editMode}
                        homeCity={homeCity} setHomeCity={setHomeCity}
                        homeCounty={homeCounty} setHomeCounty={setHomeCounty}
                        onPrivacy={(e) => openPrivacy(e, 'location')}
                    />
                </Box>

                {/* RIGHT rail: Community Posts */}
                <RightRail
                    title="Activity"
                    catFilter={catFilter}
                    setCatFilter={setCatFilter}
                    sortOrder={sortOrder}
                    setSortOrder={setSortOrder}
                    postsScrollRef={postsScrollRef}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    me={me}
                    posts={filteredSorted}
                    onOpenPost={(post) => { setSelectedPost(post); setDetailOpen(true); }}
                />
            </Box>

            {/* Privacy popover */}
            <Popover
                open={Boolean(privacyAnchor)}
                anchorEl={privacyAnchor}
                onClose={() => { setPrivacyAnchor(null); setPrivacyFor(null); }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 2, width: 260 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>Who can see this?</Typography>
                    <RadioGroup value={privacy[privacyFor] || 'public'} onChange={(e) => setPrivacyLevel(e.target.value)}>
                        <FormControlLabel value="public"  control={<Radio />} label="Public" />
                        <FormControlLabel value="friends" control={<Radio />} label="Friends Only" />
                        <FormControlLabel value="private" control={<Radio />} label="Only Me" />
                    </RadioGroup>
                </Box>
            </Popover>

            {/* Crop dialog */}
            <ImageCropDialog
                open={cropOpen}
                onClose={() => setCropOpen(false)}
                src={cropSrc}
                aspect={cropRound ? 1 : 3}
                round={cropRound}
                onCropped={onCropped}
            />

            {/* Delete confirm */}
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>
                    Are you sure you want to delete your {confirmType === 'cover' ? 'cover photo' : 'profile picture'}?
                </DialogTitle>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setConfirmOpen(false)}>No</Button>
                    <Button color="error" variant="contained" onClick={confirmType === 'cover' ? doDeleteCover : doDeleteAvatar}>Yes</Button>
                </DialogActions>
            </Dialog>

            {/* Discard edits confirm */}
            <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)}>
                <DialogTitle>Discard all changes to your profile?</DialogTitle>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDiscardOpen(false)}>No</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => {
                            setBioDraft(profile?.bio || '');
                            setRelationship(profile?.relationship || '');
                            setBirthday(profile?.birthday || '');
                            setHomeCity(profile?.home_city || '');
                            setHomeCounty(profile?.home_county || '');
                            setPendingAvatar(null); setPendingCover(null);
                            setDeleteAvatar(false); setDeleteCover(false);
                            setEditMode(false);
                            setDiscardOpen(false);
                        }}
                    >
                        Yes
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Work / Education editors */}
            <HistoryDialog open={workOpen} type="work" initialItems={workHistory} onSave={(items) => { setWorkHistory(items); setWorkOpen(false); }} onClose={() => setWorkOpen(false)} />
            <HistoryDialog open={eduOpen}  type="education" initialItems={eduHistory} onSave={(items) => { setEduHistory(items); setEduOpen(false); }} onClose={() => setEduOpen(false)} />

            {/* Post detail modal */}
            <PostDetailModal open={detailOpen} post={selectedPost} onClose={() => setDetailOpen(false)} user={me} />
        </Box>
    );
}
