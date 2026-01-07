// src/components/SidePanel/Community/NewCommunityPosts/CategoryPopup.jsx
// -----------------------------------------------------------------------------
// Step-1 dialog: lets the user pick which kind of Community post to create.
// -----------------------------------------------------------------------------
//
// • Adds category marker icons (matches CommunityFilter category dropdown)
// • Splits “Help Requests” and “Volunteers” into two separate choices
// • Alphabetises labels case-insensitively so new categories always sort nice
// • Emits { category } to parent so it can show the right Step-2 form
// -----------------------------------------------------------------------------

import React, { useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    Typography,
} from '@mui/material';

// Category markers (match CommunityList/CommunityFilter)
import announcementMarker from '../../../assets/mapMarkers/community/announcement-marker.png';
import announcementMarkerGold from '../../../assets/mapMarkers/community/announcement-marker-gold.png';
import discussionMarker from '../../../assets/mapMarkers/community/discussion-marker.png';
import discussionMarkerGold from '../../../assets/mapMarkers/community/discussion-marker-gold.png';
import lostFoundMarker from '../../../assets/mapMarkers/community/lost-and-found-marker.png';
import lostFoundMarkerGold from '../../../assets/mapMarkers/community/lost-and-found-marker-gold.png';
import safetyMarker from '../../../assets/mapMarkers/community/public-safety-alert-marker.png';
import safetyMarkerGold from '../../../assets/mapMarkers/community/public-safety-alert-marker-gold.png';
import recommendationsMarker from '../../../assets/mapMarkers/community/recommendations-marker.png';
import recommendationsMarkerGold from '../../../assets/mapMarkers/community/recommendations-marker-gold.png';
import volHelpMarker from '../../../assets/mapMarkers/community/volunteer-help-requests-marker.png';
import volHelpMarkerGold from '../../../assets/mapMarkers/community/volunteer-help-requests-marker-gold.png';

/* ─────────────── central list of post categories ─────────────── */
const DEFAULT_CATEGORIES = [
    { id: 'announcements', label: 'Announcements' },
    { id: 'general-discussion', label: 'General Discussion' },
    { id: 'lost-and-found', label: 'Lost & Found' },
    { id: 'public-safety-alerts', label: 'Public Safety Alerts' },
    // Legacy combined label in some DBs — we normalize to Recommendations below
    { id: 'recommendations-tips', label: 'Recommendations' },
    { id: 'help-requests', label: 'Help Requests' },
    { id: 'volunteer-requests', label: 'Volunteers' },
];

const normalizeStr = (v) => String(v ?? '').trim();

const CATEGORY_META = {
    announcement: { markerGreen: announcementMarker, markerGold: announcementMarkerGold },
    announcements: { markerGreen: announcementMarker, markerGold: announcementMarkerGold },

    discussion: { markerGreen: discussionMarker, markerGold: discussionMarkerGold },
    'general-discussion': { markerGreen: discussionMarker, markerGold: discussionMarkerGold },

    recommendations: { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    tips: { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    tip: { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    'recommendations-tips': { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },

    'help-requests': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    volunteers: { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-requests': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-help-requests': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-help': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },

    'lost-found': { markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },
    'lost-and-found': { markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },

    'public-safety-alerts': { markerGreen: safetyMarker, markerGold: safetyMarkerGold },
};

const getCategoryMeta = (id) => {
    const key = normalizeStr(id).toLowerCase();
    return CATEGORY_META[key] || null;
};

const CategoryRow = ({ markerSrc, label, muted = false }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {markerSrc ? (
            <Box
                component="img"
                src={markerSrc}
                alt=""
                sx={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    opacity: muted ? 0.5 : 1,
                }}
            />
        ) : (
            <Box sx={{ width: 22, height: 22, flexShrink: 0 }} />
        )}

        <Typography
            variant="body2"
            sx={{
                fontWeight: 750,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </Typography>
    </Box>
);

function normalizeCategoryOptions(list) {
    const input = Array.isArray(list) && list.length ? list : DEFAULT_CATEGORIES;

    const normalized = [];
    input.forEach((item) => {
        const rawId = item?.id || item?.slug || item?.value || item;
        const rawLabel = item?.label || item?.name || item?.text || '';

        const id = normalizeStr(rawId);
        const label = normalizeStr(rawLabel);

        if (!id) return;

        // Legacy “Recommendations & Tips” (and any “tips” slugs) -> Recommendations only
        if (id === 'recommendations-tips' || id === 'tips' || id === 'tip') {
            normalized.push({ id: 'recommendations', label: 'Recommendations' });
            return;
        }

        // Backwards compatibility: older DBs used a combined "Volunteer & Help Requests" slug.
        if (id === 'volunteer-help-requests' || id === 'volunteer-help') {
            normalized.push({ id: 'help-requests', label: 'Help Requests' });
            normalized.push({ id: 'volunteer-requests', label: 'Volunteers' });
            return;
        }

        normalized.push({ id, label: label || id });
    });

    // De-dupe by id (first one wins)
    const seen = new Set();
    return normalized.filter((c) => {
        const key = normalizeStr(c.id).toLowerCase();
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export default function CategoryPopup({
                                          subtypes = DEFAULT_CATEGORIES,
                                          onCancel,
                                          onCategoryChosen,
                                      }) {
    const [category, setCategory] = useState('');

    const sorted = useMemo(() => {
        return normalizeCategoryOptions(subtypes).sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
        );
    }, [subtypes]);

    const canNext = Boolean(category);

    const sharedMenuProps = {
        PaperProps: { className: 'll-cream-menu-paper' },
    };

    const selectedLabel = useMemo(() => {
        if (!category) return '';
        const found = sorted.find(
            (c) => normalizeStr(c.id).toLowerCase() === normalizeStr(category).toLowerCase(),
        );
        return found?.label || category;
    }, [category, sorted]);

    return (
        <>
            <DialogTitle sx={{ m: 0, p: 2 }}>New Community Post</DialogTitle>

            <DialogContent dividers>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                    <FormControl fullWidth required>
                        <InputLabel id="new-community-category-label" shrink>
                            Category
                        </InputLabel>
                        <Select
                            labelId="new-community-category-label"
                            value={category}
                            label="Category"
                            onChange={(e) => setCategory(String(e.target.value))}
                            MenuProps={sharedMenuProps}
                            displayEmpty
                            renderValue={(val) => {
                                const v = normalizeStr(val);
                                if (!v) {
                                    return <CategoryRow markerSrc={null} label="Select a category" muted />;
                                }

                                const meta = getCategoryMeta(v);
                                const markerSrc = meta?.markerGold || meta?.markerGreen || null;
                                return <CategoryRow markerSrc={markerSrc} label={selectedLabel} />;
                            }}
                            sx={{
                                '& .MuiSelect-select': {
                                    display: 'flex',
                                    alignItems: 'center',
                                },
                            }}
                        >
                            <MenuItem value="">
                                <CategoryRow markerSrc={null} label="Select a category" muted />
                            </MenuItem>

                            {sorted.map((c) => {
                                const meta = getCategoryMeta(c.id);
                                const markerSrc = meta?.markerGreen || null;

                                return (
                                    <MenuItem key={c.id} value={c.id}>
                                        <CategoryRow markerSrc={markerSrc} label={c.label} />
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    </FormControl>



                    <Box
                        sx={{
                            mt: 0.25,
                            fontSize: 12.5,
                            color: 'text.secondary',
                            border: '1px solid',
                            borderColor: (t) => alpha(t.palette.primary.main, 0.10),
                            bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
                            borderRadius: 2,
                            px: 1.25,
                            py: 1,
                        }}
                    >
                        Pick the type of post you’re creating. You’ll add details on the next step.
                    </Box>
                    <Box
                        sx={{
                            p: 1.5,
                            borderRadius: 3,
                            border: '1px solid rgba(0,0,0,0.08)',
                            backgroundColor: 'rgba(0,0,0,0.03)',
                        }}
                    >
                        <Typography
                            sx={{
                                fontWeight: 800,
                                fontSize: 13,
                                mb: 0.75,
                                color: '#0f3d2e',
                            }}
                        >
                            Community posting guidelines
                        </Typography>

                        <Box
                            component="ul"
                            sx={{
                                m: 0,
                                pl: 2.25,
                                fontSize: 12.5,
                                lineHeight: 1.55,
                                color: 'text.secondary',
                                '& li': { mb: 0.25 },
                                '& li:last-of-type': { mb: 0 },
                            }}
                        >
                            <li>Be respectful and neighborly.</li>
                            <li>No scams, spam, or harassment.</li>
                            <li>Illegal content will be removed.</li>
                        </Box>
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1 }}>
                <Button
                    variant="contained"
                    disabled={!canNext}
                    onClick={() => onCategoryChosen({ category })}
                >
                    Next
                </Button>
                <Button variant="outlined" onClick={onCancel}>
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
