import React from 'react';
import { Box, Divider, Typography, Button, Paper } from '@mui/material';
import JobsFilter from './JobsFilter';
import JobsList from './JobsList';

export default function JobsPanel({
                                      user = null,
                                      categories = [],
                                      jobs = [],
                                      loading = false,
                                      hoveredId = null,
                                      setHoveredId = () => {},
                                      onLocationClick = () => {},
                                      onCardClick = () => {},
                                      onNewJob = () => {},

                                      // filters (individual props API)
                                      search, setSearch,
                                      sort, setSort,
                                      category, setCategory,
                                      type, setType,
                                      experience, setExperience,
                                      payRange, setPayRange,
                                      county, setCounty,
                                      city, setCity,
                                      remote, setRemote,
                                      onSearchClick, onClearClick,
                                  }) {
    const showMineOption =
        !!user && (user.is_business || user.business_id || user.business || user.type === 'business');

    return (
        <Box>
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <JobsFilter
                    /* filter values */
                    search={search} setSearch={setSearch}
                    sort={sort} setSort={setSort}
                    category={category} setCategory={setCategory}
                    type={type} setType={setType}
                    experience={experience} setExperience={setExperience}
                    payRange={payRange} setPayRange={setPayRange}
                    county={county} setCounty={setCounty}
                    city={city} setCity={setCity}
                    remote={remote} setRemote={setRemote}
                    /* options & actions */
                    categories={categories}
                    showMineOption={showMineOption}
                    onSearchClick={onSearchClick}
                    onClearClick={onClearClick}
                />
            </Paper>

            <Paper variant="outlined">
                <Box px={2} py={1} display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1" fontWeight={600}>Job Openings</Typography>
                    <Button variant="contained" onClick={onNewJob}>New Job</Button>
                </Box>
                <Divider />
                <Box px={1.25} py={1.25}>
                    <JobsList
                        jobs={jobs}
                        loading={loading}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        onLocationClick={onLocationClick}
                        onCardClick={onCardClick}
                    />
                </Box>
            </Paper>
        </Box>
    );
}
