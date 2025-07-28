// src/components/Common/SearchInput.jsx
import React from 'react';
import { Box, TextField, Button } from '@mui/material';

/**
 * Reusable search bar with built‑in Enter‑to‑search, Clear button, and maxLength guard.
 *
 * Props
 * -----
 * value      : string   – controlled input value
 * onChange   : (e) =>   – call with the raw input event or e.target.value
 * onSearch   : () =>    – triggered on Search click or Enter key
 * onClear    : () =>    – triggered on Clear click
 * placeholder: string   – textfield label (default "Search posts")
 * maxLength  : number   – character cap (default 250)
 */
export default function SearchInput({
                                        value = '',
                                        onChange,
                                        onSearch,
                                        onClear,
                                        placeholder = 'Search posts',
                                        maxLength = 250,
                                    }) {
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSearch?.();
        }
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
                size="small"
                sx={{ flex: 1 }}
                label={placeholder}
                value={value}
                onChange={onChange}
                inputProps={{ maxLength }}
                onKeyDown={handleKeyDown}
            />

            <Button variant="contained" onClick={onSearch}>Search</Button>
            <Button variant="outlined" onClick={onClear}>Clear</Button>
        </Box>
    );
}
