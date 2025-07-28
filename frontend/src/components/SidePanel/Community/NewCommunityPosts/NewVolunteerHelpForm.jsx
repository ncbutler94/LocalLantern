// src/components/SidePanel/Community/NewCommunityPosts/NewVolunteerHelpForm.jsx
// -----------------------------------------------------------------------------
// Form dialog for creating a new Volunteer‑Help Request.
// Mirrors NewRecommendationForm but with help‑specific fields.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    TextField,
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Box,
    Button,
    Tooltip,
    CircularProgress,
} from '@mui/material';
import useBasePostForm, {
    MAX_TITLE,
    MAX_DESCRIPTION,
} from '../Common/useBasePostForm';
import CityCountySelect from '../../../Common/CityCountySelect/CityCountySelect';
import { createVolunteerRequest } from '../../../../api/community/volunteerHelp';

/* hard‑coded categories until we wire a lookup */
const HELP_TYPES = [
    { value: 'labor',       label: 'Manual Labor' },
    { value: 'staffing',   label: 'Event Staffing' },
    { value: 'skills',      label: 'Skill‑Based' },
    { value: 'other',       label: 'Other' },
];

export default function NewVolunteerHelpForm({ onClose, onRefresh }) {
    /* shared fields (title, desc, photos, city/county, etc.) */
    const base = useBasePostForm();

    /* volunteer‑help specific */
    const [helpType, setHelpType]         = useState('labor');   // value from HELP_TYPES
    const [neededDate, setNeededDate]     = useState('');        // yyyy‑mm‑dd
    const [contact, setContact]           = useState('');        // phone or email

    /* submit */
    const handlePost = async () => {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (base.isDisabled || !neededDate.trim()) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = base.coordsFromLocalData(base.city, base.county) || [];
            const form = new FormData();

            form.append('title',        base.title);
            form.append('extra_notes', base.description);
            form.append('help_type',    helpType);
            form.append('needed_date',  neededDate);
            form.append('contact',      contact);
            form.append('city',         base.city);
            form.append('county',       base.county);
            form.append('latitude',     lat ?? '');
            form.append('longitude',    lng ?? '');

            base.photos
                .filter(Boolean)
                .forEach(p => form.append('photos', p.file)); // ≤ 4

            await createVolunteerRequest(form);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            console.error(err);
            base.setError(err.message || 'Submission failed.');
        } finally {
            base.setSubmitting(false);
        }
    };

    /* ────────────── render ────────────── */
    return (
        <>
            <DialogTitle>New Volunteer‑Help Request</DialogTitle>

            <DialogContent
                dividers
                autoComplete="off"
                component="form"
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
                {base.error && <Typography color="error">{base.error}</Typography>}

                {/* Title */}
                <TextField
                    label="Title"
                    required
                    fullWidth
                    value={base.title}
                    onChange={e => base.setTitle(e.target.value)}
                    inputProps={{ maxLength: MAX_TITLE }}
                />
                <Typography variant="caption">
                    {base.title.length} / {MAX_TITLE}
                </Typography>

                {/* Help Type */}
                <FormControl component="fieldset" required>
                    <FormLabel>Help Needed</FormLabel>
                    <RadioGroup
                        row
                        value={helpType}
                        onChange={e => setHelpType(e.target.value)}
                    >
                        {HELP_TYPES.map(t => (
                            <FormControlLabel key={t.value} value={t.value} control={<Radio />} label={t.label} />
                        ))}
                    </RadioGroup>
                </FormControl>

                {/* Date Needed */}
                <TextField
                    label="Date Needed"
                    type="date"
                    required
                    fullWidth
                    value={neededDate}
                    onChange={e => setNeededDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                />

                {/* Contact */}
                <TextField
                    label="Contact Info (email or phone)"
                    required
                    fullWidth
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                />

                {/* City & County */}
                <CityCountySelect
                    city={base.city}
                    setCity={base.setCity}
                    county={base.county}
                    setCounty={base.setCounty}
                    countyError={
                        base.attemptedSubmit && !base.county ? 'County is required.' : ''
                    }
                />

                {/* Description */}
                <TextField
                    label="Description"
                    multiline
                    rows={4}
                    fullWidth
                    value={base.description}
                    onChange={e => base.setDescription(e.target.value)}
                    inputProps={{ maxLength: MAX_DESCRIPTION }}
                />
                <Typography variant="caption">
                    {base.description.length} / {MAX_DESCRIPTION}
                </Typography>

                {/* Photo picker (≤ 4) – reused from useBasePostForm */}
                <Typography variant="subtitle2">Photos (optional – up to 4)</Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                    {base.photos.map((p, idx) =>
                        p ? (
                            <Box
                                key={idx}
                                position="relative"
                                width={80}
                                height={80}
                                sx={{ borderRadius: 1, overflow: 'hidden' }}
                            >
                                <img
                                    src={p.url}
                                    alt="preview"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <Button
                                    size="small"
                                    onClick={() => base.handleRemovePhoto(idx)}
                                    sx={{
                                        position: 'absolute',
                                        top: 0,
                                        right: 0,
                                        p: 0,
                                        minWidth: 24,
                                    }}
                                >
                                    &times;
                                </Button>
                            </Box>
                        ) : (
                            <label key={idx} style={{ cursor: 'pointer' }}>
                                <input hidden accept="image/*" type="file" onChange={base.handleFileChange} />
                                <Box
                                    sx={{
                                        width: 80,
                                        height: 80,
                                        border: '2px dashed grey',
                                        borderRadius: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    +
                                </Box>
                            </label>
                        )
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={base.tooltipMsg} disableHoverListener={!base.tooltipMsg}>
          <span>
            <Button
                variant="contained"
                disabled={base.isDisabled || !neededDate.trim()}
                onClick={handlePost}
            >
                {base.submitting ? <CircularProgress size={20} /> : 'Post'}
            </Button>
          </span>
                </Tooltip>
                <Button variant="outlined" onClick={onClose} disabled={base.submitting}>
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
