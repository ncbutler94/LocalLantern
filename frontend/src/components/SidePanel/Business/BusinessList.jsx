// src/components/SidePanel/Business/BusinessList.jsx
import React from 'react';
import { Box, Typography } from '@mui/material';
import BusinessCard from './BusinessCard';

export default function BusinessList({ businesses, hoveredId, setHoveredId, onLocationClick, onCardClick }) {
    if (!businesses?.length) {
        return <Typography variant="body2" color="text.secondary">No businesses yet.</Typography>;
    }

    return (
        <Box>
            {businesses.map((biz) => (
                <BusinessCard
                    key={biz.id}
                    biz={biz}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onLocationClick={onLocationClick}
                    onCardClick={onCardClick}
                />
            ))}
        </Box>
    );
}
