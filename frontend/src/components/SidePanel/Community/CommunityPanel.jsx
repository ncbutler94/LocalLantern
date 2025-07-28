// src/components/SidePanel/Community/CommunityPanel.jsx
// -----------------------------------------------------------------------------
// Layout tweaks: removed top margin, tightened maxHeight so the page
// itself no longer scrolls when the list is long.
// -----------------------------------------------------------------------------

import React, { useState, useEffect } from 'react';
import {
    Box,
    Divider,
    Button,
    Typography,
    Collapse,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';

import CommunityFilter from './CommunityFilter';
import CommunityList   from './CommunityList';
import { useAuthModal } from '../../../contexts/AuthModalContext';

export default function CommunityPanel(props) {
    const {
        user,
        posts,
        hoveredId,
        setHoveredId,
        onLocationClick,
        onCardClick,
        onNewPost,
        showFilters,
        onToggleFilters,
        /* …all other props passthrough… */
    } = props;

    const { open: openAuth } = useAuthModal();
    const [pendingNew, setPendingNew] = useState(false);

    /* deferred “New Post” after login */
    useEffect(() => {
        if (pendingNew && user) {
            setPendingNew(false);
            sessionStorage.removeItem('pendingNewPost');
            onNewPost();
        }
    }, [pendingNew, user, onNewPost]);

    const handleNewPostClick = () => {
        if (user) {
            onNewPost();
        } else {
            sessionStorage.setItem('pendingNewPost', 'true');
            setPendingNew(true);
            openAuth();
        }
    };

    return (
        <Box
            sx={{
                /* removed mt so panel aligns with filter/search block */
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
            }}
        >
            {/* ── Filters ─────────────────────────────────────────────── */}
            <Collapse in={showFilters}>
                <Box sx={{ p: 2 }}>
                    <CommunityFilter {...props} />
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

            {/* ── Scrollable list ─────────────────────────────────────── */}
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    border: 1,
                    overscrollBehaviorY: 'contain',
                    borderColor: 'divider',
                    borderRadius: 2,
                    /* keep inside viewport regardless of map offset */
                         /* shrink a bit more when the filter block is hidden */
                         maxHeight: (theme) => ({
                             xs: `calc(100vh - ${showFilters ? 383 : 200}px)`,
                             md: `calc(100vh - ${showFilters ? 383 : 200}px)`,
                         }),
                }}
            >
                {/* Sticky sub-header */}
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
                    <Typography variant="h6">Community Posts</Typography>
                    <Button variant="contained" color="success" onClick={handleNewPostClick}>
                        New Post
                    </Button>
                </Box>

                <Box sx={{ p: 2 }}>
                    <CommunityList
                        user={user}
                        posts={posts}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={onCardClick}
                    />
                </Box>
            </Box>
        </Box>
    );
}
