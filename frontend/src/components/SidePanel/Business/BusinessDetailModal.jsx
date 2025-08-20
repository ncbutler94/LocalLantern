// src/components/SidePanel/Business/BusinessDetailModal.jsx
import React, { useMemo, useState, useEffect } from 'react';
import {
    Box, Dialog, DialogTitle, DialogContent, IconButton, Typography, Chip, Stack, Link,
    Button, Divider, Tabs, Tab, TextField, Rating, Avatar, Tooltip, List, ListItem,
    ListItemIcon, ListItemText
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LaunchIcon from '@mui/icons-material/Launch';
import PhoneIcon from '@mui/icons-material/Phone';
import LanguageIcon from '@mui/icons-material/Language';
import RoomIcon from '@mui/icons-material/Room';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import YouTubeIcon from '@mui/icons-material/YouTube';
import TwitterIcon from '@mui/icons-material/Twitter';
import TikTokIcon from '@mui/icons-material/MusicNote';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

import MiniMap from '../../Map/MiniMap';
import useBusinessDetail from '../../../hooks/business/useBusinessDetail';

// for county/city centroids when no precise address
import cities from '../../../data/alabamaCities.json';
import counties from '../../../data/alabamaCounties.json';

function formatPhone(p = '') {
    const s = String(p || '').replace(/\D/g, '');
    if (s.length === 10) return `(${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
    if (s.length === 11 && s[0] === '1') return `+1 (${s.slice(1,4)}) ${s.slice(4,7)}-${s.slice(7)}`;
    return p || '';
}
function displayDomain(url = '') {
    try { const u = new URL(url); return u.hostname.replace(/^www\./, ''); } catch { return url; }
}
function ExternalLink({ href, children, icon }) {
    if (!href) return null;
    return (
        <Button component={Link} href={href} target="_blank" rel="noopener noreferrer"
                endIcon={icon || <LaunchIcon />} variant="outlined" sx={{ textTransform: 'none' }}>
            {children}
        </Button>
    );
}
function MediaItem({ url }) {
    const isVideo = /\.(mp4|webm|ogg)$/i.test(url);
    if (isVideo) return <Box component="video" src={url} controls preload="metadata" style={{ width: '100%', borderRadius: 8 }} />;
    return <Box component="img" src={url} alt="" sx={{ width: '100%', borderRadius: 1, objectFit: 'cover' }} />;
}

function centroidFromCityCounty(city, county) {
    if (city) {
        const c = cities.find(x => x.name === city);
        if (c?.coordinates?.length === 2) return { lat: c.coordinates[0], lng: c.coordinates[1] };
    }
    if (county) {
        const k = counties.find(x => x.name === county);
        if (k?.coordinates?.length === 2) return { lat: k.coordinates[0], lng: k.coordinates[1] };
    }
    return { lat: 32.806671, lng: -86.79113 }; // Alabama center
}

export default function BusinessDetailModal({ open, biz, onClose }) {
    const id = biz?.id;
    const { business, locations, reviews, deals, submitReview, removeMyReview, meReview, isAuthed } =
        useBusinessDetail(id, biz);

    const [tab, setTab] = useState(0);
    useEffect(() => { if (open) setTab(0); }, [open]);

    const gallery = useMemo(() => {
        const list = [];
        const c = business?.cover_url || business?.coverUrl || (business?.photos?.[0] ?? '');
        if (c) list.push(c);
        if (Array.isArray(business?.gallery_urls)) list.push(...business.gallery_urls);
        return Array.from(new Set(list.filter(Boolean)));
    }, [business]);

    // ------- Location preparation (multiple pins + fallback to city/county) -------
    const computedMarkers = useMemo(() => {
        if (!business) return [];
        // 1) Use locations table if present
        if (Array.isArray(locations) && locations.length) {
            return locations
                .map(l => ({
                    lat: Number(l.latitude), lng: Number(l.longitude),
                    title: business?.name || '', street_address: l.street_address || '',
                    city: l.city || '', county: l.county || ''
                }))
                .filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng));
        }
        // 2) Single precise point from business row
        if (Number.isFinite(Number(business?.latitude)) && Number.isFinite(Number(business?.longitude))) {
            return [{
                lat: Number(business.latitude), lng: Number(business.longitude),
                title: business?.name || '', street_address: business?.street_address || '',
                city: business?.city || '', county: business?.county || ''
            }];
        }
        // 3) Fallback: center of its city/county (no address → no directions)
        if (business?.city || business?.county) {
            const { lat, lng } = centroidFromCityCounty(business.city, business.county);
            return [{ lat, lng, title: business?.name || '', street_address: '' }];
        }
        return [];
    }, [business, locations]);

    const [activeLoc, setActiveLoc] = useState(0);
    useEffect(() => { setActiveLoc(0); }, [open, id]);

    const hasAnyAddress = useMemo(
        () => computedMarkers.some(m => (m.street_address || '').trim().length),
        [computedMarkers]
    );

    const directionsHref = useMemo(() => {
        const m = computedMarkers[activeLoc];
        if (!m || !(m.street_address || '').trim()) return '';
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
            `${m.street_address || ''} ${m.city || ''} ${m.county || ''} Alabama`
        )}`;
    }, [computedMarkers, activeLoc]);

    // Show the map if we have any form of geospatial info (pin or region)
    const showMap = computedMarkers.length > 0;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="xl"
            fullScreen={false}
            PaperProps={{ sx: { height: '90vh' } }}
        >
            <DialogTitle sx={{ pr: 6 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Avatar
                        src={business?.logo_url || business?.logoUrl || undefined}
                        alt={business?.name}
                        sx={{ width: 48, height: 48 }}
                    >
                        {(business?.name || 'B').slice(0, 1)}
                    </Avatar>

                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h5" sx={{ lineHeight: 1.1 }}>{business?.name}</Typography>
                        {business?.category && (
                            <Chip
                                icon={<RestaurantIcon />}
                                label={business.category}
                                size="small"
                                sx={{ mt: 0.5, maxWidth: 380, '.MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                            />
                        )}
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    {business?.website && <ExternalLink href={business.website}>Website</ExternalLink>}
                    {business?.menu_url && <ExternalLink href={business.menu_url} icon={<RestaurantIcon />}>Menu</ExternalLink>}
                    {business?.booking_url && <ExternalLink href={business.booking_url} icon={<CalendarMonthIcon />}>Book</ExternalLink>}
                    {business?.store_url && <ExternalLink href={business.store_url} icon={<ShoppingBagIcon />}>Shop</ExternalLink>}
                </Stack>

                <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 10 }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Tab label="Overview" />
                    <Tab label={`Reviews (${business?.review_count ?? 0})`} />
                    <Tab label={`Media (${gallery.length})`} />
                    <Tab label={`Deals (${deals.length})`} />
                    <Tab label="Shop" />
                </Tabs>

                {/* OVERVIEW */}
                {tab === 0 && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1.2fr 1fr' }, gap: 2, p: 2 }}>
                        {/* Left column: media + long description */}
                        <Box>
                            {gallery.length > 0 && (
                                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                                    <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                                        <MediaItem url={gallery[0]} />
                                    </Box>
                                    {gallery.slice(1, 5).map((url, i) => <MediaItem key={i} url={url} />)}
                                </Box>
                            )}

                            {business?.long_description && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="h6">About</Typography>
                                    <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                        {business.long_description}
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        {/* Right column: map → contact → hours */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {/* MAP (precise pin or county/city centroid) */}
                            {showMap && (
                                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between"
                                           sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                                        <Typography variant="subtitle1">Location</Typography>
                                        {!!directionsHref && (
                                            <Button
                                                size="small"
                                                component={Link}
                                                href={directionsHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                endIcon={<LaunchIcon />}
                                            >
                                                Directions
                                            </Button>
                                        )}
                                    </Stack>

                                    <MiniMap
                                        markers={computedMarkers}
                                        logoUrl={business?.logo_url || business?.logoUrl || ''}
                                        activeIndex={activeLoc}
                                        height={240}
                                    />

                                    {/* Location list (if multiple) */}
                                    {computedMarkers.length > 1 && (
                                        <List dense disablePadding>
                                            {computedMarkers.map((m, i) => (
                                                <ListItem
                                                    key={i}
                                                    button
                                                    onClick={() => setActiveLoc(i)}
                                                    selected={i === activeLoc}
                                                    sx={{ px: 2 }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 34 }}><RoomIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText
                                                        primary={m.street_address ? m.street_address : (m.city || m.county || 'Alabama')}
                                                        secondary={(m.city || m.county) ? [m.city, m.county && `${m.county} County`].filter(Boolean).join(', ') : null}
                                                    />
                                                </ListItem>
                                            ))}
                                        </List>
                                    )}
                                </Box>
                            )}

                            {/* CONTACT (under the map) */}
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                                <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                                    <Typography variant="subtitle1">Contact</Typography>
                                </Box>
                                <List dense disablePadding>
                                    {business?.phone && (
                                        <ListItem sx={{ px: 2 }}>
                                            <ListItemIcon sx={{ minWidth: 34 }}><PhoneIcon fontSize="small" /></ListItemIcon>
                                            <ListItemText
                                                primary={<Link href={`tel:${business.phone}`}>{formatPhone(business.phone)}</Link>}
                                            />
                                        </ListItem>
                                    )}
                                    {business?.website && (
                                        <ListItem sx={{ px: 2 }}>
                                            <ListItemIcon sx={{ minWidth: 34 }}><LanguageIcon fontSize="small" /></ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    <Link href={business.website} target="_blank" rel="noopener noreferrer">
                                                        {displayDomain(business.website)}
                                                    </Link>
                                                }
                                            />
                                        </ListItem>
                                    )}
                                    {(business?.street_address || business?.city || business?.county) && (
                                        <ListItem sx={{ px: 2 }} alignItems="flex-start">
                                            <ListItemIcon sx={{ minWidth: 34, mt: 0.25 }}><RoomIcon fontSize="small" /></ListItemIcon>
                                            <ListItemText
                                                primary={business.street_address || undefined}
                                                secondary={
                                                    <Typography variant="body2" color="text.secondary">
                                                        {[business.city, business.county && `${business.county} County`].filter(Boolean).join(', ')}
                                                    </Typography>
                                                }
                                            />
                                        </ListItem>
                                    )}
                                </List>

                                {/* Socials */}
                                {(business?.facebook_url || business?.instagram_url || business?.twitter_url ||
                                    business?.youtube_url || business?.tiktok_url) && (
                                    <Stack direction="row" spacing={1} sx={{ px: 1.25, py: 1 }}>
                                        {business?.facebook_url && (
                                            <Tooltip title="Facebook"><IconButton href={business.facebook_url} target="_blank" rel="noopener"><FacebookIcon /></IconButton></Tooltip>
                                        )}
                                        {business?.instagram_url && (
                                            <Tooltip title="Instagram"><IconButton href={business.instagram_url} target="_blank" rel="noopener"><InstagramIcon /></IconButton></Tooltip>
                                        )}
                                        {business?.twitter_url && (
                                            <Tooltip title="Twitter / X"><IconButton href={business.twitter_url} target="_blank" rel="noopener"><TwitterIcon /></IconButton></Tooltip>
                                        )}
                                        {business?.youtube_url && (
                                            <Tooltip title="YouTube"><IconButton href={business.youtube_url} target="_blank" rel="noopener"><YouTubeIcon /></IconButton></Tooltip>
                                        )}
                                        {business?.tiktok_url && (
                                            <Tooltip title="TikTok"><IconButton href={business.tiktok_url} target="_blank" rel="noopener"><TikTokIcon /></IconButton></Tooltip>
                                        )}
                                    </Stack>
                                )}
                            </Box>

                            {/* HOURS */}
                            {business?.hours_json && (
                                <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                                    <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                                        <AccessTimeIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'sub' }} />
                                        Hours
                                    </Typography>
                                    <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
                                        {Object.entries(business.hours_json).map(([day, hours]) => (
                                            <li key={day}>
                                                <Typography variant="body2">
                                                    {day}: {Array.isArray(hours) ? hours.join(', ') : String(hours)}
                                                </Typography>
                                            </li>
                                        ))}
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}

                {/* REVIEWS */}
                {tab === 1 && (
                    <Box sx={{ p: 2 }}>
                        <ReviewEditor
                            businessId={id}
                            isAuthed={isAuthed}
                            meReview={meReview}
                            onRequireAuth={() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { reason: 'review' } }))}
                            onSubmit={async (rating, comment) => { await submitReview(rating, comment); }}
                            onDelete={async () => { await removeMyReview(); }}
                        />
                        <Divider sx={{ my: 2 }} />
                        <ReviewList items={reviews} />
                    </Box>
                )}

                {/* MEDIA */}
                {tab === 2 && (
                    <Box sx={{ p: 2, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
                        {gallery.length === 0 && <Typography color="text.secondary">No media yet.</Typography>}
                        {gallery.map((url, i) => <MediaItem key={i} url={url} />)}
                    </Box>
                )}

                {/* DEALS */}
                {tab === 3 && (
                    <Box sx={{ p: 2, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                        {deals.length === 0 && <Typography color="text.secondary">No active deals.</Typography>}
                        {deals.map((d) => (
                            <Box key={d.id} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                                <Typography variant="h6">{d.title}</Typography>
                                {d.description && <Typography sx={{ mt: 0.5 }}>{d.description}</Typography>}
                                <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                                    {d.url && (
                                        <Button component={Link} href={d.url} target="_blank" rel="noopener" endIcon={<LaunchIcon />}>
                                            Get Deal
                                        </Button>
                                    )}
                                    {d.promo_code && (
                                        <Chip color="success" variant="outlined" label={`Code: ${d.promo_code}`} />
                                    )}
                                </Stack>
                                {(d.starts_at || d.ends_at) && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                        {d.starts_at ? `Starts: ${new Date(d.starts_at).toLocaleDateString()}` : ''} {d.ends_at ? `• Ends: ${new Date(d.ends_at).toLocaleDateString()}` : ''}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}

                {/* SHOP */}
                {tab === 4 && (
                    <Box sx={{ p: 2 }}>
                        {business?.store_url ? (
                            <Button
                                component={Link}
                                href={business.store_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="contained"
                                startIcon={<ShoppingBagIcon />}
                            >
                                Visit Store
                            </Button>
                        ) : (
                            <Typography color="text.secondary">This business hasn’t enabled an online store yet.</Typography>
                        )}
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ---------- Reviews subcomponents ---------- */

function ReviewEditor({ isAuthed, meReview, onSubmit, onDelete, onRequireAuth }) {
    const [rating, setRating] = useState(meReview ? meReview.rating : 0);
    const [text, setText] = useState(meReview?.comment || '');
    useEffect(() => {
        setRating(meReview ? meReview.rating : 0);
        setText(meReview?.comment || '');
    }, [meReview]);

    if (!isAuthed) {
        return (
            <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
                <Typography sx={{ mb: 1.5 }}>Log in or sign up to post a review.</Typography>
                <Stack direction="row" spacing={1} justifyContent="center">
                    <Button variant="contained" onClick={onRequireAuth}>Log in</Button>
                    <Button onClick={onRequireAuth}>Sign up</Button>
                </Stack>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="h6">{meReview ? 'Your review' : 'Write a review'}</Typography>
            <Rating value={rating} onChange={(_, v) => setRating(v || 0)} precision={0.5} sx={{ mt: 1 }} />
            <TextField
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share a few details about your experience…"
                multiline
                minRows={3}
                fullWidth
                sx={{ mt: 1 }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button variant="contained" onClick={() => onSubmit(rating, text)} disabled={rating <= 0}>
                    {meReview ? 'Update review' : 'Submit review'}
                </Button>
                {meReview && <Button color="error" onClick={onDelete}>Delete</Button>}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                One review per user is enforced on the server (upsert). Updating replaces your previous review.
            </Typography>
        </Box>
    );
}

function ReviewList({ items = [] }) {
    if (!items.length) {
        return <Typography color="text.secondary">No reviews yet.</Typography>;
    }
    return (
        <Stack spacing={2}>
            {items.map((r) => (
                <Box key={r.id} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar alt={`${r.user_id}`} />
                        <Rating value={r.rating_half_stars / 2} readOnly precision={0.5} size="small" />
                        <Typography variant="caption" color="text.secondary">
                            {new Date(r.created_at).toLocaleDateString()}
                        </Typography>
                    </Stack>
                    {r.comment && <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{r.comment}</Typography>}
                    {r.image && (
                        <Box sx={{ mt: 1 }}>
                            <Box component="img" src={r.image} alt="attached" sx={{ maxWidth: '100%', borderRadius: 1 }} />
                        </Box>
                    )}
                </Box>
            ))}
        </Stack>
    );
}
