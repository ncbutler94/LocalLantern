// src/pages/social/SocialHome.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
    InputAdornment,
    Menu,
    MenuItem,
    Paper,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import SendIcon from '@mui/icons-material/Send';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CheckIcon from '@mui/icons-material/Check';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

import CityCountySelect from '../../components/Common/CityCountySelect/CityCountySelect'
import MessageCenterDialog from '../../components/messages/MessageCenterDialog';

const api = process.env.REACT_APP_API_URL;

/* ---------------- helpers ---------------- */
const toName = (u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
const toHandle = (u) => `@${u.handle || u.username || ''}`;
const uniqById = (arr) => {
    const seen = new Set();
    return arr.filter((x) => (x && !seen.has(x.id) && seen.add(x.id)));
};

const throttleWindowMs = 2 * 60 * 1000; // 2 minutes
const cooldownMs = 5 * 60 * 1000; // 5 minutes

/* Card for each user */
function UserCard({ me, user, isFollowing, onFollow, onUnfollow, onMessage, disabled, disableReason }) {
    const [menuEl, setMenuEl] = useState(null);
    const open = Boolean(menuEl);

    const goProfile = () => {
        const slug = user.handle || user.public_id || user.id;
        if (slug) window.location.assign(`/${encodeURIComponent(slug)}`);
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 1.5,
                borderRadius: 2,
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow .15s ease',
                '&:hover': { boxShadow: 2 },
            }}
        >
            <Avatar
                src={user.profile_picture || user.avatar_url}
                alt={toName(user)}
                sx={{ width: 120, height: 120, borderRadius: 2, mx: 'auto', mb: 1, cursor: 'pointer' }}
                onClick={goProfile}
            />
            <Typography
                variant="subtitle2"
                sx={{ cursor: 'pointer' }}
                noWrap
                onClick={goProfile}
                title={toName(user)}
            >
                {toName(user) || '(name hidden)'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap title={toHandle(user)}>
                {toHandle(user)}
            </Typography>

            <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center' }}>
                {!me || me.id === user.id ? (
                    <Tooltip title="This is you">
            <span>
              <Button size="small" disabled startIcon={<CheckIcon />}>Following</Button>
            </span>
                    </Tooltip>
                ) : isFollowing ? (
                    <>
                        <Tooltip title={disabled ? disableReason : 'Following'}>
              <span>
                <Button
                    size="small"
                    color="primary"
                    variant="contained"
                    startIcon={<CheckIcon />}
                    onClick={(e) => setMenuEl(e.currentTarget)}
                    disabled={disabled}
                >
                  Following
                </Button>
              </span>
                        </Tooltip>
                        <Menu
                            anchorEl={menuEl}
                            open={open}
                            onClose={() => setMenuEl(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                        >
                            <MenuItem
                                onClick={() => {
                                    setMenuEl(null);
                                    onUnfollow?.(user);
                                }}
                            >
                                <PersonRemoveIcon fontSize="small" style={{ marginRight: 8 }} />
                                Unfollow
                            </MenuItem>
                        </Menu>
                    </>
                ) : (
                    <Tooltip title={disabled ? disableReason : 'Follow'}>
            <span>
              <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PersonAddAltIcon />}
                  onClick={() => onFollow?.(user)}
                  disabled={disabled}
              >
                Follow
              </Button>
            </span>
                    </Tooltip>
                )}

                <Tooltip title="Message">
          <span>
            <Button
                size="small"
                variant="outlined"
                startIcon={<MailOutlineIcon />}
                onClick={() => onMessage?.(user)}
                disabled={!me || me.id === user.id}
            >
              Message
            </Button>
          </span>
                </Tooltip>
            </Box>
        </Paper>
    );
}

/* ---------------- main page ---------------- */
export default function SocialHome({ me }) {
    const [tab, setTab] = useState(0); // 0=All,1=Following,2=Followers
    const [search, setSearch] = useState('');
    const [place, setPlace] = useState({ county: '', city: '' });

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]); // All
    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const counts = useMemo(
        () => ({ following: following.length, followers: followers.length }),
        [following, followers]
    );

    // follow throttle
    const [actions, setActions] = useState([]); // timestamps (ms)
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const isOnCooldown = cooldownUntil && Date.now() < cooldownUntil;
    const disableReason = isOnCooldown
        ? 'You are unfollowing/following too often. Disabled for 5 minutes.'
        : '';

    const canToggleFollow = () => {
        if (isOnCooldown) return false;
        const now = Date.now();
        const winStart = now - throttleWindowMs;
        const recent = actions.filter((t) => t >= winStart);
        if (recent.length >= 20) {
            setCooldownUntil(now + cooldownMs);
            return false;
        }
        setActions([...recent, now]);
        return true;
    };

    // messaging dialog
    const [msgOpen, setMsgOpen] = useState(false);
    const [msgRecipients, setMsgRecipients] = useState([]);

    const openMessage = (user) => {
        setMsgRecipients([user]);
        setMsgOpen(true);
    };

    /* ---------- fetching ---------- */
    const fetchAll = async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (search) qs.set('q', search);
            if (place.county) qs.set('county', place.county);
            if (place.city) qs.set('city', place.city);
            const r = await fetch(`${api}/users/search?${qs.toString()}`, { credentials: 'include' });
            const j = await r.json();
            setRows(Array.isArray(j?.users) ? j.users : []);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchSocial = async () => {
        if (!me) { setFollowing([]); setFollowers([]); return; }
        try {
            const who = me.handle || me.public_id || me.id;
            const r = await fetch(`${api}/users/social/${encodeURIComponent(who)}`, { credentials: 'include' });
            const j = await r.json();
            setFollowing(Array.isArray(j?.following) ? j.following : []);
            setFollowers(Array.isArray(j?.followers) ? j.followers : []);
        } catch {
            setFollowing([]); setFollowers([]);
        }
    };

    useEffect(() => { fetchSocial(); }, [me]); // counts are ready for tabs
    useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, []); // initial

    const onSearch = () => fetchAll();
    const onClear = () => { setSearch(''); setPlace({ county: '', city: '' }); setTimeout(fetchAll, 0); };

    /* ---------- follow/unfollow ---------- */
    const isFollowingUser = (u) => !!following.find((x) => x.id === u.id);

    const onFollow = async (u) => {
        if (!me || !u || !canToggleFollow()) return;
        try {
            const r = await fetch(`${api}/users/follow`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: u.id, action: 'follow' }),
            });
            if (r.ok) {
                setFollowing((old) => uniqById([...old, u]));
                // If the user appears in followers list, leave it; otherwise update counts only.
            }
        } catch {/* ignore */}
    };

    const onUnfollow = async (u) => {
        if (!me || !u || !canToggleFollow()) return;
        try {
            const r = await fetch(`${api}/users/follow`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: u.id, action: 'unfollow' }),
            });
            if (r.ok) {
                setFollowing((old) => old.filter((x) => x.id !== u.id));
            }
        } catch {/* ignore */}
    };

    /* ---------- derived lists ---------- */
    const list = tab === 0 ? rows : tab === 1 ? following : followers;

    /* ---------- layout constants ---------- */
    const tileHeight = 220; // approx total per card including paddings
    const gridMaxHeight = `calc(${tileHeight}px * 5 + 64px)`; // 5 rows + a little headroom

    return (
        <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2, py: 2 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="social tabs" sx={{ mb: 1 }}>
                    <Tab label="All" />
                    <Tab label={`Following (${counts.following})`} />
                    <Tab label={`Followers (${counts.followers})`} />
                </Tabs>

                {/* Filters */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 1fr auto auto' }, gap: 1 }}>
                    <TextField
                        label="Name or @username"
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />
                    {/* County / City via shared control */}
                    <CityCountySelect
                        value={place}
                        onChange={setPlace}
                        countyProps={{ size: 'small', label: 'County' }}
                        cityProps={{ size: 'small', label: 'City' }}
                    />

                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<SearchIcon />}
                            onClick={onSearch}
                            disabled={loading}
                        >
                            Search
                        </Button>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ClearIcon />}
                            onClick={onClear}
                            disabled={loading && !search && !place.county && !place.city}
                        >
                            Clear
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* Grid */}
            <Paper
                variant="outlined"
                sx={{
                    p: 1.5,
                    borderRadius: 2,
                    minHeight: 200,
                    maxHeight: gridMaxHeight,
                    overflowY: 'auto',
                }}
            >
                {loading ? (
                    <Typography sx={{ p: 2 }} color="text.secondary">Loading…</Typography>
                ) : list.length === 0 ? (
                    <Typography sx={{ p: 2 }} color="text.secondary">No users found.</Typography>
                ) : (
                    <Grid container spacing={2}>
                        {list.map((u) => {
                            const followingThis = isFollowingUser(u);
                            return (
                                <Grid key={u.id} item xs={12} sm={6} md={3}>
                                    <UserCard
                                        me={me}
                                        user={u}
                                        isFollowing={followingThis}
                                        onFollow={onFollow}
                                        onUnfollow={onUnfollow}
                                        onMessage={openMessage}
                                        disabled={isOnCooldown}
                                        disableReason={disableReason}
                                    />
                                </Grid>
                            );
                        })}
                    </Grid>
                )}
            </Paper>

            {/* Messages Center (prefilled) */}
            {me && (
                <MessageCenterDialog
                    open={msgOpen}
                    onClose={() => setMsgOpen(false)}
                    me={me}
                    presetRecipients={msgRecipients}
                />
            )}
        </Box>
    );
}
