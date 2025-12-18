// src/pages/community/CommunityPanel.jsx
// Fixed header row + separate scroll area for the cards (CommunityList).
// UPDATED:
//  • Adds "Show Filters" / "Hide Filters" toggle in the header row so it's always accessible.
//  • Accepts `selectable` prop to control whether left-list cards show selection styling.
//  • Filters Collapse uses unmountOnExit so hidden filters don't affect layout.
//  • Root panel uses height: 100% to avoid phantom vertical space.
//  • Passes `view` into CommunityList so trending empty state message can show.

import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Button,
    Typography,
    Collapse,
    CircularProgress,
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
    const [displayStats, setDisplayStats] = useState({ displaying: 0, total: 0, loadingMore: false });

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
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Filters --------------------------------------------------- */}
            <Collapse in={showFilters} unmountOnExit>
                <Box sx={{ p: 2 }}>
                    <CommunityFilter
                        view={selectedView}
                        selectedView={selectedView}
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
                {/* Header row */}
                <Box
                    sx={{
                        px: 2,
                        py: 1.25,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        position: 'sticky',
                        top: 0,
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
                            justifyContent: { xs: 'space-between', md: 'flex-end' },
                        }}
                    >
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={handleToggleFiltersClick}
                            startIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
                            sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: 999,
                                px: 1.5,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </Button>

                        <Button
                            size="small"
                            variant="contained"
                            onClick={handleNewPostClick}
                            sx={{
                                textTransform: 'none',
                                fontWeight: 800,
                                borderRadius: 999,
                                px: 2,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            New Post
                        </Button>
                    </Box>
                </Box>

                {/* cards area (scroll) + fixed footer */}
                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: 'hidden',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <Box
                        ref={listScrollRef}
                        data-community-scroll
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: 'auto',
                            position: 'relative',
                            pt: 1,
                            pb: 1,
                        }}
                    >
                        <CommunityList
                            user={user}
                            posts={posts}
                            hoveredId={hoveredId}
                            setHoveredId={setHoveredId}
                            onLocationClick={onLocationClick}
                            onCardClick={onCardClick || defaultNavigateOnClick}
                            selectedId={selectedPostId}
                            selectable={selectable}
                            view={selectedView} // ✅ NEW: enables trending empty-state message

                            totalCount={Array.isArray(posts) ? posts.length : 0}
                            onDisplayStatsChange={(stats) => {
                                if (!stats || typeof stats !== 'object') return;
                                setDisplayStats({
                                    displaying: Number.isFinite(Number(stats.displaying)) ? Number(stats.displaying) : 0,
                                    total: Number.isFinite(Number(stats.total)) ? Number(stats.total) : (Array.isArray(posts) ? posts.length : 0),
                                    loadingMore: Boolean(stats.loadingMore),
                                });
                            }}
                        />
                    </Box>

                    <Box
                        sx={{
                            flexShrink: 0,
                            borderTop: '1px solid rgba(0,0,0,0.08)',
                            px: { xs: 1.25, md: 1.5 },
                            py: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#fff',
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: { xs: '0.82rem', md: '0.9rem' },
                                color: 'rgba(0,0,0,0.72)',
                                fontWeight: 600,
                            }}
                        >
                            {
                                (() => {
                                    const displaying = Number.isFinite(Number(displayStats?.displaying))
                                        ? Number(displayStats.displaying)
                                        : 0;
                                    const total = Number.isFinite(Number(displayStats?.total)) ? Number(displayStats.total) : 0;
                                    const safeTotal = total || displaying;
                                    const d = Math.min(displaying, safeTotal).toLocaleString();
                                    const t = safeTotal.toLocaleString();
                                    return `Displaying ${d} out of ${t} posts`;
                                })()
                            }
                        </Typography>

                        {displayStats?.loadingMore ? <CircularProgress size={16} /> : null}
                    </Box>
                </Box>
            </Box>
        </Box>
);
}
