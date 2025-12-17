// src/components/Common/CityCountySelect/CityCountySelect.jsx
import { useState, useEffect, useMemo } from 'react';
import {
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormHelperText,
} from '@mui/material';
import cityCountyData from '../data/cityCountyMap.json';

const normalizeCounty = (name) => name.replace(/ County$/i, '').trim();

export default function CityCountySelect({
                                             city,
                                             setCity,
                                             county,
                                             setCounty,
                                             sx = {},
                                             cityError = '',
                                             countyError = '',
                                             selectSx = {},
                                             countyRequired = false,   // optional for other pages
                                             cityRequired = false,     // optional for other pages
                                         }) {
    /* ───────── master lists ───────── */
    const allCounties = useMemo(
        () => Array.from(new Set(cityCountyData.map((c) => normalizeCounty(c.county)))).sort(),
        []
    );
    const allCities = useMemo(() => cityCountyData.map((c) => c.name).sort(), []);

    /* ───────── filtered city list ───────── */
    const [filteredCities, setFilteredCities] = useState(allCities);
    useEffect(() => {
        setFilteredCities(
            county
                ? cityCountyData
                    .filter((c) => normalizeCounty(c.county) === county)
                    .map((c) => c.name)
                    .sort()
                : allCities
        );
    }, [county, allCities]);

    /* ───────── keep county in sync when city changes ───────── */
    useEffect(() => {
        if (city) {
            const hit = cityCountyData.find((c) => c.name === city);
            if (hit) setCounty(normalizeCounty(hit.county));
        }
    }, [city, setCounty]);

    const cityLabel = county ? `City (${county})` : 'City';

    /* ───────── render ───────── */
    return (
        <Grid
            container
            spacing={2}
            sx={{
                width: '100%',
                flexWrap: { xs: 'wrap', sm: 'nowrap' }, // side-by-side on desktop, stack on small screens
                ...sx,
            }}
        >
            {/* County Select */}
            <Grid item xs={12} sm={6} sx={{ minWidth: 250 }}>
                <FormControl
                    fullWidth
                    size="small"
                    required={countyRequired}
                    error={!!countyError}
                    sx={selectSx}
                >
                    <InputLabel>County</InputLabel>
                    <Select
                        value={county}
                        label="County"
                        onChange={(e) => {
                            setCounty(e.target.value);
                            setCity(''); // reset city when county changes
                        }}
                    >
                        <MenuItem value="">
                            <em>Select county</em>
                        </MenuItem>
                        {allCounties.map((name) => (
                            <MenuItem key={name} value={name}>
                                {name}
                            </MenuItem>
                        ))}
                    </Select>
                    {countyError && <FormHelperText>{countyError}</FormHelperText>}
                </FormControl>
            </Grid>

            {/* City Select */}
            <Grid item xs={12} sm={6} sx={{ minWidth: 250 }}>
                <FormControl
                    fullWidth
                    size="small"
                    required={cityRequired}
                    error={!!cityError}
                    sx={selectSx}
                >
                    <InputLabel>{cityLabel}</InputLabel>
                    <Select
                        value={city}
                        label={cityLabel}
                        onChange={(e) => setCity(e.target.value)}
                    >
                        <MenuItem value="">
                            <em>Select city</em>
                        </MenuItem>
                        {filteredCities.map((name) => (
                            <MenuItem key={name} value={name}>
                                {name}
                            </MenuItem>
                        ))}
                    </Select>
                    {cityError && <FormHelperText>{cityError}</FormHelperText>}
                </FormControl>
            </Grid>
        </Grid>
    );
}
