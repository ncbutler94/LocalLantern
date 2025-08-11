import React, { useState } from 'react';
import {
    DialogTitle, DialogContent, DialogActions,
    Box, Typography, TextField, Button, Tooltip,
    FormControl, FormLabel, RadioGroup, FormControlLabel,
    Radio, InputLabel, Select, MenuItem, InputAdornment,
    CircularProgress, Alert
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PublicIcon      from '@mui/icons-material/Public';
import GroupIcon       from '@mui/icons-material/Group';

import useBasePostForm, {
    MAX_TITLE,
    MAX_DESCRIPTION
} from '../Common/useBasePostForm';
import useAddressHelpers from '../Common/useAddressHelpers';
import CityCountySelect  from '../../../Common/CityCountySelect/CityCountySelect';

const MAX_REWARD_LENGTH = 11;

/* ────────────────────────── component ───────────────────────── */
export default function NewLostAndFoundForm({ onClose, onSubmit, onRefresh }) {
    /* 1. shared fields (title, desc, photos, city, county) */
    const base = useBasePostForm();

    /* 2a. optional street-address helpers */
    const addr = useAddressHelpers({ city: base.city, county: base.county });

    /* 2b. other category-specific state */
    const [visibility, setVisibility] = useState('public');
    const [lostFound,  setLostFound]  = useState('');
    const [reward,     setReward]     = useState('');

    /* touched flags for inline validation */
    const [countyTouched, setCountyTouched] = useState(false);
    const [cityTouched,   setCityTouched]   = useState(false);

    /* ───────── validation combining hook + category fields ───────── */
    const missingRequired =
        !base.title.trim()        ||
        !lostFound                ||
        !base.county              ||
        (addr.cityRequired && !base.city.trim());

    const isDisabled = missingRequired || base.submitting;
    const tooltipMsg = !base.title.trim()
        ? 'Title is required.'
        : !lostFound
            ? 'Select Lost or Found.'
            : !base.county
                ? 'County is required.'
                : addr.cityRequired && !base.city
                    ? 'City required when address is entered.'
                    : base.tooltipMsg;

    /* ───────── reward helpers (unchanged) ───────── */
    const handleRewardChange = e => {
        const v = e.target.value;
        if (/^[0-9]{0,9}(?:\\.\\d{0,2})?$/.test(v)) {
            setReward(v.slice(0, MAX_REWARD_LENGTH));
        }
    };
    const handleRewardBlur = () => {
        if (!reward) return;
        let v = reward.endsWith('.') ? reward.slice(0, -1) : reward;
        if (v.includes('.')) {
            const [i, d] = v.split('.');
            v = `${i || '0'}.${d.padEnd(2, '0').slice(0, 2)}`;
        } else v = `${v}.00`;
        setReward(v);
    };

    /* ───────── submit ───────── */
    async function handlePost() {
        base.setAttemptedSubmit(true);
        base.setError('');
        if (isDisabled) return;

        base.setSubmitting(true);
        try {
            const [lat, lng] = await addr.resolveCoordinates();

            const form = new FormData();
            // ALWAYS send strings (never null/undefined) so backend stores ''
            form.append('title',          base.title || '');
            form.append('visibility',     visibility || 'public');
            form.append('lost_or_found',  lostFound || '');
            if (reward) form.append('reward', parseFloat(reward).toString());
            form.append('description',    base.description || '');
            form.append('street_address', addr.streetAddress || '');
            form.append('city',           base.city || '');
            form.append('county',         base.county || '');
            form.append('latitude',       lat ?? '');
            form.append('longitude',      lng ?? '');
            base.photos.filter(Boolean).forEach(p => form.append('photos', p.file));

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

    /* ───────── render ───────── */
    return (
        <>
            <DialogTitle>New Lost &amp; Found Post</DialogTitle>

            <DialogContent
                component="form"
                autoComplete="off"
                dividers
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
                {base.error && <Alert severity="error">{base.error}</Alert>}

                {/* Title */}
                <TextField
                    label="Title" required fullWidth
                    value={base.title}
                    onChange={e => base.setTitle(e.target.value)}
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
                        onChange={e => setVisibility(e.target.value)}
                    >
                        <MenuItem value="public">
                            <PublicIcon fontSize="small" sx={{ mr: 1 }} /> Public
                        </MenuItem>
                        <MenuItem value="followers">
                            <GroupIcon fontSize="small" sx={{ mr: 1 }} /> Followers Only
                        </MenuItem>
                    </Select>
                </FormControl>

                {/* Lost / Found + Reward */}
                <Box display="flex" alignItems="center" gap={2}>
                    <FormControl component="fieldset" required>
                        <FormLabel>Type</FormLabel>
                        <RadioGroup
                            row
                            value={lostFound}
                            onChange={e => {
                                const v = e.target.value;
                                setLostFound(v);
                                if (v === 'found') setReward(''); // clear reward when switching to Found
                            }}
                        >
                            <FormControlLabel value="lost"  control={<Radio />} label="Lost"  />
                            <FormControlLabel value="found" control={<Radio />} label="Found" />
                        </RadioGroup>
                    </FormControl>

                    {lostFound === 'lost' && (
                        <TextField
                            label="Reward (Optional)"
                            value={reward}
                            onChange={handleRewardChange}
                            onBlur={handleRewardBlur}
                            inputProps={{
                                inputMode: 'decimal',
                                pattern: '^\\d*(\\.\\d{0,2})?$',
                                maxLength: MAX_REWARD_LENGTH
                            }}
                            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                            sx={{ width: 160 }}
                        />
                    )}
                </Box>

                {/* City / County */}
                <CityCountySelect
                    city={base.city}
                    setCity={val => { base.setCity(val); setCityTouched(true); }}
                    county={base.county}
                    setCounty={val => { base.setCounty(val); setCountyTouched(true); }}
                    cityError={addr.cityRequired && (cityTouched || base.attemptedSubmit) && !base.city ?
                        'Required when address entered.' : ''}
                    countyError={(countyTouched || base.attemptedSubmit) && !base.county ?
                        'County is required.' : ''}
                />

                {/* Street Address */}
                <TextField
                    label="Street Address (Optional)" fullWidth
                    name="lf-street-address"
                    autoComplete="nope"
                    value={addr.streetAddress}
                    onChange={e => addr.setStreetAddress(e.target.value)}
                />

                {/* Description */}
                <TextField
                    label="Description" multiline rows={4} fullWidth
                    value={base.description}
                    onChange={e => base.setDescription(e.target.value)}
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
                                        justifyContent: 'center'
                                    }}
                                >
                                    <CloudUploadIcon />
                                </Box>
                            </label>
                        )
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
