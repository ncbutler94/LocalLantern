// src/components/SidePanel/Events/EventsFilter.jsx
// -----------------------------------------------------------------------------
// Filter row styled like CommunityFilter, but with event‑centric choices.
// Uses your shared SearchInput component. County/City widened.
// -----------------------------------------------------------------------------

import React, { useMemo } from 'react';
import {
    Box, Grid, Divider, TextField, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import SearchInput from '../../components/SearchInput';

const CATEGORIES = [
    { id: '', label: 'All Categories' },
    { id: 'Festival', label: 'Festival' },
    { id: 'Concert', label: 'Concert' },
    { id: 'Church', label: 'Church' },
    { id: 'Market', label: 'Market' },
    { id: 'Parade', label: 'Parade' },
    { id: 'Volunteer', label: 'Volunteer' },
    { id: 'Sports', label: 'Sports' },
    { id: 'Class/Workshop', label: 'Class/Workshop' },
    { id: 'Government/School', label: 'Government/School' },
    { id: 'Other', label: 'Other' },
];

const SORTS = [
    { value: 'newest',  label: 'Newest' },
    { value: 'popular', label: 'Most Popular' },
];

const DATES = [
    { value: 'all',       label: 'All time' },
    { value: 'today',     label: 'Today' },
    { value: 'tonight',   label: 'Tonight' },
    { value: 'weekend',   label: 'This Weekend' },
    { value: 'next7',     label: 'Next 7 Days' },
    { value: 'month',     label: 'This Month' },
    { value: 'thisyear',  label: 'This Year' },
    { value: 'afteryear', label: 'After This Year' },
];

export default function EventsFilter({
                                         /* search */
                                         searchTerm, onSearchTermChange, onSearchClick, onClearClick,
                                         /* city / county */
                                         filteredCities, filteredCounties, selectedCity, onCityChange, selectedCounty, onCountyChange,
                                         /* category */
                                         selectedCategory, onCategoryChange,
                                         /* sort */
                                         selectedSort, onSortChange,
                                         /* date range */
                                         selectedDateRange, onDateRangeChange
                                     }) {
    const countyKey = selectedCounty || 'all';

    const maxCountyChars = useMemo(
        () => Math.max(...filteredCounties.map(c => (typeof c === 'string' ? c : c?.label || '').length), 24),
        [filteredCounties]
    );
    const maxCityChars = useMemo(
        () => Math.max(...filteredCities.map(c => (typeof c === 'string' ? c : c?.name || c?.label || '').length), 36),
        [filteredCities]
    );

    return (
        <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
            {/* Search */}
            <SearchInput
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onSearch={onSearchClick}
                onClear={onClearClick}
            />

            <Divider sx={{ mt: 2 }} />

            {/* Filters */}
            <Grid container spacing={2} alignItems="center" sx={{ mt: 2 }}>
                {/* Category */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 220 }}>
                        <InputLabel>Category</InputLabel>
                        <Select
                            label="Category"
                            value={selectedCategory}
                            onChange={(e) => { onCategoryChange(e.target.value); onSearchClick(); }}
                            MenuProps={{ disablePortal: true }}
                        >
                            {CATEGORIES.map(c => <MenuItem key={c.id || 'all'} value={c.id}>{c.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                {/* Sort */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 160 }}>
                        <InputLabel>Sort by</InputLabel>
                        <Select
                            label="Sort by"
                            value={selectedSort}
                            onChange={(e) => { onSortChange(e.target.value); onSearchClick(); }}
                            MenuProps={{ disablePortal: true }}
                        >
                            {SORTS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                {/* Date range */}
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 160 }}>
                        <InputLabel>Date range</InputLabel>
                        <Select
                            label="Date range"
                            value={selectedDateRange}
                            onChange={(e) => { onDateRangeChange(e.target.value); onSearchClick(); }}
                            MenuProps={{ disablePortal: true }}
                        >
                            {DATES.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                {/* County — wider */}
                <Grid item xs={12} sm={6} md={4} lg={3}>
                    <Autocomplete
                        key={`${countyKey}-county`}
                        size="small"
                        freeSolo
                        fullWidth
                        options={filteredCounties}
                        value={selectedCounty || null}
                        onChange={(_, val) => { onCountyChange(val || ''); onSearchClick(); }}
                        renderInput={(p) => (
                            <TextField
                                {...p}
                                label="County"
                                inputProps={{ ...p.inputProps, maxLength: maxCountyChars }}
                            />
                        )}
                        sx={{ minWidth: 280 }}
                        clearOnEscape
                        autoHighlight
                        filterSelectedOptions
                    />
                </Grid>

                {/* City — wider */}
                <Grid item xs={12} sm={6} md={4} lg={3}>
                    <Autocomplete
                        key={`${countyKey}-city`}
                        size="small"
                        freeSolo
                        fullWidth
                        options={filteredCities}
                        value={selectedCity || null}
                        onChange={(_, val) => { onCityChange(val || ''); onSearchClick(); }}
                        renderInput={(p) => (
                            <TextField
                                {...p}
                                label={selectedCounty ? `City (${selectedCounty})` : 'City'}
                                inputProps={{ ...p.inputProps, maxLength: maxCityChars }}
                            />
                        )}
                        sx={{ minWidth: 320 }}
                        clearOnEscape
                        autoHighlight
                        filterSelectedOptions
                    />
                </Grid>
            </Grid>
        </Box>
    );
}
