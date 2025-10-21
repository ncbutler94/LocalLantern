// src/components/SidePanel/Business/BusinessCard.jsx
import React, { useState } from 'react';
import {
    Card, CardContent, Typography, Box, Chip, Avatar, Link,
} from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import StarIcon from '@mui/icons-material/Star';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import StarBorderIcon from '@mui/icons-material/StarBorder';

import BusinessIcon from '@mui/icons-material/Business';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import StorefrontIcon from '@mui/icons-material/Storefront';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import SpaIcon from '@mui/icons-material/Spa';
import ConstructionIcon from '@mui/icons-material/Construction';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PetsIcon from '@mui/icons-material/Pets';
import RealEstateAgentIcon from '@mui/icons-material/RealEstateAgent';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SchoolIcon from '@mui/icons-material/School';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import ComputerIcon from '@mui/icons-material/Computer';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import ChurchIcon from '@mui/icons-material/Church';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import YardIcon from '@mui/icons-material/Yard';

const HERO_ASPECT = '16 / 9';
const BODY_MIN_HEIGHT = 220;
const TITLE_LINES = 2;
const SNIPPET_CHARS = 70;
const SNIPPET_LINES = 2;

function stripHtmlToText(html = '') {
    return (html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getCategoryIcon(category = '') {
    const k = category.toLowerCase();
    if (k.includes('clean')) return <CleaningServicesIcon fontSize="small" />;
    if (k.includes('food') || k.includes('restaurant') || k.includes('cafe') || k.includes('bar')) return <RestaurantIcon fontSize="small" />;
    if (k.includes('retail') || k.includes('shop') || k.includes('store')) return <StorefrontIcon fontSize="small" />;
    if (k.includes('auto') || k.includes('car')) return <DirectionsCarIcon fontSize="small" />;
    if (k.includes('beauty') || k.includes('salon') || k.includes('spa')) return <SpaIcon fontSize="small" />;
    if (k.includes('construction') || k.includes('contractor') || k.includes('build')) return <ConstructionIcon fontSize="small" />;
    if (k.includes('health') || k.includes('medical') || k.includes('clinic')) return <LocalHospitalIcon fontSize="small" />;
    if (k.includes('pet') || k.includes('animal')) return <PetsIcon fontSize="small" />;
    if (k.includes('real')) return <RealEstateAgentIcon fontSize="small" />;
    if (k.includes('fitness') || k.includes('gym') || k.includes('yoga')) return <FitnessCenterIcon fontSize="small" />;
    if (k.includes('school') || k.includes('education') || k.includes('tutor')) return <SchoolIcon fontSize="small" />;
    if (k.includes('art') || k.includes('design') || k.includes('craft')) return <ColorLensIcon fontSize="small" />;
    if (k.includes('tech') || k.includes('it') || k.includes('computer')) return <ComputerIcon fontSize="small" />;
    if (k.includes('nonprofit') || k.includes('charity')) return <VolunteerActivismIcon fontSize="small" />;
    if (k.includes('church') || k.includes('faith') || k.includes('ministry')) return <ChurchIcon fontSize="small" />;
    if (k.includes('photo')) return <PhotoCameraIcon fontSize="small" />;
    if (k.includes('lawn') || k.includes('landscap') || k.includes('yard')) return <YardIcon fontSize="small" />;
    return <BusinessIcon fontSize="small" />;
}

function StarRow({ halfStars = 0, count = 0 }) {
    const hs = Math.max(0, Math.min(10, Number(halfStars) || 0));
    const rating = (hs / 2).toFixed(1);
    const label = `${rating} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`;

    return (
        <Box display="flex" alignItems="center" gap={0.5} aria-label={label} title={label} sx={{ mb: 0.25 }}>
            {Array.from({ length: 5 }).map((_, i) => {
                const threshold = (i + 1) * 2;
                if (hs >= threshold) return <StarIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />;
                if (hs === threshold - 1) return <StarHalfIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />;
                return <StarBorderIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />;
            })}
            <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {rating} ({count} {count === 1 ? 'review)' : 'reviews'})
            </Typography>
        </Box>
    );
}

export default function BusinessCard({
                                         biz,
                                         hoveredId,
                                         setHoveredId,
                                         onLocationClick,
                                         onCardClick,
                                     }) {
    const [overAddress, setOverAddress] = useState(false);

    const cover =
        biz.cover_url || biz.coverUrl ||
        (Array.isArray(biz.photos) ? biz.photos[0] : '') || '';

    const logo = biz.logo_url || biz.logoUrl || '';
    const hasAddress = Boolean((biz.street_address || '').trim());

    const rawCity = (biz.city || '').trim();
    const rawCounty = (biz.county || '').trim();
    const countyDisplay = rawCounty
        ? /\bcounty$/i.test(rawCounty)
            ? rawCounty
            : `${rawCounty} County`
        : '';
    const cityCounty = rawCity
        ? (countyDisplay ? `${rawCity}, ${countyDisplay}` : rawCity)
        : countyDisplay;

    const halfStars =
        typeof biz.rating_half_stars === 'number'
            ? biz.rating_half_stars
            : (typeof biz.avg_rating === 'number' ? Math.round(biz.avg_rating * 2) : 0);
    const reviewCount = biz.review_count ?? 0;

    const descPlain = stripHtmlToText(biz.description || '');
    const showMore = descPlain.length > SNIPPET_CHARS;
    const snippet = showMore ? descPlain.slice(0, SNIPPET_CHARS).trim() : descPlain;

    const isHovered = hoveredId === biz.id;

    return (
        <Card
            onMouseEnter={() => setHoveredId?.(biz.id)}
            onMouseLeave={() => setHoveredId?.(null)}
            sx={{
                height: '100%',
                cursor: 'pointer',
                borderRadius: 2,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                border: 1,
                borderColor: isHovered ? 'primary.main' : 'divider',            // like Community cards
                bgcolor: isHovered && !overAddress ? 'grey.100' : 'background.paper', // gray highlight except over address
                transition: (theme) => theme.transitions.create(['background-color','border-color'], { duration: 120 }),
                '&:hover .locationRow': { color: 'primary.main' },               // keep blue on address hover
            }}
            onClick={() => onCardClick?.(biz)}
        >
            {/* HERO / cover image (uniform 16:9) */}
            <Box sx={{ width: '100%', aspectRatio: HERO_ASPECT, bgcolor: 'action.hover', overflow: 'hidden' }}>
                {cover ? (
                    <Box
                        component="img"
                        src={cover}
                        alt={`${biz.name} cover`}
                        sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            objectPosition: 'center',
                            display: 'block',
                        }}
                    />
                ) : (
                    <Box sx={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                        <Avatar src={logo || undefined} alt={biz.name} sx={{ width: 140, height: 140, fontSize: 40 }}>
                            {(biz.name || 'B').slice(0, 1)}
                        </Avatar>
                    </Box>
                )}
            </Box>

            <CardContent
                sx={{
                    pb: 0.75,
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: BODY_MIN_HEIGHT,
                }}
            >
                {/* Header block */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, minWidth: 0 }}>
                    {cover ? (
                        <Avatar src={logo || undefined} alt={biz.name} sx={{ width: 56, height: 56 }}>
                            {(biz.name || 'B').slice(0, 1)}
                        </Avatar>
                    ) : null}

                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="h6"
                            title={biz.name}
                            sx={{
                                m: 0,
                                display: '-webkit-box',
                                WebkitLineClamp: TITLE_LINES,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                lineHeight: 1.2,
                            }}
                        >
                            {biz.name}
                        </Typography>

                        {biz.category && (
                            <Chip
                                size="small"
                                variant="outlined"
                                icon={getCategoryIcon(biz.category)}
                                label={biz.category}
                                sx={{
                                    mt: 0.5,
                                    maxWidth: '100%',
                                    alignSelf: 'flex-start',
                                    '.MuiChip-label': {
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    },
                                }}
                            />
                        )}
                    </Box>
                </Box>

                {/* Rating */}
                <StarRow halfStars={halfStars} count={reviewCount} />

                {/* Description */}
                {!!snippet && (
                    <Typography
                        variant="body2"
                        sx={{
                            mt: 0.25,
                            color: 'text.secondary',
                            display: '-webkit-box',
                            WebkitLineClamp: SNIPPET_LINES,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                            hyphens: 'auto',
                        }}
                    >
                        {snippet}
                        {showMore && '... '}
                        {showMore && (
                            <Link
                                component="button"
                                underline="hover"
                                color="primary"
                                onClick={(e) => { e.stopPropagation(); onCardClick?.(biz); }}
                                sx={{ fontWeight: 500 }}
                            >
                                more
                            </Link>
                        )}
                    </Typography>
                )}

                {/* Location (blue only; never gray‑fill the card while hovered here) */}
                <Box
                    className="locationRow"
                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredId?.(biz.id); setOverAddress(true); }}
                    onMouseLeave={(e) => { e.stopPropagation(); setHoveredId?.(null); setOverAddress(false); }}
                    onClick={(e) => { e.stopPropagation(); onLocationClick?.(); }}
                    sx={{ mt: 'auto', pt: 0.75, color: 'text.secondary', cursor: 'pointer' }}
                >
                    <Box display="flex" alignItems="flex-start" gap={0.75}>
                        <PlaceIcon fontSize="small" sx={{ mt: '2px' }} />
                        <Box sx={{ minWidth: 0 }}>
                            {hasAddress && (
                                <Typography
                                    variant="body2"
                                    sx={{ color: 'inherit', m: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {biz.street_address}
                                </Typography>
                            )}
                            <Typography
                                variant="body2"
                                sx={{ color: 'inherit', m: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                                {cityCounty}
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}
