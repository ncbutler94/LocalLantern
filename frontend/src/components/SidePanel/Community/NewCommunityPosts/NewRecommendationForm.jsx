// src/components/SidePanel/Community/NewCommunityPosts/NewRecommendationForm.jsx
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

/* ───────────────────────── component ───────────────────────── */
export default function NewRecommendationForm({ onClose, onSubmit, onRefresh }) {
    /* shared fields (title, desc, photos, city/county, etc.) */
    const base = useBasePostForm();

    /* “business / tip” selector */
    const [recType, setRecType] = useState('business'); // 'business' | 'tip'

    /* submit */
    const handlePost = async () => {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (base.isDisabled) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = base.coordsFromLocalData(base.city, base.county) || [];
            const form = new FormData();

            form.append('title',       base.title);
            form.append('description', base.description);
            form.append('rec_type',    recType);
            form.append('city',        base.city);
            form.append('county',      base.county);
            form.append('latitude',    lat ?? '');
            form.append('longitude',   lng ?? '');

            base.photos
                .filter(Boolean)
                .forEach(p => form.append('photos', p.file)); // ≤ 4

            await onSubmit(form);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            console.error(err);
            base.setError(err.message || 'Submission failed.');
        } finally {
            base.setSubmitting(false);
        }
    };

    /* render */
    return (
        <>
            <DialogTitle>New Recommendation / Tip</DialogTitle>

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

                {/* Post type */}
                <FormControl component="fieldset" required>
                    <FormLabel>Post Type</FormLabel>
                    <RadioGroup
                        row
                        value={recType}
                        onChange={e => setRecType(e.target.value)}
                    >
                        <FormControlLabel
                            value="business"
                            control={<Radio />}
                            label="Business / Service"
                        />
                        <FormControlLabel
                            value="tip"
                            control={<Radio />}
                            label="General Tip / Idea"
                        />
                    </RadioGroup>
                </FormControl>

                {/* City & County dropdowns */}
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

                {/* Photo picker (≤ 4) */}
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
                                    alt=""
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
                <Tooltip
                    title={base.tooltipMsg}
                    disableHoverListener={!base.tooltipMsg}
                >
          <span>
            <Button
                variant="contained"
                disabled={base.isDisabled}
                onClick={handlePost}
            >
              {base.submitting ? <CircularProgress size={20} /> : 'Post'}
            </Button>
          </span>
                </Tooltip>
                <Button
                    variant="outlined"
                    onClick={onClose}
                    disabled={base.submitting}
                >
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
