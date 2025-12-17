// src/pages/community/CommunityPanel.jsx
// Fixed header row + separate scroll area for the cards (CommunityList).
// UPDATED:
//  • Adds "Show Filters" / "Hide Filters" toggle in the header row so it's always accessible.
//  • Accepts `selectable` prop to control whether left-list cards show selection styling.

import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Button,
    Typography,
    Collapse,
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import CommunityFilter from './CommunityFilter';
import CommunityList from './CommunityList';
import { useAuth } from '../../components/AuthModalContext';

// Community marker icon (next to the "Community Posts" label)
import communityMarkerPng from '../../assets/mapMarkers/community/community-marker.png';

export default function CommunityPanel(props) {
    const {
        // core props
        user,
        posts,
        hoveredId,
        setHoveredId,
        onLocationClick,
        onNewPost,
        showFilters,
        onToggleFilters,
        onCardClick,
        selectedPostId = null,
        selectable = true,

        // filter props (pass-through)
        selectedView,
        onViewChange,
        searchTerm,
        onSearchTermChange,
        onSearchClick,
        onClearClick,
        filteredCities,
        filteredCounties,
        selectedCity,
        onCityChange,
        selectedCounty,
        onCountyChange,
        selectedSubtype,
        subtypes,
        onSubtypeChange,
        selectedSort,
        sortOptions,
        onSortChange,
        selectedDateRange,
        dateRangeOptions,
        onDateRangeChange,
    } = props;

    const navigate = useNavigate();
    const listScrollRef = useRef(null);

    useEffect(() => {
        const saved = Number(sessionStorage.getItem('ll:community:scrollTop') || 0);
        if (saved > 0 && listScrollRef.current) {
            const t = setTimeout(() => {
                if (listScrollRef.current) listScrollRef.current.scrollTop = saved;
            }, 60);
            return () => clearTimeout(t);
        }
        return undefined;
    }, []);

    const defaultNavigateOnClick = (post) => {
        if (!post || !post.id) return;
        try {
            const listEl = listScrollRef.current || document.querySelector('[data-community-scroll]');
            const top = listEl?.scrollTop || 0;
            sessionStorage.setItem('ll:community:scrollTop', String(top));
            sessionStorage.setItem('ll:community:url', window.location.pathname + window.location.search);
        } catch {}
        navigate(`/posts/${post.id}`, { state: { post, from: 'community' } });
    };

    const { open: openAuth } = useAuth();
    const [pendingNew, setPendingNew] = useState(false);

    useEffect(() => {
        if (pendingNew && user) {
            setPendingNew(false);
            sessionStorage.removeItem('pendingNewPost');
            onNewPost();
        }
    }, [pendingNew, user, onNewPost]);

    const handleNewPostClick = () => {
        if (user) onNewPost();
        else {
            sessionStorage.setItem('pendingNewPost', 'true');
            setPendingNew(true);
            openAuth();
        }
    };

    const handleToggleFiltersClick = () => {
        if (typeof onToggleFilters === 'function') onToggleFilters();
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '97%', overflow: 'hidden' }}>
            {/* Filters --------------------------------------------------- */}
            <Collapse in={showFilters}>
                <Box sx={{ p: 2 }}>
                    <CommunityFilter
                        view={selectedView}
                        onViewChange={onViewChange}
                        searchTerm={searchTerm}
                        onSearchTermChange={onSearchTermChange}
                        onSearchClick={onSearchClick}
                        onClearClick={onClearClick}
                        filteredCities={filteredCities}
                        filteredCounties={filteredCounties}
                        selectedCity={selectedCity}
                        onCityChange={onCityChange}
                        selectedCounty={selectedCounty}
                        onCountyChange={onCountyChange}
                        selectedSubtype={selectedSubtype}
                        subtypes={subtypes}
                        onSubtypeChange={onSubtypeChange}
                        selectedSort={selectedSort}
                        sortOptions={sortOptions}
                        onSortChange={onSortChange}
                        selectedDateRange={selectedDateRange}
                        dateRangeOptions={dateRangeOptions}
                        onDateRangeChange={onDateRangeChange}
                    />
                </Box>
            </Collapse>

            {/* List container with its own header + scroll area -------- */}
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    boxShadow: '0 6px 16px rgba(2,6,23,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* fixed header row */}
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        position: 'relative',
                        zIndex: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        flexWrap: 'wrap',
                        boxShadow: '0 2px 8px rgba(2,6,23,0.06)',
                    }}
                >
                    {/* Left: marker + title */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, order: 1 }}>
                        <Box
                            component="img"
                            src={communityMarkerPng}
                            alt="Community marker"
                            sx={{ width: 26, height: 26, display: 'block' }}
                        />
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Community Posts
                        </Typography>
                    </Box>

                    {/* Middle/right: filter toggle (always visible) */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            order: { xs: 3, md: 2 },
                            width: { xs: '100%', md: 'auto' },
                            justifyContent: { xs: 'flex-start', md: 'center' },
                        }}
                    >
                        <Button
                            variant="outlined"
                            onClick={handleToggleFiltersClick}
                            startIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
                            sx={{
                                borderRadius: 999,
                                px: 1.75,
                                fontWeight: 800,
                                textTransform: 'none',
                                whiteSpace: 'nowrap',
                            }}
                            aria-label={showFilters ? 'Hide filters' : 'Show filters'}
                        >
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </Button>
                    </Box>

                    {/* Right: new post */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, order: { xs: 2, md: 3 } }}>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={handleNewPostClick}
                            sx={{ borderRadius: 999, px: 2, fontWeight: 700 }}
                        >
                            New Post
                        </Button>
                    </Box>
                </Box>

                {/* scrollable cards area */}
                <Box
                    ref={listScrollRef}
                    data-community-scroll
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        position: 'relative',
                        pt: 1,
                    }}
                >
                    <Box sx={{ p: 2 }}>
                        <CommunityList
                            user={user}
                            posts={posts}
                            hoveredId={hoveredId}
                            setHoveredId={setHoveredId}
                            onLocationClick={onLocationClick}
                            onCardClick={onCardClick || defaultNavigateOnClick}
                            selectedId={selectedPostId}
                            selectable={selectable}
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
