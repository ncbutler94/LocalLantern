// src/pages/community/CommunityPanel.jsx
//
// Left-side Community panel containing:
//  - Filter controls (CommunityFilter) in a collapsible section
//  - Post list (CommunityList) inside its own scroll container
//  - Fixed bottom status bar showing “Displaying X out of Y posts”
//
// UPDATE 2025-12-19:
//  - Scroll list back to TOP whenever filters/search execute (driven by scrollResetKey).
//  - Skips first mount so “return to where I left off” doesn’t get overridden.
//
// UPDATE 2025-12-23:
//  - Professional skeleton loading UI whenever the post list is about to change due to
//    a search/filter action (driven by scrollResetKey). This prevents the "dead air"
//    delay and keeps the grid looking responsive.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Button,
    Collapse,
    CircularProgress,
    Divider,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import postsIcon from '../../assets/posts_icon.png';

import CommunityFilter from './CommunityFilter';
import CommunityList from './CommunityList';

const MIN_REFRESH_MS = 350;

const nowMs = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
};

export default function CommunityPanel(props) {
    const {
        // auth/user
        user = null,

        // refetch callback after post mutations
        onMutate = null,

        // list
        posts = [],
        hoveredId = null,
        setHoveredId = () => {},
        selectedPostId = null,
        selectable = true,
        isLoading = false,
        isLoadingMore = false,

        // navigation/callbacks
        onLocationClick = null,
        onCardClick = null,
        onNewPost = null,

        // paging + totals
        totalCount = null,
        hasMoreExternal = null,
        onLoadMore = null,

        // filters
        selectedView = 'all',
        onViewChange = () => {},

        searchTerm = '',
        onSearchTermChange = () => {},
        onSearchClick = () => {},
        onClearClick = () => {},

        filteredCities = [],
        filteredCounties = [],
        selectedCity = '',
        onCityChange = () => {},
        selectedCounty = '',
        onCountyChange = () => {},

        selectedSubtype = '',
        subtypes = [],
        onSubtypeChange = () => {},

        selectedSort = 'newest',
        sortOptions = [],
        onSortChange = () => {},

        selectedDateRange = 'all',
        dateRangeOptions = [],
        onDateRangeChange = () => {},

        // NEW: triggers scroll-to-top in the list box when it changes
        scrollResetKey = '',
    } = props || {};

    const navigate = useNavigate();

    const [filtersOpen, setFiltersOpen] = useState(true);

    const scrollBoxRef = useRef(null);

    // Skip first mount so returning from PostPage can restore scroll position.
    const didInitScrollRef = useRef(false);

    // Skeleton "refresh" state (professional loading UI on filter/search changes).
    const didInitRefreshRef = useRef(false);
    const refreshStartRef = useRef(0);
    const refreshStopTimerRef = useRef(null);
    const [listRefreshing, setListRefreshing] = useState(false);

    useEffect(() => {
        return () => {
            if (refreshStopTimerRef.current) {
                clearTimeout(refreshStopTimerRef.current);
                refreshStopTimerRef.current = null;
            }
        };
    }, []);

    // ✅ Scroll the posts list back to top whenever searches/filters execute
    // ✅ Also show skeleton cards while the new list is loading/replacing
    useEffect(() => {
        if (!didInitScrollRef.current) {
            didInitScrollRef.current = true;
        } else {
            const el = scrollBoxRef.current;
            if (el) el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }

        // Refresh shimmer: skip first mount to avoid flashing on initial render/restore
        if (!didInitRefreshRef.current) {
            didInitRefreshRef.current = true;
            return;
        }

        // Start skeleton refresh for a professional "transition" feel
        refreshStartRef.current = nowMs();
        setListRefreshing(true);

        if (refreshStopTimerRef.current) {
            clearTimeout(refreshStopTimerRef.current);
            refreshStopTimerRef.current = null;
        }
    }, [scrollResetKey]);

    // Stop skeleton refresh after loading finishes (and keep it visible for a minimum duration).
    useEffect(() => {
        if (!listRefreshing) return;
        if (isLoading) return;

        const elapsed = nowMs() - (refreshStartRef.current || 0);
        const remaining = Math.max(0, MIN_REFRESH_MS - elapsed);

        if (refreshStopTimerRef.current) {
            clearTimeout(refreshStopTimerRef.current);
            refreshStopTimerRef.current = null;
        }

        refreshStopTimerRef.current = setTimeout(() => {
            setListRefreshing(false);
            refreshStopTimerRef.current = null;
        }, remaining);
    }, [listRefreshing, isLoading, posts]);

    // Footer stats come from CommunityList (how many are currently rendered).
    // We keep both keys for backward compatibility.
    const [displayStats, setDisplayStats] = useState(() => ({
        displayed: 0,
        displaying: 0,
        total: Number.isFinite(Number(totalCount)) ? Number(totalCount) : null,
    }));

    // If the backend total changes, sync it into footer state.
    useEffect(() => {
        if (Number.isFinite(Number(totalCount))) {
            setDisplayStats((prev) => ({ ...prev, total: Number(totalCount) }));
        }
    }, [totalCount]);

    const handleDisplayStatsChange = useCallback((next) => {
        const displayed = Number(next?.displayed ?? next?.displaying ?? 0);
        const total = next?.total != null ? Number(next.total) : null;

        setDisplayStats({
            displayed,
            displaying: displayed,
            total: Number.isFinite(total) ? total : displayStats.total,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayStats.total]);

    const effectiveTotal = useMemo(() => {
        if (Number.isFinite(Number(totalCount))) return Number(totalCount);
        if (Number.isFinite(Number(displayStats.total))) return Number(displayStats.total);
        return null;
    }, [displayStats.total, totalCount]);

    const effectiveDisplayed = useMemo(() => {
        const n = Number(displayStats.displayed ?? displayStats.displaying ?? 0);
        if (Number.isFinite(n) && n > 0) return n;

        // If list is showing posts but hasn't reported yet, assume up to first page size.
        const count = Array.isArray(posts) ? posts.length : 0;
        return Math.min(count, 50);
    }, [displayStats.displayed, displayStats.displaying, posts]);

    const footerMode = useMemo(() => {
        const total = Number.isFinite(Number(effectiveTotal)) ? Number(effectiveTotal) : null;
        const shown = Number.isFinite(Number(effectiveDisplayed)) ? Number(effectiveDisplayed) : 0;

        if (isLoading) return 'loading';
        if (total === null) return shown > 0 ? 'counts' : 'loading';
        if (total === 0) return 'counts';
        return 'counts';
    }, [effectiveDisplayed, effectiveTotal, isLoading]);

    const footerText = useMemo(() => {
        if (footerMode === 'loading') return 'Loading...';
        const shown = Number.isFinite(Number(effectiveDisplayed)) ? Number(effectiveDisplayed) : 0;
        let total = Number.isFinite(Number(effectiveTotal)) ? Number(effectiveTotal) : 0;

        if (total === 0 && shown > 0) total = shown;

        const clamped = total > 0 ? Math.min(shown, total) : 0;
        return `Displaying ${clamped.toLocaleString()} out of ${total.toLocaleString()} posts`;
    }, [effectiveDisplayed, effectiveTotal, footerMode]);

    const handleCardClick = useCallback((post) => {
        if (!post) return;
        if (typeof onCardClick === 'function') {
            onCardClick(post);
            return;
        }
        if (post.id != null) {
            navigate(`/community/posts/${encodeURIComponent(String(post.id))}`, {
                state: { from: 'community' },
            });
        }
    }, [navigate, onCardClick]);

    return (
        <Box
            sx={{
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 3,
                border: '1px solid',
                borderColor: (t) => alpha(t.palette.primary.main, 0.12),
                bgcolor: (t) => alpha(t.palette.common.white, 0.62),
                backdropFilter: 'saturate(140%) blur(10px)',
                backgroundImage: 'none',
                boxShadow: (t) => `0 14px 44px ${alpha(t.palette.common.black, 0.08)}`,
            }}
        >
            {/* Filters section */}
            <Box sx={{ flexShrink: 0, p: { xs: 1, md: 1.5 }, pb: 0 }}>
                <Collapse in={filtersOpen} timeout={200} unmountOnExit>
                    <CommunityFilter
                        // view
                        selectedView={selectedView}
                        view={selectedView}
                        onViewChange={onViewChange}
                        // search
                        searchTerm={searchTerm}
                        onSearchTermChange={onSearchTermChange}
                        onSearchClick={onSearchClick}
                        onClearClick={onClearClick}
                        // location
                        filteredCities={filteredCities}
                        filteredCounties={filteredCounties}
                        selectedCity={selectedCity}
                        onCityChange={onCityChange}
                        selectedCounty={selectedCounty}
                        onCountyChange={onCountyChange}
                        // subtype
                        selectedSubtype={selectedSubtype}
                        subtypes={subtypes}
                        onSubtypeChange={onSubtypeChange}
                        // sort
                        selectedSort={selectedSort}
                        sortOptions={sortOptions}
                        onSortChange={onSortChange}
                        // date
                        selectedDateRange={selectedDateRange}
                        dateRangeOptions={dateRangeOptions}
                        onDateRangeChange={onDateRangeChange}
                    />
                </Collapse>
            </Box>

            {/* Header row */}
            <Box
                sx={{
                    flexShrink: 0,
                    px: { xs: 1, md: 1.5 },
                    pt: 1.25,
                    pb: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        minWidth: 0,
                    }}
                >
                    <Box
                        component="img"
                        src={postsIcon}
                        alt=""
                        draggable={false}
                        sx={{
                            width: 45,
                            height: 45,
                            flexShrink: 0,
                            display: 'block',
                            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.10))',
                            opacity: 0.95,
                        }}
                    />
                    <Typography
                        sx={{
                            fontSize: { xs: '1rem', md: '1.05rem' },
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        Community Posts
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Button
                        onClick={() => setFiltersOpen((v) => !v)}
                        variant="outlined"
                        size="small"
                        startIcon={filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={(t) => ({
                            borderRadius: 999,
                            textTransform: 'none',
                            fontWeight: 800,
                            px: 1.25,
                            height: 34,
                            whiteSpace: 'nowrap',
                            borderColor: alpha(t.palette.primary.main, 0.22),
                            color: t.palette.primary.main,
                            backgroundColor: alpha(t.palette.primary.main, 0.02),
                            '&:hover': {
                                backgroundColor: alpha(t.palette.primary.main, 0.06),
                                borderColor: alpha(t.palette.primary.main, 0.35),
                            },
                        })}
                    >
                        {filtersOpen ? 'Hide Filters' : 'Show Filters'}
                    </Button>

                    <Button
                        onClick={typeof onNewPost === 'function' ? onNewPost : undefined}
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        sx={(t) => ({
                            borderRadius: 999,
                            textTransform: 'none',
                            fontWeight: 900,
                            px: 1.25,
                            height: 34,
                            whiteSpace: 'nowrap',
                            boxShadow: `0 10px 18px ${alpha(t.palette.primary.main, 0.18)}`,
                            '&:hover': {
                                boxShadow: `0 14px 26px ${alpha(t.palette.primary.main, 0.22)}`,
                            },
                        })}
                    >
                        New Post
                    </Button>
                </Box>
            </Box>

            <Divider sx={{ borderColor: 'divider' }} />

            {/* List area (scrolls) */}
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                }}
            >
                <Box
                    ref={scrollBoxRef}
                    data-community-scroll
                    sx={{
                        height: '100%',
                        overflowY: 'auto',
                        px: { xs: 0.75, md: 1.25 },
                        py: 1,
                    }}
                >
                    <CommunityList
                        isRefreshing={listRefreshing}
                        user={user}
                        posts={posts}
                        loading={isLoading}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={handleCardClick}
                        query={searchTerm}
                        view={selectedView}
                        selectedId={selectedPostId}
                        selectable={selectable}
                        totalCount={totalCount}
                        hasMoreExternal={hasMoreExternal}
                        onLoadMore={onLoadMore}
                        onDisplayStatsChange={handleDisplayStatsChange}
                        onMutate={onMutate}
                        isLoadingMore={isLoadingMore}
                    />
                </Box>
            </Box>

            {/* Fixed bottom status bar */}
            <Box
                sx={{
                    flexShrink: 0,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    px: { xs: 1.25, md: 1.5 },
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: (t) => alpha(t.palette.common.white, 0.66),
                    backgroundImage: 'none',
                    backdropFilter: 'saturate(140%) blur(10px)',
                }}
            >
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center',
                        gap: 1,
                        minHeight: 22,
                        width: '100%',
                    }}
                >
                    <Box />
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            minHeight: 22,
                        }}
                    >
                        {footerMode === 'loading' ? <CircularProgress size={16} /> : null}
                        <Typography
                            sx={{
                                fontSize: { xs: '0.82rem', md: '0.9rem' },
                                color: 'text.secondary',
                                letterSpacing: '-0.01em',
                                fontWeight: 700,
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {footerText}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {(isLoadingMore && footerMode !== 'loading') ? <CircularProgress size={16} /> : null}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
