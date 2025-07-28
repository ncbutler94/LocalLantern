// src/components/SidePanel/Community/NewCommunityPosts/NewAnnouncementForm.jsx
import React from 'react';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Typography,
    TextField,
    Button,
    Tooltip,
    Select,
    MenuItem,
    InputLabel,
    FormControl,
    CircularProgress,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import GroupIcon from '@mui/icons-material/Group';

import useBasePostForm, {
    MAX_TITLE,
    MAX_DESCRIPTION,
} from '../Common/useBasePostForm';
import CityCountySelect from '../../../Common/CityCountySelect/CityCountySelect';

export default function NewAnnouncementForm({
                                                onClose,
                                                onSubmit,
                                                onRefresh,
                                            }) {
    /* 1. staple fields (title, desc, photos, city, county) */
    const base = useBasePostForm();

    /* 2. the *only* extra field this category needs */
    const [visibility, setVisibility] = React.useState('public');

    /* 3. validation – every announcement must have title + county (city optional) */
    // ───────── NEW VALIDATION ─────────
    const needsTitle = !base.title.trim();
    const needsCounty = !base.county.trim();
    const isDisabled = base.submitting || needsTitle || needsCounty;
    const tooltipMsg = needsTitle
        ? 'Title is required.'
        : needsCounty
            ? 'County is required.'
            : '';
    // ──────────────────────────────────

    /* 4. submit */
    async function handlePost() {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (isDisabled) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = base.coordsFromLocalData(base.city, base.county);

            const form = new FormData();
            form.append('title', base.title);
            form.append('visibility', visibility);
            form.append('description', base.description);
            form.append('city', base.city);
            form.append('county', base.county);
            form.append('latitude', lat);
            form.append('longitude', lng);
            base.photos
                .filter(Boolean)
                .forEach((p) => form.append('photos', p.file));

            await onSubmit(form);
            if (typeof onRefresh === 'function') await onRefresh();
            onClose();
        } catch (err) {
            console.error(err);
            base.setError(err.message || 'Submission failed.');
        } finally {
            base.setSubmitting(false);
        }
    }

    /* 5. render */
    return (
        <>
            <DialogTitle>New Announcement</DialogTitle>

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
                    onChange={(e) => base.setTitle(e.target.value)}
                    inputProps={{ maxLength: MAX_TITLE }}
                />
                <Typography variant="caption">
                    {base.title.length} / {MAX_TITLE}
                </Typography>

                {/* Visibility */}
                <FormControl required sx={{ width: 150 }}>
                    <InputLabel>Visibility</InputLabel>
                    <Select
                        value={visibility}
                        label="Visibility"
                        size="small"
                        onChange={(e) => setVisibility(e.target.value)}
                    >
                        <MenuItem value="public">
                            <PublicIcon fontSize="small" sx={{ mr: 1 }} /> Public
                        </MenuItem>
                        <MenuItem value="followers">
                            <GroupIcon fontSize="small" sx={{ mr: 1 }} /> Followers Only
                        </MenuItem>
                    </Select>
                </FormControl>

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
                        ),
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={tooltipMsg} disableHoverListener={!tooltipMsg}>
          <span>
            <Button variant="contained" onClick={handlePost} disabled={isDisabled}>
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
