// src/pages/profile/userProfile/HistoryDialog.jsx
// Scrollable dialog for Work / Education with validation and a custom
// "Discard changes?" dialog (no browser alert).
import React, { useEffect, useRef, useState } from 'react';
import {
    Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle,
    TextField, Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

const MAX = 15;

const initWork = () => ({ title: '', company: '', location: '', start_date: '', end_date: '', current: false, description: '' });
const initEdu  = () => ({ school: '', degree: '', field: '', start_date: '', end_date: '', current: false, description: '' });

/**
 * Props (supports both old and new names)
 * - open: boolean
 * - type: 'work' | 'education'
 * - value: array (NEW, preferred)
 * - onChange: function(array) (NEW, preferred)
 * - initialItems: array (legacy)
 * - onSave: function(array) (legacy)
 * - onClose: function()
 */
export default function HistoryDialog({
                                          open,
                                          type,
                                          value,                // preferred (from parent)
                                          onChange,             // preferred (from parent)
                                          initialItems,         // legacy
                                          onSave,               // legacy
                                          onClose,
                                      }) {
    const isWork = type === 'work';
    const label = isWork ? 'Work History' : 'School History';

    const [items, setItems] = useState([]);
    const [dirty, setDirty] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [errors, setErrors] = useState({});
    const scRef = useRef(null);
    const cardRefs = useRef([]);

    // Initialize form state when opened
    useEffect(() => {
        if (open) {
            // Prefer `value`; fall back to legacy `initialItems`
            const source = Array.isArray(value) ? value : initialItems;
            const copy = Array.isArray(source) ? JSON.parse(JSON.stringify(source)) : [];
            setItems(copy);
            setErrors({});
            setDirty(false);
            cardRefs.current = [];
        }
    }, [open, value, initialItems]);

    const add = () => {
        if (items.length >= MAX) return;
        const next = [...items, isWork ? initWork() : initEdu()];
        setItems(next);
        setDirty(true);
        requestAnimationFrame(() =>
            scRef.current?.scrollTo({ top: scRef.current.scrollHeight, behavior: 'smooth' })
        );
    };

    const removeAt = (i) => {
        const next = items.filter((_, idx) => idx !== i);
        setItems(next);
        setErrors((e) => {
            const copy = { ...e }; delete copy[i]; return copy;
        });
        setDirty(true);
    };

    const updateAt = (i, patch) => {
        const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
        setItems(next);
        setDirty(true);
    };

    const validate = () => {
        const e = {};
        items.forEach((it, i) => {
            if (isWork ? !String(it.title || '').trim() : !String(it.school || '').trim()) {
                e[i] = { field: isWork ? 'title' : 'school' };
            }
        });
        setErrors(e);
        if (Object.keys(e).length) {
            const first = Number(Object.keys(e)[0]);
            const node = cardRefs.current[first];
            node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
        }
        return true;
    };

    const handleDone = () => {
        if (!validate()) return;

        // Support both prop styles. Prefer the new `onChange`.
        if (typeof onChange === 'function') onChange(items);
        else if (typeof onSave === 'function') onSave(items);

        setDirty(false);
        if (typeof onClose === 'function') onClose();
    };

    return (
        <>
            <Dialog
                open={open}
                // Block click-away close; allow ESC to trigger discard confirmation.
                onClose={(_, reason) => {
                    if (reason === 'backdropClick') return; // block outside click
                    if (dirty) setConfirmCancel(true);
                    else if (typeof onClose === 'function') onClose();
                }}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
                    {label}
                    <Button startIcon={<AddCircleOutlineIcon />} onClick={add} disabled={items.length >= MAX}>
                        Add {isWork ? 'Job' : 'School'}
                    </Button>
                </DialogTitle>

                <DialogContent
                    ref={scRef}
                    sx={{ maxHeight: '70vh', overflowY: 'auto', pt: 1, display: 'grid', gap: 2 }}
                >
                    {items.map((it, i) => (
                        <Card key={i} ref={(el) => (cardRefs.current[i] = el)} variant="outlined" sx={{ p: 2 }}>
                            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                                {isWork ? (
                                    <>
                                        <TextField
                                            label="Job Title"
                                            value={it.title}
                                            onChange={(e) => updateAt(i, { title: e.target.value.slice(0, 120) })}
                                            required
                                            error={errors[i]?.field === 'title'}
                                            helperText={errors[i]?.field === 'title' ? 'Job Title is required' : ''}
                                        />
                                        <TextField
                                            label="Company / Employer"
                                            value={it.company}
                                            onChange={(e) => updateAt(i, { company: e.target.value.slice(0, 160) })}
                                        />
                                        <TextField
                                            label="Location"
                                            value={it.location}
                                            onChange={(e) => updateAt(i, { location: e.target.value.slice(0, 120) })}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <TextField
                                            label="School"
                                            value={it.school}
                                            onChange={(e) => updateAt(i, { school: e.target.value.slice(0, 160) })}
                                            required
                                            error={errors[i]?.field === 'school'}
                                            helperText={errors[i]?.field === 'school' ? 'School is required' : ''}
                                        />
                                        <TextField
                                            label="Degree"
                                            value={it.degree}
                                            onChange={(e) => updateAt(i, { degree: e.target.value.slice(0, 120) })}
                                        />
                                        <TextField
                                            label="Field of Study"
                                            value={it.field}
                                            onChange={(e) => updateAt(i, { field: e.target.value.slice(0, 160) })}
                                        />
                                    </>
                                )}

                                <TextField
                                    label="Start Date"
                                    type="date"
                                    value={it.start_date || ''}
                                    onChange={(e) => updateAt(i, { start_date: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                                <TextField
                                    label="End Date"
                                    type="date"
                                    disabled={it.current}
                                    value={it.end_date || ''}
                                    onChange={(e) => updateAt(i, { end_date: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />

                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!it.current}
                                        onChange={(e) =>
                                            updateAt(i, {
                                                current: e.target.checked,
                                                end_date: e.target.checked ? '' : it.end_date,
                                            })
                                        }
                                    />
                                    {isWork ? 'I currently work here' : 'I currently attend'}
                                </label>

                                <TextField
                                    label="Description"
                                    value={it.description || ''}
                                    onChange={(e) => updateAt(i, { description: e.target.value.slice(0, 400) })}
                                    multiline
                                    minRows={2}
                                    maxRows={4}
                                    sx={{ gridColumn: { xs: '1', md: '1 / span 2' } }}
                                />

                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button color="error" onClick={() => removeAt(i)}>Remove</Button>
                                </Box>
                            </Box>
                        </Card>
                    ))}

                    <Typography variant="caption" color="text.secondary">
                        {items.length} / {MAX} entries
                    </Typography>
                </DialogContent>

                <DialogActions sx={{ px: 2, pb: 2 }}>
                    <Button onClick={() => (dirty ? setConfirmCancel(true) : (typeof onClose === 'function' && onClose()))}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleDone}>Done</Button>
                </DialogActions>
            </Dialog>

            {/* Discard dialog (no browser native alert) */}
            <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)}>
                <DialogTitle>Discard your changes?</DialogTitle>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setConfirmCancel(false)}>No</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => { setConfirmCancel(false); if (typeof onClose === 'function') onClose(); }}
                    >
                        Yes
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
