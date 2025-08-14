// src/components/SidePanel/Business/BusinessCard.jsx
import React from 'react';
import {
    Card, CardContent, CardMedia, Typography, Box, Chip, Avatar, Stack
} from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';

export default function BusinessCard({
                                         biz,
                                         hoveredId,
                                         setHoveredId,
                                         onLocationClick,
                                         onCardClick,
                                     }) {
    const cover =
        biz.cover_url || biz.coverUrl ||
        (Array.isArray(biz.photos) ? biz.photos[0] : '') ||
        '';

    const logo =
        biz.logo_url || biz.logoUrl || '';

    const hasAddress = Boolean((biz.street_address || '').trim());

    // "City, County County" (append "County" when needed)
    const rawCity = (biz.city || '').trim();
    const rawCounty = (biz.county || '').trim();
    const countyDisplay = rawCounty
        ? (/\bcounty$/i.test(rawCounty) ? rawCounty : `${rawCounty} County`)
        : '';
    const cityCounty = rawCity
        ? (countyDisplay ? `${rawCity}, ${countyDisplay}` : rawCity)
        : countyDisplay;

    return (
        <Card
            onMouseEnter={() => setHoveredId?.(biz.id)}
            onMouseLeave={() => setHoveredId?.(null)}
            sx={{
                mb: 2,
                cursor: 'pointer',
                '&:hover .locationRow': { color: 'primary.main' }, // same highlight as before
            }}
            onClick={() => onCardClick?.(biz)}
        >
            {cover && (
                <CardMedia
                    component="img"
                    height="140"
                    image={cover}
                    alt={biz.name}
                />
            )}

            <CardContent sx={{ pb: 1.5 }}>
                {/* Header row: avatar + name (left), category (right) */}
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
                        <Avatar
                            src={logo || undefined}
                            alt={biz.name}
                            sx={{ width: 40, height: 40 }}
                        >
                            {(biz.name || 'B').slice(0, 1)}
                        </Avatar>
                        <Typography variant="h6" noWrap title={biz.name}>
                            {biz.name}
                        </Typography>
                    </Stack>

                    {biz.category && <Chip size="small" label={biz.category} />}
                </Box>

                {/* Description (preserve formatting, show up to ~4 lines) */}
                {biz.description && (
                    <Box
                        sx={{
                            mt: 0.25,
                            color: 'text.secondary',
                            display: '-webkit-box',
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            '& ul, & ol': { pl: 2, mb: 0 },
                            '& p': { m: 0 },
                        }}
                        // backend should sanitize; we render HTML so lists/bold/etc. remain
                        dangerouslySetInnerHTML={{ __html: biz.description }}
                    />
                )}

                {/* Location block — address (if present) above city/county, aligned with the same left edge */}
                <Box
                    className="locationRow"
                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredId?.(biz.id); }}
                    onMouseLeave={(e) => { e.stopPropagation(); setHoveredId?.(null); }}
                    onClick={(e) => { e.stopPropagation(); onLocationClick?.(); }}
                    sx={{
                        mt: 1.25,
                        color: 'text.secondary',
                        cursor: 'pointer',
                    }}
                >
                    <Box display="flex" alignItems="flex-start" gap={0.75}>
                        <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                        <Box>
                            {hasAddress && (
                                <Typography variant="body2" sx={{ color: 'inherit', m: 0 }}>
                                    {biz.street_address}
                                </Typography>
                            )}
                            <Typography variant="body2" sx={{ color: 'inherit', m: 0 }}>
                                {cityCounty}
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}
