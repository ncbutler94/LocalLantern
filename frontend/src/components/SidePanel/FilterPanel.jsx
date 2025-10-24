import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';

export default function FilterPanel({
                                        tempCity,
                                        tempCounty,
                                        filteredCities = [],        // default to empty array
                                        filteredCounties = [],      // default to empty array
                                        onCityChange,
                                        onCountyChange,
                                        onApply
                                    }) {
    return (
        <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
                Location Filters
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Select
                    fullWidth
                    value={tempCity}
                    displayEmpty
                    onChange={e => onCityChange(e.target.value)}
                >
                    <MenuItem value="">All Cities</MenuItem>
                    {filteredCities.map(city => (
                        <MenuItem key={city} value={city}>
                            {city}
                        </MenuItem>
                    ))}
                </Select>

                <Select
                    fullWidth
                    value={tempCounty}
                    displayEmpty
                    onChange={e => onCountyChange(e.target.value)}
                >
                    <MenuItem value="">All Counties</MenuItem>
                    {filteredCounties.map(county => (
                        <MenuItem key={county} value={county}>
                            {county}
                        </MenuItem>
                    ))}
                </Select>
            </Box>

            <Button variant="contained" fullWidth onClick={onApply}>
                Apply Filters
            </Button>
        </Box>
    );
}
