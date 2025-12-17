// src/components/SidePanel/Community/NewCommunityPosts/CategoryPopup.jsx
// -----------------------------------------------------------------------------
// Step-1 dialog: lets the user pick which kind of Community post to create.
// -----------------------------------------------------------------------------
//
// • Added “Recommendations & Tips” (kept from earlier refactor)
// • Splits “Help Requests” and “Volunteers” into two separate choices
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
    { id: 'help-requests',        label: 'Help Requests' },
    { id: 'volunteer-requests',   label: 'Volunteers' },
];

function normalizeCategoryOptions(list) {
    const input = Array.isArray(list) && list.length ? list : DEFAULT_CATEGORIES;

    const normalized = [];
    input.forEach((item) => {
        const id = String(item?.id || item?.slug || '').trim();
        const label = String(item?.label || '').trim();

        if (!id) return;

        // Backwards compatibility: older DBs used a combined "Volunteer & Help Requests" slug.
        if (id === 'volunteer-help-requests' || id === 'volunteer-help') {
            normalized.push({ id: 'help-requests', label: 'Help Requests' });
            normalized.push({ id: 'volunteer-requests', label: 'Volunteers' });
            return;
        }

        normalized.push({ id, label: label || id });
    });

    // De-dupe by id (first one wins)
    const seen = new Set();
    return normalized.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
    });
}

export default function CategoryPopup({
                                          subtypes = DEFAULT_CATEGORIES,
                                          onCancel,
                                          onCategoryChosen,
                                      }) {
    const [category, setCategory] = useState('');

    const sorted = normalizeCategoryOptions(subtypes).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    );

    const canNext = Boolean(category);

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
                            onChange={(e) => setCategory(String(e.target.value))}
                        >
                            {sorted.map((c) => (
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
