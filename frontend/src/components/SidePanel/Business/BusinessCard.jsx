// src/components/SidePanel/Business/BusinessCard.jsx
import React from 'react';
import { Card, CardContent, CardMedia, Typography, Box, Chip } from '@mui/material';

export default function BusinessCard({ biz, hoveredId, setHoveredId, onLocationClick, onCardClick }) {
    const img = biz.photos?.[0] || biz.logoUrl || '';

    return (
        <Card
            onMouseEnter={() => setHoveredId?.(biz.id)}
            onMouseLeave={() => setHoveredId?.(null)}
            sx={{ mb: 2, cursor: 'pointer' }}
            onClick={() => onCardClick?.(biz)}
        >
            {img && <CardMedia component="img" height="140" image={img} alt={biz.name} />}
            <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography variant="h6">{biz.name}</Typography>
                    {biz.category && <Chip size="small" label={biz.category} />}
                </Box>
                <Typography variant="body2" color="text.secondary">
                    {biz.city ? `${biz.city}, ${biz.county ?? ''}` : (biz.county || '')}
                </Typography>
                {biz.hours && typeof biz.hours === 'string' && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {biz.hours}
                    </Typography>
                )}
                <Box mt={1}>
                    <Typography
                        variant="body2"
                        sx={{ color: 'primary.main', textDecoration: 'underline' }}
                        onClick={(e) => { e.stopPropagation(); onLocationClick?.(biz.latitude, biz.longitude, 'address'); }}
                    >
                        View on map
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
}
