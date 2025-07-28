// src/components/SidePanel/Community/NewCommunityPosts/CategoryPopup.jsx
// -----------------------------------------------------------------------------
// Step-1 dialog: lets the user pick which kind of Community post to create.
// -----------------------------------------------------------------------------
//
// • Added “Recommendations & Tips” (kept from earlier refactor)
// • Added “Volunteer & Help Requests”
// • Alphabetises labels case-insensitively so new categories always sort nice
// • Emits { category } to parent so it can show the right Step-2 form
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
} from '@mui/material';

/* ─────────────── central list of post categories ─────────────── */
const DEFAULT_CATEGORIES = [
    { id: 'announcements',        label: 'Announcements' },
    { id: 'general-discussion',   label: 'General Discussion' },
    { id: 'lost-and-found',       label: 'Lost & Found' },
    { id: 'public-safety-alerts', label: 'Public Safety Alerts' },
    { id: 'recommendations-tips', label: 'Recommendations & Tips' },
    { id: 'volunteer-requests',   label: 'Volunteer & Help Requests' }, // ← new
];

export default function CategoryPopup({
                                          subtypes = DEFAULT_CATEGORIES,
                                          onCancel,
                                          onCategoryChosen,
                                      }) {
    const [category, setCategory] = useState('');
    const canNext = Boolean(category);

    /* sort labels alphabetically (case-insensitive) */
    const categoriesToShow = (subtypes.length ? subtypes : DEFAULT_CATEGORIES)
        .slice()
        .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
        );

    return (
        <>
            <DialogTitle sx={{ m: 0, p: 2 }}>New Community Post</DialogTitle>

            <DialogContent dividers>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControl fullWidth required>
                        <InputLabel>Category</InputLabel>
                        <Select
                            value={category}
                            label="Category"
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <MenuItem value="">— Select Category —</MenuItem>

                            {categoriesToShow.map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                    {c.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1 }}>
                <Button
                    variant="contained"
                    disabled={!canNext}
                    onClick={() => onCategoryChosen({ category })}
                >
                    Next
                </Button>
                <Button variant="outlined" onClick={onCancel}>
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
