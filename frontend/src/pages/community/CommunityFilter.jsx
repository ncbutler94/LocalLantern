// src/pages/community/CommunityFilter.jsx
// -----------------------------------------------------------------------------
// Change summary (desktop + mobile):
// • FIX: Category label overlap — InputLabel now uses `shrink` and is linked
//   to the Select via `labelId`. Placeholder "All Categories" renders without
//   colliding with the label.
// • All non-search controls (View, Category, Sort, Date range, County, City)
//   now auto-trigger a search (onChange -> onSearchClick('auto')).
// • Top search box remains MANUAL — only pressing its Search button (or Enter)
//   triggers a fetch via onSearchClick('manual').
// • "All Counties" / "All Cities" are present and keep the field readable.
// • Avoided useMemo pitfalls; no unused variables; mobile-friendly spacing.
//
// UPDATE (Trending move):
// • "Trending" was moved from Sort-by into the View dropdown (under All Posts).
//   View options now include: All Posts, Trending, My Posts, Following.
//   (Auth-gated: My Posts / Following hidden when not authenticated.)
// -----------------------------------------------------------------------------
// NOTE: The Show/Hide Filters toggle now lives in CommunityPanel's header row,
// so it is always accessible even when filters are collapsed.

import React, { useMemo, useState, useEffect } from 'react';
import {
    Box,
    Divider,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import SearchInput from '../../components/SearchInput';
import { useAuth } from '../../components/AuthModalContext';

/* ───────── fallback categories reflect the split ───────── */
const DEFAULT_CATEGORIES = [
    { id: 'announcement', label: 'Announcements' },
    { id: 'general-discussion', label: 'General Discussion' },
    { id: 'lost-and-found', label: 'Lost & Found' },
    { id: 'public-safety-alerts', label: 'Public Safety Alerts' },
    // Split “Recommendations & Tips”
    { id: 'tips', label: 'Tips' },
    { id: 'recommendations', label: 'Recommendations' },
    // Split “Volunteer & Help Requests”
    { id: 'help-requests', label: 'Help Requests' },
    { id: 'volunteers', label: 'Volunteers' },
];

/**
 * View options:
 * - "Trending" is now a View mode (under All Posts).
 * - My Posts / Following remain auth-gated.
 */
const VIEW_OPTIONS = [
    { value: 'all', label: 'All Posts' },
    { value: 'trending', label: 'Trending' },
    { value: 'mine', label: 'My Posts' },
    { value: 'following', label: 'Following' },
];

/* "All" labels for filter-only UX */
const ALL_COUNTIES_LABEL = 'All Counties';
const ALL_CITIES_LABEL = 'All Cities';

export default function CommunityFilter({
                                            /* search */
                                            view,
                                            selectedView, // legacy alias; will be normalized
                                            onViewChange,
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

    // Transform server-provided categories (or fallback) to split the legacy pairs.
    const categories = useMemo(() => {
        const src = (Array.isArray(subtypes) && subtypes.length ? subtypes : DEFAULT_CATEGORIES);

        // Split combined categories into two + de-dupe ids
        const out = [];
        src.forEach((c) => {
            const id = String(c.id || '').trim().toLowerCase();
            const label = String(c.label || c.name || '').trim();

            // Recommendations & Tips -> Tips + Recommendations
            if (id === 'recommendations-tips') {
                out.push({ id: 'tips', label: 'Tips' });
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

            out.push({ id: id || c.id, label: c.label || label || c.id });
        });

        const seen = new Set();
        const deduped = [];
        out.forEach((c) => {
            const key = String(c.id || '').trim().toLowerCase();
            if (!key) return;
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push({ id: c.id, label: c.label });
        });

        return deduped;
    }, [subtypes]);

    const sharedMenuProps = { disablePortal: true };

    // Normalize the incoming "view" prop; prefer `view`, fall back to `selectedView`
    const effectiveView = view ?? selectedView ?? '';

    /* ───── helpers & local state ───── */
    const getCountyName = (c) => (typeof c === 'string' ? c : c?.label || '');
    const countyName = getCountyName(selectedCounty);
    const countyKey = countyName || 'all';
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
    const safeCounties = Array.isArray(filteredCounties) ? filteredCounties : [];
    const safeCities = Array.isArray(filteredCities) ? filteredCities : [];

    /* ───── lengths for inputs ───── */
    const maxCountyChars = useMemo(() => {
        return Math.max(
            ...safeCounties.map((c) => (typeof c === 'string' ? c : c?.label || '').length),
            ALL_COUNTIES_LABEL.length,
            24
        );
    }, [safeCounties]);

    const maxCityChars = useMemo(() => {
        return Math.max(
            ...safeCities.map((c) => (typeof c === 'string' ? c : c?.name || c?.label || '').length),
            ALL_CITIES_LABEL.length,
            36
        );
    }, [safeCities]);

    /* County options w/ “All Counties” at the top */
    const countiesWithAll = useMemo(() => {
        const denorm = safeCounties.map((c) => (typeof c === 'string' ? c : c?.label || '')).filter(Boolean);
        const uniq = Array.from(new Set(denorm));
        return [ALL_COUNTIES_LABEL, ...uniq];
    }, [safeCounties]);

    /* City options narrowed by selected county + “All Cities” at the top */
    const cityOptions = useMemo(() => {
        const base = (!countyName
                ? safeCities
                : safeCities.filter((c) => {
                    const cnty = typeof c === 'string' ? null : c?.county;
                    return !cnty || cnty === countyName;
                })
        )
            .map((c) => (typeof c === 'string' ? c : c?.name || c?.label || ''))
            .filter(Boolean);
        const uniq = Array.from(new Set(base));
        return [ALL_CITIES_LABEL, ...uniq];
    }, [safeCities, countyName]);

    /* View options: hide restricted ones when unauthenticated */
    const viewOptions = useMemo(() => {
        if (isAuthenticated) return VIEW_OPTIONS;
        // Unauthenticated: keep All Posts + Trending only
        return VIEW_OPTIONS.filter((o) => o.value === 'all' || o.value === 'trending');
    }, [isAuthenticated]);

    // If unauthenticated while 'mine'/'following' is selected, reset to 'all' AND search.
    useEffect(() => {
        if (!isAuthenticated && (effectiveView === 'mine' || effectiveView === 'following')) {
            onViewChange('all');
            if (typeof onSearchClick === 'function') onSearchClick('auto');
        }
    }, [isAuthenticated, effectiveView, onViewChange, onSearchClick]);

    /* ─────────────── render ─────────────── */
    return (
        <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
            {/* Search (manual only) */}
            <SearchInput
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onSearch={() => onSearchClick?.('manual')}
                onClear={onClearClick}
            />

            <Divider sx={{ mt: 2 }} />

            {/* Filters — tightened desktop widths so County + City fit on the first row */}
            <Box
                sx={{
                    mt: 2,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    alignItems: 'center',
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
                    <FormControl size="small" fullWidth sx={{ minWidth: 130 }}>
                        <InputLabel>View</InputLabel>
                        <Select
                            label="View"
                            value={viewOptions.some((o) => o.value === effectiveView) ? effectiveView : 'all'}
                            onChange={(e) => {
                                onViewChange(e.target.value);
                                if (typeof onSearchClick === 'function') onSearchClick('auto');
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

                {/* Category (auto-search; FIX: shrink label to prevent overlap) */}
                <Box
                    sx={{
                        flexGrow: { xs: 1, sm: 0 },
                        flexShrink: { xs: 1, sm: 0 },
                        flexBasis: { xs: '100%', sm: '200px' },
                    }}
                >
                    <FormControl size="small" fullWidth sx={{ minWidth: 170 }}>
                        <InputLabel id="community-category-label" shrink>
                            Category
                        </InputLabel>
                        <Select
                            id="community-category-select"
                            labelId="community-category-label"
                            label="Category"
                            value={selectedSubtype ?? ''} // normalize undefined → ''
                            onChange={(e) => {
                                onSubtypeChange(e.target.value);
                                if (typeof onSearchClick === 'function') onSearchClick('auto');
                            }}
                            renderValue={(val) => {
                                if (!val) return 'All Categories';
                                const found = categories.find((c) => c.id === val);
                                return found ? found.label : String(val);
                            }}
                            MenuProps={sharedMenuProps}
                            displayEmpty
                        >
                            <MenuItem value="">All Categories</MenuItem>
                            {categories.map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                    {c.label}
                                </MenuItem>
                            ))}
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
                    <FormControl size="small" fullWidth sx={{ minWidth: 130 }}>
                        <InputLabel>Sort by</InputLabel>
                        <Select
                            label="Sort by"
                            value={selectedSort}
                            onChange={(e) => {
                                onSortChange(e.target.value);
                                if (typeof onSearchClick === 'function') onSearchClick('auto');
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {sortOptions.map((o) => (
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
                    <FormControl size="small" fullWidth sx={{ minWidth: 130 }}>
                        <InputLabel>Date range</InputLabel>
                        <Select
                            label="Date range"
                            value={selectedDateRange}
                            onChange={(e) => {
                                onDateRangeChange(e.target.value);
                                if (typeof onSearchClick === 'function') onSearchClick('auto');
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {dateRangeOptions.map((o) => (
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
                            freeSolo
                            options={countiesWithAll}
                            value={selectedCounty === '' ? ALL_COUNTIES_LABEL : (selectedCounty || null)}
                            onChange={(_, val) => {
                                const str = typeof val === 'string' ? val : '';
                                const isAll = str === ALL_COUNTIES_LABEL;
                                // always clear city when county changes
                                onCityChange('');
                                if (!val || isAll) {
                                    setCountyError(false);
                                    onCountyChange('');
                                } else {
                                    const valid = countiesWithAll.includes(str);
                                    setCountyError(!valid);
                                    onCountyChange(valid ? str : '');
                                }
                                if (typeof onSearchClick === 'function') onSearchClick('auto');
                            }}
                            renderInput={(p) => (
                                <TextField
                                    {...p}
                                    label="County"
                                    error={countyError}
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
                            freeSolo
                            options={cityOptions}
                            value={selectedCity === '' ? ALL_CITIES_LABEL : (selectedCity || null)}
                            onChange={(_, val) => {
                                const str = typeof val === 'string' ? val : '';
                                const isAll = str === ALL_CITIES_LABEL;
                                onCityChange(isAll ? '' : (str || ''));
                                if (typeof onSearchClick === 'function') onSearchClick('auto');
                            }}
                            renderInput={(p) => (
                                <TextField
                                    {...p}
                                    label={cityLabel}
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
