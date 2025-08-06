// src/components/SidePanel/Community/CommunityPanel.jsx
// -----------------------------------------------------------------------------
// FIX: pass the logged‑in user to <PostDetailModal /> so the modal knows
//      the viewer is authenticated.  This restores the like/comment UI.
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

import CommunityFilter   from './CommunityFilter';
import CommunityList     from './CommunityList';
import PostDetailModal   from './PostDetailModal';
import { useAuthModal }  from '../../../contexts/AuthModalContext';

export default function CommunityPanel(props) {
    const {
        user,                    // ← already supplied by parent
        posts,
        hoveredId,
        setHoveredId,
        onLocationClick,
        onNewPost,
        showFilters,
        onToggleFilters,
    } = props;

    /* — modal state — */
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedPost, setSelected] = useState(null);

    const handleCardClick = (post) => {
        setSelected(post);
        setDetailOpen(true);
    };

    /* — defer “New Post” until after login — */
    const { open: openAuth } = useAuthModal();
    const [pendingNew, setPendingNew] = useState(false);

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
        <>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                {/* Filters --------------------------------------------------- */}
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

                {/* Scrollable list ----------------------------------------- */}
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
                            onCardClick={handleCardClick}
                        />
                    </Box>
                </Box>
            </Box>

            {/* Detail Modal (now receives `user`) ------------------------- */}
            <PostDetailModal
                open={detailOpen}
                post={selectedPost}
                onClose={() => setDetailOpen(false)}
                user={user}       /* ← key fix */
            />
        </>
    );
}
