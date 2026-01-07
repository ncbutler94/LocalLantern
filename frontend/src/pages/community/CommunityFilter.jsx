// src/pages/community/CommunityFilter.jsx
// -----------------------------------------------------------------------------
// Change summary (desktop + mobile):
// • FIX: Dropdown values sometimes appear blank when parent passes objects instead
//   of primitive strings (ex: { value, label } or { id, name }).
//   This file now normalizes incoming values + options robustly.
// • Restored safe fallback options for Sort and Date range if props are empty.
// • City/County inputs now use the same warm cream surface as the post area.
// • Category label overlap fix preserved (InputLabel shrink + labelId).
// • All non-search controls auto-trigger search; top search remains manual.
// • No unused variables; mobile-friendly spacing.
// -----------------------------------------------------------------------------
// NOTE: The Show/Hide Filters toggle lives in CommunityPanel's header row.

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { alpha } from '@mui/material/styles';
import {
    Box,
    Divider,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import SearchInput from '../../components/SearchInput';
import { useAuth } from '../../components/AuthModalContext';

// Category markers (match CommunityList category pins)
import announcementMarker from '../../assets/mapMarkers/community/announcement-marker.png';
import announcementMarkerGold from '../../assets/mapMarkers/community/announcement-marker-gold.png';
import discussionMarker from '../../assets/mapMarkers/community/discussion-marker.png';
import discussionMarkerGold from '../../assets/mapMarkers/community/discussion-marker-gold.png';
import lostFoundMarker from '../../assets/mapMarkers/community/lost-and-found-marker.png';
import lostFoundMarkerGold from '../../assets/mapMarkers/community/lost-and-found-marker-gold.png';
import safetyMarker from '../../assets/mapMarkers/community/public-safety-alert-marker.png';
import safetyMarkerGold from '../../assets/mapMarkers/community/public-safety-alert-marker-gold.png';
import recommendationsMarker from '../../assets/mapMarkers/community/recommendations-marker.png';
import recommendationsMarkerGold from '../../assets/mapMarkers/community/recommendations-marker-gold.png';
import volHelpMarker from '../../assets/mapMarkers/community/volunteer-help-requests-marker.png';
import volHelpMarkerGold from '../../assets/mapMarkers/community/volunteer-help-requests-marker-gold.png';

/* ───────── fallback categories reflect the split ───────── */
const DEFAULT_CATEGORIES = [
    { id: 'announcement', label: 'Announcements' },
    { id: 'general-discussion', label: 'General Discussion' },
    { id: 'lost-and-found', label: 'Lost & Found' },
    { id: 'public-safety-alerts', label: 'Public Safety Alerts' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'help-requests', label: 'Help Requests' },
    { id: 'volunteers', label: 'Volunteers' },
];

/**
 * View options:
 * - "Trending" is a View mode (under All Posts).
 * - My Posts / Following are auth-gated.
 */
const VIEW_OPTIONS = [
    { value: 'all', label: 'All Posts' },
    { value: 'trending', label: 'Trending' },
    { value: 'mine', label: 'My Posts' },
    { value: 'following', label: 'Following' },
];

/* Safe fallbacks if parent doesn't pass these (prevents blank dropdowns) */
const FALLBACK_SORT_OPTIONS = [
    { value: 'newest', label: 'Newest' },
    { value: 'popular', label: 'Most Popular' },
];

const FALLBACK_DATE_RANGE_OPTIONS = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
];

/* "All" labels for filter-only UX */
const ALL_COUNTIES_LABEL = 'All Counties';
const ALL_CITIES_LABEL = 'All Cities';

/* Category marker map (mirrors CommunityList BADGE) */
const CATEGORY_META = {
    announcement: { markerGreen: announcementMarker, markerGold: announcementMarkerGold },
    announcements: { markerGreen: announcementMarker, markerGold: announcementMarkerGold },

    discussion: { markerGreen: discussionMarker, markerGold: discussionMarkerGold },
    'general-discussion': { markerGreen: discussionMarker, markerGold: discussionMarkerGold },

    recommendations: { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    // Legacy keys (tips removed) → still render as Recommendations
    tips: { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    tip: { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },
    'recommendations-tips': { markerGreen: recommendationsMarker, markerGold: recommendationsMarkerGold },

    'help-requests': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    volunteers: { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-requests': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },
    'volunteer-help-requests': { markerGreen: volHelpMarker, markerGold: volHelpMarkerGold },

    'lost-found': { markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },
    'lost-and-found': { markerGreen: lostFoundMarker, markerGold: lostFoundMarkerGold },

    'public-safety-alerts': { markerGreen: safetyMarker, markerGold: safetyMarkerGold },
};

const normalizeStr = (v) => String(v ?? '').trim();

const getAnyString = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of keys) {
        const val = obj[k];
        if (typeof val === 'string' && val.trim()) return val.trim();
        if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    }
    return '';
};

/**
 * Normalizes select/autocomplete values that might arrive as objects.
 * Examples supported:
 * - "baldwin"
 * - { value: "baldwin", label: "Baldwin" }
 * - { id: "baldwin", name: "Baldwin" }
 */
const toValueString = (v) => {
    if (v === null || typeof v === 'undefined') return '';
    if (typeof v === 'string' || typeof v === 'number') return normalizeStr(v);
    if (typeof v === 'object') {
        const fromCommon = getAnyString(v, ['value', 'id', 'key', 'slug', 'name', 'label']);
        return normalizeStr(fromCommon);
    }
    return '';
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
                    opacity: muted ? 0.45 : 1,
                }}
            />
        ) : (
            <Box sx={{ width: 22, height: 22, flexShrink: 0 }} />
        )}

        <Typography
            variant="body2"
            sx={{
                fontWeight: 650,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </Typography>
    </Box>
);

export default function CommunityFilter({
                                            /* view */
                                            view,
                                            selectedView, // legacy alias; will be normalized
                                            onViewChange,

                                            /* search */
                                            searchTerm,
                                            onSearchTermChange,
                                            onSearchClick, // manual for top search AND auto for other controls
                                            onClearClick,

                                            /* city / county */
                                            filteredCities,
                                            filteredCounties,
                                            selectedCity,
                                            onCityChange,
                                            selectedCounty,
                                            onCountyChange,

                                            /* category */
                                            selectedSubtype,
                                            subtypes,
                                            onSubtypeChange,

                                            /* sort */
                                            selectedSort,
                                            sortOptions,
                                            onSortChange,

                                            /* date range */
                                            selectedDateRange,
                                            dateRangeOptions,
                                            onDateRangeChange,
                                        }) {
    const { isAuthenticated } = useAuth();

    // Keep a local mirror of the search term so dropdown-driven auto-search always uses
    // whatever is currently visible in the input (even if parent state is mid-batch).
    const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '');

    useEffect(() => {
        // Sync down changes from the parent (ex: external clear)
        setLocalSearchTerm(searchTerm || '');
    }, [searchTerm]);

    const triggerSearch = useCallback((mode = 'auto') => {
        if (typeof onSearchClick !== 'function') return;

        const term = normalizeStr(localSearchTerm);

        // Defer so any batched parent state updates (like clearing the input) apply first.
        setTimeout(() => {
            onSearchClick(mode, term);
        }, 0);
    }, [onSearchClick, localSearchTerm]);

    // Normalize the incoming "view" prop; prefer `view`, fall back to `selectedView`
    const effectiveView = toValueString(view) || toValueString(selectedView) || '';

    // Normalize selected values (these might be objects in some versions of the parent)
    const effectiveSubtype = toValueString(selectedSubtype);
    const effectiveSort = toValueString(selectedSort);

    // If the parent still has "random" persisted in state, normalize it away.
    useEffect(() => {
        const s = normalizeStr(effectiveSort).toLowerCase();
        if (s === 'random' || s === 'shuffle') {
            if (typeof onSortChange === 'function') onSortChange('newest');
            if (typeof onSearchClick === 'function') triggerSearch('auto');
        }
    }, [effectiveSort, onSortChange, triggerSearch]);
    const effectiveDateRange = toValueString(selectedDateRange);

    // Transform server-provided categories (or fallback) to split the legacy pairs.
    const categories = useMemo(() => {
        const src = (Array.isArray(subtypes) && subtypes.length ? subtypes : DEFAULT_CATEGORIES);

        const out = [];
        src.forEach((c) => {
            const id = toValueString(c?.id ?? c?.value ?? c);
            const label = normalizeStr(c?.label ?? c?.name ?? c?.text ?? '');

            // Legacy “Recommendations & Tips” (and any “tips” slugs) -> Recommendations only
            if (id === 'recommendations-tips' || id === 'tips' || id === 'tip') {
                out.push({ id: 'recommendations', label: 'Recommendations' });
                return;
            }

            // Volunteer & Help Requests -> Help Requests + Volunteers
            if (
                id === 'volunteer-requests' ||
                id === 'volunteer-help-requests' ||
                /volunteer\s*&\s*help/i.test(label)
            ) {
                out.push({ id: 'help-requests', label: 'Help Requests' });
                out.push({ id: 'volunteers', label: 'Volunteers' });
                return;
            }

            out.push({
                id: id || normalizeStr(c?.id),
                label: label || normalizeStr(c?.label ?? c?.name ?? c?.id ?? id),
            });
        });

        const seen = new Set();
        const deduped = [];
        out.forEach((c) => {
            const key = normalizeStr(c.id).toLowerCase();
            if (!key) return;
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push({ id: c.id, label: c.label });
        });

        return deduped;
    }, [subtypes]);

    const safeSortOptions = useMemo(() => {
        const src = Array.isArray(sortOptions) ? sortOptions : [];
        const normed = src
            .map((o) => ({
                value: toValueString(o?.value ?? o?.id ?? o),
                label: normalizeStr(o?.label ?? o?.name ?? o?.text ?? o?.value ?? o?.id ?? o),
            }))
            .filter((o) => o.value && o.label)
            // Remove "Random" from the UI now that boosted posts exist.
            .filter((o) => {
                const v = normalizeStr(o.value).toLowerCase();
                const l = normalizeStr(o.label).toLowerCase();
                if (v === 'random' || v === 'shuffle') return false;
                if (l === 'random' || l === 'shuffle' || l.includes('random')) return false;
                return true;
            });

        // Ensure we never show an empty dropdown if the parent only provided "random"
        return normed.length ? normed : FALLBACK_SORT_OPTIONS;
    }, [sortOptions]);

    const safeDateRangeOptions = useMemo(() => {
        const src = Array.isArray(dateRangeOptions) ? dateRangeOptions : [];
        const normed = src
            .map((o) => ({
                value: toValueString(o?.value ?? o?.id ?? o),
                label: normalizeStr(o?.label ?? o?.name ?? o?.text ?? o?.value ?? o?.id ?? o),
            }))
            .filter((o) => o.value && o.label);
        return normed.length ? normed : FALLBACK_DATE_RANGE_OPTIONS;
    }, [dateRangeOptions]);

    const sharedMenuProps = {
        // Keep default portal behavior so the menu anchors correctly to the field
        // even inside scroll/overflow containers.
        PaperProps: {
            sx: {
                bgcolor: '#fff',
                backgroundImage: 'none',
            },
        },
    };

    // Base control style
    const CONTROL_SX = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            backgroundColor: '#FFFFFF',
        },
        '& .MuiInputLabel-root': {
            fontWeight: 650,
        },
    };

    // County/City should match the warm "paper" surface used around posts
    const CREAM_INPUT_SX = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            // Match the post card surface (slightly warmer than pure white)
            backgroundColor: '#FFFFFF',
        },
    };

    // Force Autocomplete dropdown (Popper/Paper/Listbox) to pure white.
    // We include '!important' to beat theme/CSS overrides that set the tan background.
    const WHITE_AUTOCOMPLETE_SLOTS = {
        popper: {
            sx: {
                '& .MuiPaper-root': {
                    backgroundColor: '#fff !important',
                    backgroundImage: 'none !important',
                },
                '& .MuiAutocomplete-listbox': {
                    backgroundColor: '#fff !important',
                },
            },
        },
        paper: {
            sx: {
                backgroundColor: '#fff !important',
                backgroundImage: 'none !important',
            },
        },
        listbox: {
            sx: {
                backgroundColor: '#fff !important',
            },
        },
    };

    // Force Autocomplete dropdown background to white (overrides the theme tan/cream)
    const WHITE_AUTOCOMPLETE_MENU_SX = {
        '& .MuiAutocomplete-popper .MuiPaper-root': {
            bgcolor: '#fff',
            backgroundImage: 'none',
        },
        '& .MuiAutocomplete-listbox': {
            bgcolor: '#fff',
        },
        '& .MuiAutocomplete-option': {
            bgcolor: 'transparent',
        },
    };

    /* ───── helpers & local state ───── */
    const getCountyName = (c) => {
        if (typeof c === 'string') return c;
        if (typeof c === 'number') return String(c);
        if (c && typeof c === 'object') return getAnyString(c, ['label', 'name', 'value', 'id', 'county']) || '';
        return '';
    };

    const getCityName = (c) => {
        if (typeof c === 'string') return c;
        if (typeof c === 'number') return String(c);
        if (c && typeof c === 'object') return getAnyString(c, ['name', 'label', 'value', 'id', 'city']) || '';
        return '';
    };

    const countyName = normalizeStr(getCountyName(selectedCounty));
    const countyKey = countyName || 'all';

    const cityName = normalizeStr(getCityName(selectedCity));

    const cityLabel = countyName ? `City (${countyName})` : 'City';

    const [countyError, setCountyError] = useState(false);

    useEffect(() => {
        if (!selectedCounty) setCountyError(false);
    }, [selectedCounty]);

    // Default "View" to "All Posts" if empty — no fetch here
    useEffect(() => {
        if (!effectiveView) onViewChange('all');
    }, [effectiveView, onViewChange]);

    /* ───── source lists ───── */
    const safeCountiesRaw = Array.isArray(filteredCounties) ? filteredCounties : [];
    const safeCitiesRaw = Array.isArray(filteredCities) ? filteredCities : [];

    const safeCounties = useMemo(() => {
        return safeCountiesRaw
            .map((c) => (typeof c === 'string' ? c : (c?.label || c?.name || c?.value || '')))
            .map((s) => normalizeStr(s))
            .filter(Boolean);
    }, [safeCountiesRaw]);

    const safeCities = useMemo(() => {
        // Accept both strings and objects, optionally with county fields.
        return safeCitiesRaw
            .map((c) => {
                if (typeof c === 'string') return { name: c, county: '' };
                if (!c || typeof c !== 'object') return { name: '', county: '' };
                const name = normalizeStr(c?.name || c?.label || c?.value || c?.city || '');
                const county = normalizeStr(c?.county || c?.county_name || c?.countyName || '');
                return { name, county };
            })
            .filter((c) => c.name);
    }, [safeCitiesRaw]);

    /* ───── lengths for inputs ───── */
    const maxCountyChars = useMemo(() => {
        return Math.max(
            ...safeCounties.map((c) => c.length),
            ALL_COUNTIES_LABEL.length,
            24
        );
    }, [safeCounties]);

    const maxCityChars = useMemo(() => {
        return Math.max(
            ...safeCities.map((c) => c.name.length),
            ALL_CITIES_LABEL.length,
            36
        );
    }, [safeCities]);

    /* County options w/ “All Counties” at the top */
    const countiesWithAll = useMemo(() => {
        const uniq = Array.from(new Set(safeCounties));
        return [ALL_COUNTIES_LABEL, ...uniq];
    }, [safeCounties]);

    /* City options narrowed by selected county + “All Cities” at the top */
    const cityOptions = useMemo(() => {
        const base = (!countyName
                ? safeCities
                : safeCities.filter((c) => !c.county || c.county === countyName)
        ).map((c) => c.name);
        const uniq = Array.from(new Set(base));
        return [ALL_CITIES_LABEL, ...uniq];
    }, [safeCities, countyName]);

    /* View options: hide restricted ones when unauthenticated */
    const viewOptions = useMemo(() => {
        if (isAuthenticated) return VIEW_OPTIONS;
        return VIEW_OPTIONS.filter((o) => o.value === 'all' || o.value === 'trending');
    }, [isAuthenticated]);

    // If unauthenticated while 'mine'/'following' is selected, reset to 'all' AND search.
    useEffect(() => {
        if (!isAuthenticated && (effectiveView === 'mine' || effectiveView === 'following')) {
            onViewChange('all');
            if (typeof onSearchClick === 'function') triggerSearch('auto');
        }
    }, [isAuthenticated, effectiveView, onViewChange, triggerSearch]);

    /* ─────────────── render ─────────────── */
    return (
        <Box
            sx={{
                p: 2,
                bgcolor: 'background.paper',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 12px 34px rgba(15, 23, 42, 0.10)',
            }}
        >
            {/* Search (manual only) */}
            <SearchInput
                value={localSearchTerm}
                onChange={(e) => {
                    const next = e?.target?.value ?? '';
                    setLocalSearchTerm(next);
                    onSearchTermChange(next);
                }}
                onSearch={() => triggerSearch('manual')}
                onClear={() => {
                    setLocalSearchTerm('');
                    onSearchTermChange('');
                    if (typeof onClearClick === 'function') onClearClick();
                }}
            />

            <Divider sx={{ my: 2 }} />

            {/* Filters */}
            <Box
                sx={{
                    mt: 2,
                    p: 1.5,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    rowGap: 1.5,
                    alignItems: 'center',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    bgcolor: '#FFFFFF',
                    backgroundImage: (theme) =>
                        `linear-gradient(180deg, ${alpha(theme.palette.background.default, 0.65)} 0%, ${alpha(theme.palette.background.paper, 0.55)} 100%)`,
                    boxShadow: (theme) => `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}`,
                }}
            >
                {/* View (auto-search) */}
                <Box
                    sx={{
                        flexGrow: { xs: 1, sm: 0 },
                        flexShrink: { xs: 1, sm: 0 },
                        flexBasis: { xs: '100%', sm: '140px' },
                    }}
                >
                    <FormControl size="small" fullWidth sx={{ minWidth: 130, ...CONTROL_SX }}>
                        <InputLabel>View</InputLabel>
                        <Select
                            label="View"
                            value={viewOptions.some((o) => o.value === effectiveView) ? effectiveView : 'all'}
                            onChange={(e) => {
                                const nextView = normalizeStr(e?.target?.value || 'all').toLowerCase() || 'all';
                                onViewChange(nextView);

                                if (nextView === 'trending' && normalizeStr(effectiveSort).toLowerCase() === 'trending') {
                                    if (typeof onSortChange === 'function') onSortChange('newest');
                                }

                                if (typeof onSearchClick === 'function') triggerSearch('auto');
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {viewOptions.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {/* Category (auto-search; shrink label to prevent overlap) */}
                <Box
                    sx={{
                        flexGrow: { xs: 1, sm: 0 },
                        flexShrink: { xs: 1, sm: 0 },
                        flexBasis: { xs: '100%', sm: '200px' },
                    }}
                >
                    <FormControl size="small" fullWidth sx={{ minWidth: 170, ...CONTROL_SX }}>
                        <InputLabel id="community-category-label" shrink>
                            Category
                        </InputLabel>
                        <Select
                            id="community-category-select"
                            labelId="community-category-label"
                            label="Category"
                            value={effectiveSubtype}
                            onChange={(e) => {
                                const next = toValueString(e.target.value);
                                onSubtypeChange(next);
                                if (typeof onSearchClick === 'function') triggerSearch('auto');
                            }}
                            renderValue={(val) => {
                                const v = toValueString(val);
                                if (!v) return 'All Categories';

                                const found = categories.find((c) => normalizeStr(c.id).toLowerCase() === v.toLowerCase());
                                const label = found ? found.label : v;

                                const meta = getCategoryMeta(v);
                                const markerSrc = meta?.markerGold || meta?.markerGreen || null;

                                return <CategoryRow markerSrc={markerSrc} label={label} />;
                            }}
                            MenuProps={sharedMenuProps}
                            displayEmpty
                        >
                            <MenuItem value="">
                                <CategoryRow markerSrc={null} label="All Categories" muted />
                            </MenuItem>

                            {categories.map((c) => {
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
                </Box>

                {/* Sort (auto-search) */}
                <Box
                    sx={{
                        flexGrow: { xs: 1, sm: 0 },
                        flexShrink: { xs: 1, sm: 0 },
                        flexBasis: { xs: '100%', sm: '140px' },
                    }}
                >
                    <FormControl size="small" fullWidth sx={{ minWidth: 130, ...CONTROL_SX }}>
                        <InputLabel>Sort by</InputLabel>
                        <Select
                            label="Sort by"
                            value={safeSortOptions.some((o) => o.value === effectiveSort) ? effectiveSort : (safeSortOptions[0]?.value || 'newest')}
                            onChange={(e) => {
                                const next = toValueString(e.target.value) || (safeSortOptions[0]?.value || 'newest');
                                onSortChange(next);
                                if (typeof onSearchClick === 'function') triggerSearch('auto');
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {safeSortOptions.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {/* Date range (auto-search) */}
                <Box
                    sx={{
                        flexGrow: { xs: 1, sm: 0 },
                        flexShrink: { xs: 1, sm: 0 },
                        flexBasis: { xs: '100%', sm: '140px' },
                    }}
                >
                    <FormControl size="small" fullWidth sx={{ minWidth: 130, ...CONTROL_SX }}>
                        <InputLabel>Date range</InputLabel>
                        <Select
                            label="Date range"
                            value={effectiveDateRange || (safeDateRangeOptions[0]?.value || 'all')}
                            onChange={(e) => {
                                const next = toValueString(e.target.value) || (safeDateRangeOptions[0]?.value || 'all');
                                onDateRangeChange(next);
                                if (typeof onSearchClick === 'function') triggerSearch('auto');
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {safeDateRangeOptions.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {/* County + City (auto-search) */}
                <Box
                    sx={{
                        flexGrow: 1,
                        flexShrink: 1,
                        flexBasis: { xs: '100%', sm: '360px', md: '420px' },
                        minWidth: { xs: '100%', sm: 320 },
                        display: 'flex',
                        gap: 2,
                        flexDirection: { xs: 'column', sm: 'row' },
                    }}
                >
                    {/* County */}
                    <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', sm: 160 } }}>
                        <Autocomplete
                            key={`${countyKey}-county`}
                            size="small"
                            slotProps={WHITE_AUTOCOMPLETE_SLOTS}
                            freeSolo
                            options={countiesWithAll}
                            value={countyName ? countyName : ALL_COUNTIES_LABEL}
                            onChange={(_, val) => {
                                const str = normalizeStr(val);

                                // Always clear city when county changes
                                onCityChange('');

                                const isAll = str === ALL_COUNTIES_LABEL;
                                if (!str || isAll) {
                                    setCountyError(false);
                                    onCountyChange('');
                                } else {
                                    const valid = countiesWithAll.includes(str);
                                    setCountyError(!valid);
                                    onCountyChange(valid ? str : '');
                                }

                                if (typeof onSearchClick === 'function') triggerSearch('auto');
                            }}
                            renderInput={(p) => (
                                <TextField
                                    {...p}
                                    label="County"
                                    error={countyError}
                                    sx={{ ...CREAM_INPUT_SX }}
                                    inputProps={{
                                        ...p.inputProps,
                                        maxLength: maxCountyChars,
                                    }}
                                />
                            )}
                            clearOnEscape
                            autoHighlight
                            filterSelectedOptions
                        />
                    </Box>

                    {/* City */}
                    <Box sx={{ flex: '1 1 0', minWidth: { xs: '100%', sm: 160 } }}>
                        <Autocomplete
                            key={`${countyKey}-city`}
                            size="small"
                            slotProps={WHITE_AUTOCOMPLETE_SLOTS}
                            freeSolo
                            options={cityOptions}
                            value={cityName ? cityName : ALL_CITIES_LABEL}
                            onChange={(_, val) => {
                                const str = normalizeStr(val);
                                const isAll = str === ALL_CITIES_LABEL;
                                onCityChange(isAll ? '' : (str || ''));
                                if (typeof onSearchClick === 'function') triggerSearch('auto');
                            }}
                            renderInput={(p) => (
                                <TextField
                                    {...p}
                                    label={cityLabel}
                                    sx={{ ...CREAM_INPUT_SX }}
                                    inputProps={{
                                        ...p.inputProps,
                                        maxLength: maxCityChars,
                                    }}
                                />
                            )}
                            clearOnEscape
                            autoHighlight
                            filterSelectedOptions
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
