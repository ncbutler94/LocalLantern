// src/components/SidePanel/Business/BusinessList.jsx
import React from 'react';
import { Box, Typography } from '@mui/material';
import BusinessCard from './BusinessCard';

export default function BusinessList({
                                         businesses,
                                         hoveredId,
                                         setHoveredId,
                                         onLocationClick,
                                         onCardClick,
                                     }) {
    if (!businesses?.length) {
        return (
            <Typography variant="body2" color="text.secondary">
                No businesses yet.
            </Typography>
        );
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gap: 2,
                // Two cards per row from small screens and up for stronger, consistent layout
                gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(2, 1fr)',
                    lg: 'repeat(2, 1fr)',
                },
                alignItems: 'stretch',
            }}
        >
            {businesses.map((biz) => (
                <Box key={biz.id} sx={{ height: '100%' }}>
                    <BusinessCard
                        biz={biz}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={onCardClick}
                    />
                </Box>
            ))}
        </Box>
    );
}
