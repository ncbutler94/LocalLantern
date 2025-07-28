// src/components/SidePanel/Community/CommunityFilter.jsx
// -----------------------------------------------------------------------------
// Completely refreshed file – adds a useEffect that clears `countyError` whenever
// the parent resets `selectedCounty` (e.g. when the CLEAR button is clicked).
// -----------------------------------------------------------------------------

import React, { useMemo, useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Divider,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import SearchInput from '../../Common/SearchInput';

/* ───────── fallback categories (unchanged) */
const DEFAULT_CATEGORIES = [
    { id: 'lost-and-found',       label: 'Lost & Found' },
    { id: 'public-safety-alerts', label: 'Public Safety Alerts' },
    { id: 'recommendations-tips', label: 'Recommendations & Tips' },
    { id: 'announcement',        label: 'Announcements' },
    { id: 'volunteer-requests',   label: 'Volunteer & Help Requests' },
    { id: 'general-discussion',   label: 'General Discussion' }
];

const VIEW_OPTIONS = [
    { value: 'all',       label: 'All Posts' },
    { value: 'mine',      label: 'My Posts' },
    { value: 'following', label: 'Following' }
];

export default function CommunityFilter({
                                            /* search */
                                            view,
                                            onViewChange,
                                            searchTerm,
                                            onSearchTermChange,
                                            onSearchClick,
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
                                            onDateRangeChange
                                        }) {
    const categories      = subtypes.length ? subtypes : DEFAULT_CATEGORIES;
    const sharedMenuProps = { disablePortal: true };

    /* ───── helpers & local state ───── */
    const getCountyName = c => (typeof c === 'string' ? c : c?.label || '');
    const countyName  = getCountyName(selectedCounty);
    const countyKey   = countyName || 'all';
    const cityLabel   = countyName ? `City (${countyName})` : 'City';

    const [countyError, setCountyError] = useState(false);

    // 🔄 When the parent clears the filter (selectedCounty becomes ""),
    //    remove the red error state so the input resets visually.
    useEffect(() => {
        if (!selectedCounty) setCountyError(false);
    }, [selectedCounty]);

    /* ───── max-lengths for inputs ───── */
    const maxCountyChars = useMemo(
        () =>
            Math.max(
                ...filteredCounties.map(c =>
                    (typeof c === 'string' ? c : c?.label || '').length
                ),
                24                    // sensible fallback
            ),
        [filteredCounties]
    );

    const maxCityChars = useMemo(
        () =>
            Math.max(
                ...filteredCities.map(c =>
                    (typeof c === 'string' ? c : c?.name || c?.label || '').length
                ),
                36                    // fallback
            ),
        [filteredCities]
    );

    /* narrow city list to current county */
    const cityOptions = useMemo(() => {
        if (!countyName) return filteredCities;
        return filteredCities.filter(c => {
            const county = typeof c === 'string' ? null : c?.county;
            return !county || county === countyName;
        });
    }, [filteredCities, countyName]);

    /* ─────────────── render ─────────────── */
    return (
        <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
            {/* Search */}
            <SearchInput
                value={searchTerm}
                onChange={e => onSearchTermChange(e.target.value)}
                onSearch={onSearchClick}
                onClear={onClearClick}
            />

            <Divider sx={{ mt: 2 }} />

            {/* Filters */}
            <Grid container spacing={2} alignItems="center" sx={{ mt: 2 }}>
                {/* View */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 120 }}>
                        <InputLabel>View</InputLabel>
                        <Select
                            label="View"
                            value={view}
                            onChange={e => {
                                onViewChange(e.target.value);
                                onSearchClick();
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {VIEW_OPTIONS.map(o => (
                                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                {/* Category */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 245 }}>
                        <InputLabel>Category</InputLabel>
                        <Select
                            label="Category"
                            value={selectedSubtype}
                            onChange={e => {
                                onSubtypeChange(e.target.value);
                                onSearchClick();
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            <MenuItem value="">All Categories</MenuItem>
                            {categories.map(c => (
                                <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                {/* Sort */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 140 }}>
                        <InputLabel>Sort by</InputLabel>
                        <Select
                            label="Sort by"
                            value={selectedSort}
                            onChange={e => {
                                onSortChange(e.target.value);
                                onSearchClick();
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {sortOptions.map(o => (
                                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                {/* Date range */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 130 }}>
                        <InputLabel>Date range</InputLabel>
                        <Select
                            label="Date range"
                            value={selectedDateRange}
                            onChange={e => {
                                onDateRangeChange(e.target.value);
                                onSearchClick();
                            }}
                            MenuProps={sharedMenuProps}
                        >
                            {dateRangeOptions.map(o => (
                                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                {/* County */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <Autocomplete
                        key={`${countyKey}-county`}
                        size="small"
                        freeSolo
                        options={filteredCounties}
                        value={selectedCounty || null}
                        onChange={(_, val) => {
                            const valid = val ? filteredCounties.includes(val) : false;

                            /* always clear city when county changes */
                            onCityChange('');

                            setCountyError(!valid && !!val);
                            onCountyChange(valid ? val : '');
                            onSearchClick();
                        }}
                        renderInput={p => (
                            <TextField
                                {...p}
                                label="County"
                                error={countyError}
                                inputProps={{
                                    ...p.inputProps,
                                    maxLength: maxCountyChars
                                }}
                            />
                        )}
                        sx={{ minWidth: 180 }}
                        clearOnEscape
                        autoHighlight
                        filterSelectedOptions
                    />
                </Grid>

                {/* City */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <Autocomplete
                        key={`${countyKey}-city`}
                        size="small"
                        freeSolo
                        options={cityOptions}
                        value={selectedCity || null}
                        onChange={(_, val) => {
                            onCityChange(val || '');
                            onSearchClick();
                        }}
                        renderInput={p => (
                            <TextField
                                {...p}
                                label={cityLabel}
                                inputProps={{
                                    ...p.inputProps,
                                    maxLength: maxCityChars
                                }}
                            />
                        )}
                        sx={{ minWidth: 225 }}
                        clearOnEscape
                        autoHighlight
                        filterSelectedOptions
                    />
                </Grid>
            </Grid>
        </Box>
    );
}
