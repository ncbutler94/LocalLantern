// src/components/SidePanel/Community/NewCommunityPosts/NewPublicSafetyForm.jsx
import React, { useState } from 'react';
import dayjs from 'dayjs';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Typography,
    Tooltip,
    Button,
    CircularProgress,
    Box,
} from '@mui/material';

import useBasePostForm, {
    MAX_TITLE,
    MAX_DESCRIPTION,
} from '../Common/useBasePostForm';
import CityCountySelect from '../../../Common/CityCountySelect/CityCountySelect';
import { LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

export default function NewPublicSafetyForm({ onClose, onSubmit, onRefresh }) {
    /* ─── shared base fields ─────────────────────────────────────────────── */
    const base = useBasePostForm();

    /* ─── public-safety specific fields (severity removed) ───────────────── */
    const [expiresAt, setExpiresAt] = useState(dayjs().add(24, 'hour'));

    /* ─── validation ─────────────────────────────────────────────────────── */
    const needsTitle  = !base.title.trim();
    const needsCounty = !base.county.trim();

    const isDisabled = base.submitting || needsTitle || needsCounty;

    const tooltipMsg = needsTitle
        ? 'Title is required.'
        : needsCounty
            ? 'County is required.'
            : '';

    /* ─── submit ─────────────────────────────────────────────────────────── */
    async function handlePost() {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (isDisabled) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = base.coordsFromLocalData(base.city, base.county);

            const fd = new FormData();
            fd.append('title',       base.title);
            fd.append('description', base.description);
            fd.append('city',        base.city);
            fd.append('county',      base.county);
            fd.append('latitude',    lat);
            fd.append('longitude',   lng);
            fd.append('expires_at',  expiresAt ? expiresAt.toISOString() : '');

            base.photos.filter(Boolean).forEach((p) => fd.append('photos', p.file));

            await onSubmit(fd);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            console.error(err);
            base.setError(err.message || 'Submission failed.');
        } finally {
            base.setSubmitting(false);
        }
    }

    /* ─── render ─────────────────────────────────────────────────────────── */
    return (
        <>
            <DialogTitle>New Public Safety Alert</DialogTitle>

            <DialogContent
                dividers
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
                {base.error && <Typography color="error">{base.error}</Typography>}

                {/* Title */}
                <TextField
                    label="Title"
                    required
                    fullWidth
                    value={base.title}
                    onChange={(e) => base.setTitle(e.target.value)}
                    inputProps={{ maxLength: MAX_TITLE }}
                />
                <Typography variant="caption">
                    {base.title.length} / {MAX_TITLE}
                </Typography>

                {/* City / County */}
                <CityCountySelect
                    city={base.city}
                    setCity={base.setCity}
                    county={base.county}
                    setCounty={base.setCounty}
                    countyError={
                        base.attemptedSubmit && !base.county ? 'County is required.' : ''
                    }
                />

                {/* Expires At */}
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DateTimePicker
                        label="Expires At"
                        value={expiresAt}
                        onChange={(dt) => setExpiresAt(dt)}
                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                    />
                </LocalizationProvider>

                {/* Description */}
                <TextField
                    label="Description"
                    multiline
                    rows={4}
                    fullWidth
                    value={base.description}
                    onChange={(e) => base.setDescription(e.target.value)}
                    inputProps={{ maxLength: MAX_DESCRIPTION }}
                />
                <Typography variant="caption">
                    {base.description.length} / {MAX_DESCRIPTION}
                </Typography>

                {/* Photos */}
                <Typography variant="subtitle2">
                    Photos (up to {base.photos.length})
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                    {base.photos.map((p, idx) =>
                        p ? (
                            <Box key={idx} position="relative" width={80} height={80}>
                                <img
                                    src={p.url}
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <Button
                                    size="small"
                                    onClick={() => base.handleRemovePhoto(idx)}
                                    sx={{ position: 'absolute', top: 0, right: 0, p: 0, minWidth: 24 }}
                                >
                                    &times;
                                </Button>
                            </Box>
                        ) : (
                            <label key={idx} style={{ cursor: 'pointer' }}>
                                <input
                                    hidden
                                    accept="image/*"
                                    type="file"
                                    onChange={base.handleFileChange}
                                />
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
                <Tooltip title={tooltipMsg} disableHoverListener={!tooltipMsg}>
          <span>
            <Button variant="contained" disabled={isDisabled} onClick={handlePost}>
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
