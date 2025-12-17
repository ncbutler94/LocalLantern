// src/components/SidePanel/Events/EventsPanel.jsx
// -----------------------------------------------------------------------------
// Side panel matching CommunityPanel behavior, with New Event popup.
// Now requires login before opening the create dialog.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import {
    Box, Divider, Button, Typography, Collapse
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';

import EventsFilter from './EventsFilter';
import EventsList from './EventsList';
import NewEventDialog from './NewEventDialog';
import { useAuth } from '../../components/AuthModalContext';

export default function EventsPanel(props) {
    const {
        user,
        events,
        hoveredId,
        setHoveredId,
        onLocationClick,
        onCardClick,
        /* filters */
        showFilters,
        onToggleFilters,
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
        selectedCategory,
        onCategoryChange,
        selectedSort,
        onSortChange,
        selectedDateRange,
        onDateRangeChange,
        /* refresh after create */
        onCreated
    } = props;

    const [createOpen, setCreateOpen] = useState(false);
    const { open: openLogin } = useAuth();

    const handleNewEventClick = () => {
        if (!user) {
            openLogin();
            return;
        }
        setCreateOpen(true);
    };

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
            }}
        >
            {/* Filters --------------------------------------------------------- */}
            <Collapse in={showFilters}>
                <Box sx={{ p: 2 }}>
                    <EventsFilter
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
                        selectedCategory={selectedCategory}
                        onCategoryChange={onCategoryChange}
                        selectedSort={selectedSort}
                        onSortChange={onSortChange}
                        selectedDateRange={selectedDateRange}
                        onDateRangeChange={onDateRangeChange}
                    />
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

            {/* Scrollable list ------------------------------------------------ */}
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
                {/* sticky sub-header */}
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
                    <Typography variant="h6">Events</Typography>
                    <Button
                        variant="contained"
                        color="success"
                        onClick={handleNewEventClick}
                    >
                        New Event
                    </Button>
                </Box>

                <Box sx={{ p: 2 }}>
                    <EventsList
                        user={user}
                        events={events}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={onCardClick}
                    />
                </Box>
            </Box>

            {/* Create Event dialog (login-gated) */}
            <NewEventDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(id) => {
                    setCreateOpen(false);
                    if (typeof onCreated === 'function') onCreated(id);
                }}
                user={user}
            />
        </Box>
    );
}
