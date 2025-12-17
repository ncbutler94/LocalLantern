// src/components/SidePanel/Events/EventsList.jsx
// -----------------------------------------------------------------------------
// Two-up grid on desktop. Location row sits just above the action bar.
// Only the location row turns blue on hover; the rest of the card goes grey.
// Clicking the location pans/zooms the map (and opens the popup if a pin exists).
// -----------------------------------------------------------------------------

import React, { memo, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Card,
    CardContent,
    CardActions,
    Typography,
    Chip,
    IconButton,
    Button,
    Stack,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    RadioGroup,
    FormControlLabel,
    Radio,
    Tooltip,
    Avatar,
} from '@mui/material';

import CloseIcon from '@mui/icons-material/Close';
import EventIcon from '@mui/icons-material/Event';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ShareIcon from '@mui/icons-material/Share';
import FlagIcon from '@mui/icons-material/Flag';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { useAuth } from '../../components/AuthModalContext';

const API_BASE = process.env.REACT_APP_API_URL || '';

const fmtDateTime = (s, e) => {
    try {
        const start = new Date(s);
        const end = e ? new Date(e) : null;
        const d = start.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
        const t1 = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const t2 = end ? ` – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
        return `${d} • ${t1}${t2}`;
    } catch {
        return '';
    }
};

const Pill = ({ label }) => <Chip label={label} size="small" sx={{ height: 22 }} />;

/* ───────────────────── Report popup (with X) ───────────────────── */
function ReportEventDialog({ open, onClose, onSubmit }) {
    const [reason, setReason] = useState('spam');

    const handleClose = (_e, r) => {
        if (r === 'backdropClick' || r === 'escapeKeyDown') return;
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" disableEscapeKeyDown>
            <DialogTitle sx={{ pr: 5 }}>
                Report event
                <IconButton
                    aria-label="Close"
                    onClick={() => onClose()}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    Why are you reporting this event?
                </Typography>
                <RadioGroup
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    sx={{ '& .MuiFormControlLabel-root': { my: 0.25 } }}
                >
                    <FormControlLabel value="spam" control={<Radio size="small" />} label="Spam / repetitive" />
                    <FormControlLabel value="wrong-info" control={<Radio size="small" />} label="Wrong info" />
                    <FormControlLabel value="offensive" control={<Radio size="small" />} label="Offensive content" />
                    <FormControlLabel value="other" control={<Radio size="small" />} label="Other" />
                </RadioGroup>
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1 }}>
                <Button onClick={() => onClose()}>Cancel</Button>
                <Button variant="contained" onClick={() => onSubmit(reason)}>Submit</Button>
            </DialogActions>
        </Dialog>
    );
}

ReportEventDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
};

/* =============================================================================
 * Card
 * =========================================================================== */
export const EventCard = memo(function EventCard({
                                                     ev,
                                                     user,
                                                     hoveredId,
                                                     setHoveredId,
                                                     onLocationClick,
                                                     onCardClick,
                                                 }) {
    const {
        id,
        title,
        description,
        image_url,
        start_datetime,
        end_datetime,
        venue_name,
        address,
        city,
        county,
        lat,
        lng,
        category,
        is_free,
        is_online,
        interested_count,
        going_count,
        viewer_interested,
        viewer_going,
        organizer = {},
    } = ev;

    const countyLabel = county
        ? String(county).toLowerCase().includes('county') ? county : `${county} County`
        : '';
    const locationStr =
        [address, city, countyLabel].filter(Boolean).join(', ') ||
        [venue_name, city, countyLabel].filter(Boolean).join(', ');

    // Photo
    const [imgError, setImgError] = useState(false);
    const hasImage = !!image_url && !imgError;

    // Interested / Going UI state
    const auth = useAuth();
    const [interested, setInterested] = useState(!!viewer_interested);
    const [going, setGoing] = useState(!!viewer_going);
    const [intCount, setIntCount] = useState(Number(interested_count || 0));
    const [goCount, setGoCount] = useState(Number(going_count || 0));
    const [reported, setReported] = useState(false);

    const requireAuth = (cb) => {
        if (user) { cb?.(); return; }
        if (auth && typeof auth.open === 'function') auth.open();
    };

    const doToggleInterested = (e) => {
        e.stopPropagation();
        requireAuth(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/events/${id}/interested`, { method: 'POST', credentials: 'include' });
                if (!res.ok) throw new Error('bad status');
                const j = await res.json();
                setInterested(!!j?.interested);
                setIntCount(Number(j?.count || 0));
            } catch {
                // swallow — UI unchanged if the server rejected it
            }
        });
    };

    const doToggleGoing = (e) => {
        e.stopPropagation();
        requireAuth(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/events/${id}/going`, { method: 'POST', credentials: 'include' });
                if (!res.ok) throw new Error('bad status');
                const j = await res.json();
                setGoing(!!j?.going);
                setGoCount(Number(j?.count || 0));
            } catch {
                // swallow — UI unchanged if the server rejected it
            }
        });
    };

    const doShare = (e) => {
        e.stopPropagation();
        requireAuth(async () => {
            const shareUrl = `${window.location.origin}/events/${id}`;
            try {
                if (navigator.share) await navigator.share({ title: title || 'Event', url: shareUrl });
                else { await navigator.clipboard.writeText(shareUrl); alert('Link copied to clipboard'); }
            } catch { /* ignore */ }
        });
    };

    const [reportOpen, setReportOpen] = useState(false);
    const doOpenReport = (e) => {
        e.stopPropagation();
        if (reported) return;
        setReportOpen(true);
    };
    const doSubmitReport = async (reason) => {
        try {
            const res = await fetch(`${API_BASE}/api/events/${id}/report`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            if (res.ok) setReported(true);
        } catch {
            /* ignore */
        } finally {
            setReportOpen(false);
        }
    };

    // Description preview (clamped so fixed height works)
    const text = (description || '').toString().trim();
    const words = text ? text.split(/\s+/) : [];
    const long = words.length > 26;
    const preview = long ? words.slice(0, 26).join(' ') : text;

    // Hover visuals like BusinessCard: grey on details, blue only on location row
    const [overAddress, setOverAddress] = useState(false);
    const isHovered = hoveredId === id;

    // Layout constants (desktop)
    const IMG_W = 180;
    const CARD_H = 240; // uniform desktop height

    // location is clickable if we have any place detail
    const canLocate = Boolean((lat && lng) || city || county || address || venue_name);

    return (
        <>
            <Card
                sx={{
                    display: { xs: 'block', sm: hasImage ? 'grid' : 'block' },
                    gridTemplateColumns: { sm: hasImage ? `${IMG_W}px 1fr` : undefined },
                    width: '100%',
                    borderRadius: 2,
                    border: 1,
                    borderColor: isHovered ? 'primary.main' : 'divider',
                    overflow: 'hidden',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
                    height: { xs: 'auto', sm: CARD_H }, // fixed height on desktop for ALL cards
                    cursor: 'pointer',
                    bgcolor: isHovered && !overAddress ? 'grey.100' : 'background.paper', // grey hover for details area
                    transition: (theme) => theme.transitions.create(['background-color','border-color'], { duration: 120 }),
                }}
                onMouseEnter={() => setHoveredId?.(id)}
                onMouseLeave={() => setHoveredId?.(null)}
                onClick={() => onCardClick?.(ev)} // details open the event
            >
                {/* Left image column (desktop only if image exists) */}
                {hasImage && (
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, height: '100%', width: '100%', bgcolor: 'grey.100' }}>
                        <Box
                            component="img"
                            src={image_url}
                            alt=""
                            onError={() => setImgError(true)}
                            loading="lazy"
                            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                    </Box>
                )}

                {/* Stacked image for small screens */}
                {hasImage && (
                    <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                        <Box
                            component="img"
                            src={image_url}
                            alt=""
                            onError={() => setImgError(true)}
                            loading="lazy"
                            sx={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                        />
                    </Box>
                )}

                {/* Right column / or full width content when no image */}
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <CardContent sx={{ pt: 1.5, pb: 1, flex: '1 1 auto' }}>
                        {/* Title + chips */}
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, flexWrap: 'wrap' }}>
                            <EventIcon fontSize="small" />
                            <Typography variant="subtitle1" fontWeight={700} sx={{ wordBreak: 'break-word' }} title={title}>
                                {title}
                            </Typography>
                            {category && <Pill label={category} />}
                            {is_online && <Chip size="small" color="info" variant="outlined" label="Online Event" sx={{ height: 22 }} />}
                            {is_free && <Chip size="small" color="success" variant="outlined" label="Free" sx={{ height: 22 }} />}
                        </Stack>

                        {/* Date/time */}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {fmtDateTime(start_datetime, end_datetime)}
                        </Typography>

                        {/* Description preview (clamped) */}
                        {preview && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                    mt: 1,
                                    lineHeight: 1.45,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {preview}{long && ' …'}
                            </Typography>
                        )}

                        {/* Posted by — compact */}
                        {organizer?.id && (
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">Posted by</Typography>
                                <Avatar src={organizer.avatar_url || organizer.profile_picture || ''} sx={{ width: 20, height: 20 }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ lineHeight: 1.2 }}>
                                        {organizer.first_name} {organizer.last_name}
                                    </Typography>
                                    {!!organizer.handle && (
                                        <Typography variant="caption" color="text.secondary">@{organizer.handle}</Typography>
                                    )}
                                </Box>
                            </Stack>
                        )}

                        {/* Location (dedicated row just above action bar) */}
                        {(venue_name || address || city || county) && (
                            <Box
                                className="locationRow"
                                onMouseEnter={(e) => { e.stopPropagation(); setHoveredId?.(id); setOverAddress(true); }}
                                onMouseLeave={(e) => { e.stopPropagation(); setOverAddress(false); }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLocationClick?.(lat ?? null, lng ?? null, id, city ?? '', county ?? '');
                                }}
                                sx={{
                                    mt: 'auto',
                                    pt: 0.75,
                                    color: 'text.secondary',
                                    cursor: canLocate ? 'pointer' : 'default',
                                    '&:hover': { color: 'primary.main' }, // blue ONLY when this row is hovered
                                }}
                            >
                                <Box display="flex" alignItems="flex-start" gap={0.75}>
                                    <LocationOnIcon sx={{ fontSize: 16, mt: '2px' }} />
                                    <Typography
                                        variant="body2"
                                        sx={{ color: 'inherit', m: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        title={locationStr}
                                    >
                                        {locationStr}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </CardContent>

                    <Divider />

                    {/* ── ACTION BAR ─────────────────────────────────────────────────── */}
                    <CardActions sx={{ px: 1.25, py: 1, flexWrap: 'wrap', gap: 0.5 }}>
                        {/* Interested */}
                        <Button
                            size="small"
                            startIcon={interested ? <StarIcon /> : <StarBorderIcon />}
                            color={interested ? 'primary' : 'inherit'}
                            variant={interested ? 'contained' : 'text'}
                            onClick={doToggleInterested}
                            aria-pressed={interested ? 'true' : 'false'}
                            sx={{ fontSize: 12, textTransform: 'none', minWidth: 0, px: 1 }}
                        >
                            Interested&nbsp;<Box component="span" sx={{ fontWeight: 600 }}>{intCount}</Box>
                        </Button>

                        {/* Going */}
                        <Button
                            size="small"
                            startIcon={going ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                            color={going ? 'primary' : 'inherit'}
                            variant={going ? 'contained' : 'text'}
                            onClick={doToggleGoing}
                            aria-pressed={going ? 'true' : 'false'}
                            sx={{ fontSize: 12, textTransform: 'none', minWidth: 0, px: 1 }}
                        >
                            Going&nbsp;<Box component="span" sx={{ fontWeight: 600 }}>{goCount}</Box>
                        </Button>

                        {/* Share (requires login) */}
                        <Tooltip title="Share">
                            <IconButton size="small" onClick={doShare}>
                                <ShareIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>

                        {/* Report */}
                        <Tooltip title="Report Event">
              <span>
                <IconButton size="small" disabled={reported} onClick={doOpenReport}>
                  <FlagIcon fontSize="small" />
                </IconButton>
              </span>
                        </Tooltip>
                    </CardActions>
                </Box>
            </Card>

            {/* Report dialog */}
            <ReportEventDialog open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={doSubmitReport} />
        </>
    );
});
EventCard.displayName = 'EventCard';

export default function EventsList({
                                       user,
                                       events = [],
                                       hoveredId,
                                       setHoveredId,
                                       onLocationClick,
                                       onCardClick,
                                       columns = 'auto',
                                   }) {
    const list = Array.isArray(events) ? events : [];

    const rendered = useMemo(
        () =>
            list.map((ev) => (
                <Box
                    key={`ev-${ev.id}`}
                    sx={{ minWidth: 0, maxWidth: '100%' }}
                >
                    <EventCard
                        ev={ev}
                        user={user}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={onCardClick}
                    />
                </Box>
            )),
        [list, user, hoveredId, setHoveredId, onLocationClick, onCardClick]
    );

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflow: 'hidden' }}>
            {list.length > 0 ? (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: columns === 'one'
                            ? '1fr'
                            : { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, // 2-up on desktop
                        gap: 2,
                        width: '100%',
                    }}
                >
                    {rendered}
                </Box>
            ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 5 }}>
                    <Typography variant="body2" color="text.secondary">No events found.</Typography>
                </Box>
            )}
        </Box>
    );
}

EventsList.propTypes = {
    user: PropTypes.any,
    events: PropTypes.array,
    hoveredId: PropTypes.number,
    setHoveredId: PropTypes.func,
    onLocationClick: PropTypes.func,
    onCardClick: PropTypes.func,
    columns: PropTypes.oneOf(['auto', 'one']),
};
