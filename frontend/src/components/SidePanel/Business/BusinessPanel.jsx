import React, { memo } from 'react';
import {
    Box, Button, Typography, Collapse, Divider,
    FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';

import SearchInput from '../../Common/SearchInput'; // same top search UI as CommunityFilter
import BusinessCard from './BusinessCard';

/* 3‑dot loader — same animation pattern used in CommunityList */
const LoadingDots = memo(function LoadingDots() {
    return (
        <Box sx={{
            display: 'flex',
            gap: 1,
            '@keyframes b': {
                '0%,80%,100%': { transform: 'scale(0)' },
                '40%': { transform: 'scale(1.0)' },
            },
        }}>
            {[0,1,2].map(i => (
                <Box key={i} sx={{
                    width: 14, height: 14, borderRadius: '50%',
                    bgcolor: 'primary.main',
                    animation: 'b 1.4s infinite ease-in-out',
                    animationDelay: `${i * 0.2}s`,
                }}/>
            ))}
        </Box>
    );
});

export default function BusinessPanel({
                                          /* data & actions */
                                          businesses = [],
                                          loading = false,
                                          hoveredId,
                                          setHoveredId,
                                          onCardClick,
                                          onLocationClick,
                                          onAddBusiness,

                                          /* search & filters (mirrors CommunityFilter layout) */
                                          searchTerm,
                                          onSearchTermChange,
                                          onSearchClick,
                                          onClearClick,

                                          filteredCities = [],
                                          filteredCounties = [],
                                          selectedCity,
                                          onCityChange,
                                          selectedCounty,
                                          onCountyChange,

                                          selectedCategory,
                                          categories = [],
                                          onCategoryChange,

                                          selectedSort,
                                          sortOptions = [],
                                          onSortChange,

                                          showFilters,
                                          onToggleFilters,
                                      }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Filters — same structure as Community: top SearchInput, then filter row */}
            <Collapse in={showFilters}>
                <Box sx={{ p: 2 }}>
                    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
                        <SearchInput
                            value={searchTerm}
                            onChange={(e) => onSearchTermChange?.(e.target.value)}
                            onSearch={onSearchClick}
                            onClear={onClearClick}
                        />
                        <Divider sx={{ mt: 2 }} />

                        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
                            {/* Category */}
                            <FormControl size="small" sx={{ minWidth: 245 }}>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    label="Category"
                                    value={selectedCategory || ''}
                                    onChange={(e) => {
                                        onCategoryChange?.(e.target.value);
                                        onSearchClick?.();
                                    }}
                                >
                                    <MenuItem value="">All Categories</MenuItem>
                                    {categories.map((c) => (
                                        <MenuItem key={c} value={c}>{c}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {/* Sort */}
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                <InputLabel>Sort by</InputLabel>
                                <Select
                                    label="Sort by"
                                    value={selectedSort || 'newest'}
                                    onChange={(e) => {
                                        onSortChange?.(e.target.value);
                                        onSearchClick?.();
                                    }}
                                >
                                    {(sortOptions.length ? sortOptions : [
                                        { value: 'newest', label: 'Newest' },
                                        { value: 'Most Popular', label: 'Most Popular' },
                                    ]).map(opt => (
                                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {/* County */}
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                                <InputLabel>County</InputLabel>
                                <Select
                                    label="County"
                                    value={selectedCounty || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        onCountyChange?.(val);
                                        if (!val) onCityChange?.('');
                                        onSearchClick?.();
                                    }}
                                >
                                    <MenuItem value="">County</MenuItem>
                                    {filteredCounties.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                </Select>
                            </FormControl>

                            {/* City */}
                            <FormControl size="small" sx={{ minWidth: 225 }}>
                                <InputLabel>City</InputLabel>
                                <Select
                                    label="City"
                                    value={selectedCity || ''}
                                    onChange={(e) => {
                                        onCityChange?.(e.target.value);
                                        onSearchClick?.();
                                    }}
                                >
                                    <MenuItem value="">City</MenuItem>
                                    {filteredCities.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Box>
                    </Box>
                </Box>
                <Divider />
            </Collapse>

            <Button
                startIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
                onClick={onToggleFilters}
                sx={{ my: 1, alignSelf: 'center' }}
            >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>

            {/* Scrollable list container with sticky grey header — same as Community */}
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    border: 1,
                    overscrollBehaviorY: 'contain',
                    borderColor: 'divider',
                    borderRadius: 2,
                    maxHeight: (theme) => ({
                        xs: `calc(100vh - ${showFilters ? 383 : 200}px)`,
                        md: `calc(100vh - ${showFilters ? 383 : 200}px)`,
                    }),
                }}
            >
                {/* sticky sub‑header */}
                <Box
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        px: 2,
                        py: 1,
                        bgcolor: 'grey.100',
                        borderBottom: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="h6">Businesses</Typography>
                    <Button variant="contained" color="success" onClick={onAddBusiness}>
                        Add Business
                    </Button>
                </Box>

                {/* list + loader + empty-state */}
                <Box sx={{ p: 2, position: 'relative', minHeight: 240 }}>
                    {businesses.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                            {businesses.map((b) => (
                                <Box
                                    key={b.id}
                                    sx={{
                                        flex: {
                                            xs: '0 0 100%',
                                            sm: '0 0 calc(50% - 16px)',
                                            lg: '0 0 calc(33.333% - 16px)',
                                        },
                                        m: 1,
                                    }}
                                >
                                    <BusinessCard
                                        biz={b}
                                        hoveredId={hoveredId}
                                        setHoveredId={setHoveredId}
                                        onLocationClick={() =>
                                            onLocationClick?.(
                                                b.latitude,
                                                b.longitude,
                                                b.street_address ? 'address' : 'city'
                                            )
                                        }
                                        onCardClick={() => onCardClick?.(b)}
                                    />
                                </Box>
                            ))}
                        </Box>
                    )}

                    {/* centered loader overlay */}
                    {loading && (
                        <Box
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: businesses.length ? 'transparent' : 'background.paper',
                                pointerEvents: 'none',
                            }}
                        >
                            <LoadingDots />
                        </Box>
                    )}

                    {/* empty-state after loading */}
                    {!loading && businesses.length === 0 && (
                        <Box
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Typography variant="h6" color="text.secondary">
                                No Business Found
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
