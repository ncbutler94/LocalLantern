import React, { useMemo } from 'react';
import {
    Box, Grid, FormControl, InputLabel, Select, MenuItem,
    TextField, Checkbox, FormControlLabel, Button,
} from '@mui/material';

/**
 * JobsFilter – robust to BOTH prop styles:
 *  A) individual props (search, setSearch, sort, setSort, ...)
 *  B) object props: { filters, onChange, categories, onSearch, onClear, isBusiness }
 *
 * This component normalizes both shapes so it will NOT crash if one or the other is provided.
 */
export default function JobsFilter(props) {
    // ---- normalize props (bridge both APIs safely) --------------------------
    const hasObjectFilters = props.filters && typeof props.onChange === 'function';

    const getVal = (key, fallback = '') =>
        hasObjectFilters ? props.filters?.[key] ?? fallback : props[key] ?? fallback;

    const setVal = (key) => (value) => {
        if (hasObjectFilters) props.onChange(key, value);
        const setterName = `set${key[0].toUpperCase()}${key.slice(1)}`;
        if (typeof props[setterName] === 'function') props[setterName](value);
    };

    const onSearchClick = props.onSearchClick || props.onSearch || (() => {});
    const onClearClick  = props.onClearClick  || props.onClear  || (() => {});
    const categories    = Array.isArray(props.categories) ? props.categories : [];
    const showMineOption = Boolean(props.showMineOption || props.isBusiness);

    const search     = getVal('search', '');
    const sort       = getVal('sort', 'newest'); // 'newest' | 'oldest' | 'mine'
    const category   = getVal('category', '');
    const type       = getVal('type', '');
    const experience = getVal('experience', '');
    const payRange   = getVal('payRange', '');   // "15000-30000" | "250000-+"
    const county     = getVal('county', '');
    const city       = getVal('city', '');
    const remote     = Boolean(getVal('remote', false));

    const setSearch     = setVal('search');
    const setSort       = setVal('sort');
    const setCategory   = setVal('category');
    const setType       = setVal('type');
    const setExperience = setVal('experience');
    const setPayRange   = setVal('payRange');
    const setCounty     = setVal('county');
    const setCity       = setVal('city');
    const setRemote     = setVal('remote');

    // ---- options ------------------------------------------------------------
    const sortOptions = useMemo(
        () => [
            { id: 'newest', label: 'Newest' },
            { id: 'oldest', label: 'Oldest' },
            ...(showMineOption ? [{ id: 'mine', label: 'My Job Postings' }] : []),
        ],
        [showMineOption]
    );

    const typeOptions = useMemo(
        () => [
            { id: '',          label: 'All types' },
            { id: 'full-time', label: 'Full-time' },
            { id: 'part-time', label: 'Part-time' },
            { id: 'contract',  label: 'Contract' },
            { id: 'temporary', label: 'Temporary' },
            { id: 'seasonal',  label: 'Seasonal' },
            { id: 'internship',label: 'Internship' },
        ],
        []
    );

    const expOptions = useMemo(
        () => [
            { id: '',    label: 'Any experience' },
            { id: '0-1', label: '0–1 yrs' },
            { id: '2-3', label: '2–3 yrs' },
            { id: '4-6', label: '4–6 yrs' },
            { id: '7-10',label: '7–10 yrs' },
            { id: '10+', label: '10+ yrs' },
        ],
        []
    );

    const payOptions = useMemo(() => {
        const list = [{ value: '', label: 'Any pay' }];
        const step = 15000;
        for (let lo = step; lo < 250000; lo += step) {
            const hi = lo + step;
            list.push({ value: `${lo}-${hi}`, label: `$${Math.round(lo/1000)}k–$${Math.round(hi/1000)}k` });
        }
        list.push({ value: '250000-+', label: '$250k+' });
        return list;
    }, []);

    const cats = useMemo(
        () => [{ id: '', label: 'All' }, ...categories],
        [categories]
    );

    // ---- UI -----------------------------------------------------------------
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {/* Search row */}
            <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Search posts"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <Button variant="contained" onClick={onSearchClick}>Search</Button>
                <Button variant="outlined" onClick={onClearClick}>Clear</Button>
            </Box>

            {/* Filters */}
            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={3}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Sort by</InputLabel>
                        <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>
                            {sortOptions.map(o => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12} sm={3}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Category</InputLabel>
                        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                            {cats.map(c => (
                                <MenuItem key={c.id || c.value || 'any'} value={c.id || c.value || ''}>
                                    {c.label || c.name || c.id}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12} sm={3}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Type</InputLabel>
                        <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
                            {typeOptions.map(t => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12} sm={3}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Experience</InputLabel>
                        <Select label="Experience" value={experience} onChange={(e) => setExperience(e.target.value)}>
                            {expOptions.map(x => <MenuItem key={x.id} value={x.id}>{x.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12} sm={3}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Pay</InputLabel>
                        <Select label="Pay" value={payRange} onChange={(e) => setPayRange(e.target.value)}>
                            {payOptions.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Grid>

                {/* County + City ALWAYS on the same line */}
                <Grid item xs={12} sm={7}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', overflowX: 'auto' }}>
                        <TextField size="small" label="County" value={county} onChange={(e) => setCounty(e.target.value)} sx={{ minWidth: 200 }} />
                        <TextField size="small" label="City"   value={city}   onChange={(e) => setCity(e.target.value)}   sx={{ minWidth: 200 }} />
                    </Box>
                </Grid>

                <Grid item xs={12} sm={2}>
                    <FormControlLabel
                        control={<Checkbox checked={!!remote} onChange={(e) => setRemote(e.target.checked)} />}
                        label="Remote Work"
                        sx={{ whiteSpace: 'nowrap' }}
                    />
                </Grid>
            </Grid>
        </Box>
    );
}
