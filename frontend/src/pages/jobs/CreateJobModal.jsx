// src/components/SidePanel/Jobs/CreateJobModal.jsx
import React, { useMemo, useState } from 'react';
import {
    DialogTitle, DialogContent, DialogActions,
    Box, Typography, TextField, Button, Tooltip,
    FormControl, InputLabel, Select, MenuItem,
    InputAdornment, Checkbox, FormControlLabel, Alert
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

import CityCountySelect from '../../components/CityCountySelect';
import useAddressHelpers from '../../components/useAddressHelpers';

const MAX_TITLE = 65;
const MAX_DESC  = 10000;

export default function CreateJobModal({ onClose, onCreated }) {
    // core fields
    const [title, setTitle]             = useState('');
    const [employer, setEmployer]       = useState('');
    const [category, setCategory]       = useState('');
    const [employmentType, setEmpType]  = useState('');
    const [experience, setExperience]   = useState('');
    const [applyUrl, setApplyUrl]       = useState('');
    const [description, setDescription] = useState('');
    const [expiresAt, setExpiresAt]     = useState('');
    const [remote, setRemote]           = useState(false);

    // location
    const [county, setCounty]           = useState('');
    const [city, setCity]               = useState('');
    const addr                          = useAddressHelpers({ city, county });

    // pay
    const [pay, setPay]                 = useState('');           // string for controlled decimal
    const [payUnit, setPayUnit]         = useState('salary');     // 'salary' | 'hourly'

    // photo (single)
    const [photoFile, setPhotoFile]     = useState(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const [error, setError]             = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [attempted, setAttempted]     = useState(false);

    // simple local lists (categories match the API’s set)
    const categories = useMemo(
        () => [
            'Administrative','Accounting & Finance','Arts & Design','Business Operations',
            'Community & Social Services','Construction','Customer Support','Data Science',
            'Education','Engineering','Food Service','Government','Healthcare','Hospitality',
            'HR & Recruiting','IT & Help Desk','Legal','Logistics & Supply Chain','Maintenance & Repair',
            'Manufacturing','Marketing','Media & Communications','Nonprofit','Project Management',
            'Real Estate','Retail','Sales','Security','Software Development','Transportation','Warehouse','Other',
        ],
        []
    );

    const types = [
        { id: 'full-time', label: 'Full time' },
        { id: 'part-time', label: 'Part time' },
        { id: 'contract', label: 'Contract' },
        { id: 'temporary', label: 'Temporary' },
        { id: 'seasonal', label: 'Seasonal' },
        { id: 'internship', label: 'Internship' },
    ];

    const experiences = [
        { id: '0-1', label: '0–1 yrs' },
        { id: '2-3', label: '2–3 yrs' },
        { id: '4-6', label: '4–6 yrs' },
        { id: '7-10', label: '7–10 yrs' },
        { id: '10+', label: '10+ yrs' },
    ];

    const canSubmit =
        title.trim() &&
        county.trim() &&
        (!addr.cityRequired || city.trim()) &&
        !submitting;

    const tooltipMsg =
        !title.trim() ? 'Title is required.' :
            !county.trim() ? 'County is required.' :
                (addr.cityRequired && !city.trim()) ? 'City required when address is entered.' :
                    '';

    const handlePayChange = (e) => {
        const v = e.target.value;
        // allow up to 2 decimal places
        if (/^\d{0,9}(\.\d{0,2})?$/.test(v)) setPay(v);
    };
    const handlePayBlur = () => {
        if (!pay) return;
        let v = pay.endsWith('.') ? pay.slice(0, -1) : pay;
        if (v.includes('.')) {
            const [i, d] = v.split('.');
            setPay(`${i || '0'}.${(d || '').padEnd(2, '0').slice(0, 2)}`);
        } else {
            setPay(`${v}.00`);
        }
    };

    const onPickPhoto = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoFile(file);
        const url = URL.createObjectURL(file);
        setPhotoPreview(url);
    };

    async function handlePost() {
        setAttempted(true);
        setError('');
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const [lat, lng] = await addr.resolveCoordinates();

            const form = new FormData();
            form.append('title', title.trim());
            form.append('employer', employer.trim());
            form.append('category', category ? category.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and') : '');
            form.append('employment_type', employmentType || '');
            form.append('experience_level', experience || '');
            form.append('remote', remote ? '1' : '0');
            form.append('apply_url', applyUrl || '');
            form.append('street_address', addr.streetAddress || '');
            form.append('city', city || '');
            form.append('county', county || '');
            form.append('latitude', String(lat ?? ''));
            form.append('longitude', String(lng ?? ''));
            form.append('description', description || '');
            if (expiresAt) form.append('expires_at', expiresAt);

            // new pay fields
            if (pay) form.append('salary', parseFloat(pay).toString());
            form.append('pay_unit', payUnit);

            // optional photo
            if (photoFile) form.append('photo', photoFile, photoFile.name);

            const res = await fetch('/api/jobs', {
                method: 'POST',
                body: form,
                credentials: 'include',
            });
            if (!res.ok) {
                const msg = (await res.text()) || 'Failed to post job.';
                throw new Error(msg);
            }
            const { id } = await res.json();
            if (typeof onCreated === 'function') onCreated(id);
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.message || 'There was an error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            {/* NOTE: No X in the top‑right—Cancel is the exit. */}
            <DialogTitle>Post a Job</DialogTitle>

            <DialogContent
                component="form"
                autoComplete="off"
                dividers
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
                {error && <Alert severity="error">{error}</Alert>}

                {/* Title */}
                <TextField
                    label="Job title *"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                    inputProps={{ maxLength: MAX_TITLE }}
                    fullWidth
                    required
                />
                <Typography variant="caption">{title.length} / {MAX_TITLE}</Typography>

                {/* Employer */}
                <TextField
                    label="Employer"
                    value={employer}
                    onChange={(e) => setEmployer(e.target.value.slice(0, 255))}
                    fullWidth
                />

                {/* Category */}
                <FormControl fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                        <MenuItem value=""><em>— Select —</em></MenuItem>
                        {categories.map((c) => (
                            <MenuItem key={c} value={c}>{c}</MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Type / Experience */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <FormControl sx={{ flex: 1, minWidth: 200 }}>
                        <InputLabel>Type</InputLabel>
                        <Select
                            label="Type"
                            value={employmentType}
                            onChange={(e) => setEmpType(e.target.value)}
                        >
                            <MenuItem value=""><em>— Select —</em></MenuItem>
                            {types.map((t) => (
                                <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl sx={{ flex: 1, minWidth: 200 }}>
                        <InputLabel>Experience</InputLabel>
                        <Select
                            label="Experience"
                            value={experience}
                            onChange={(e) => setExperience(e.target.value)}
                        >
                            <MenuItem value=""><em>— Select —</em></MenuItem>
                            {experiences.map((e) => (
                                <MenuItem key={e.id} value={e.id}>{e.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {/* Street address (optional) */}
                <TextField
                    label="Street address (optional)"
                    value={addr.streetAddress}
                    onChange={(e) => addr.setStreetAddress(e.target.value.slice(0, 255))}
                    fullWidth
                />

                {/* County + City + Remote (same line) */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 260 }}>
                        <CityCountySelect
                            city={city}
                            setCity={setCity}
                            county={county}
                            setCounty={setCounty}
                            cityError={addr.cityRequired && (attempted && !city) ? 'Required when address entered.' : ''}
                            countyError={(attempted && !county) ? 'County is required.' : ''}
                        />
                    </Box>
                    <FormControlLabel
                        control={<Checkbox checked={remote} onChange={(e) => setRemote(e.target.checked)} />}
                        label="Remote"
                    />
                </Box>

                {/* Apply URL */}
                <TextField
                    label="Apply URL"
                    value={applyUrl}
                    onChange={(e) => setApplyUrl(e.target.value.slice(0, 512))}
                    fullWidth
                />

                {/* Pay + Unit */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        label="Pay"
                        value={pay}
                        onChange={handlePayChange}
                        onBlur={handlePayBlur}
                        placeholder="0.00"
                        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                        inputProps={{ inputMode: 'decimal', pattern: '^\\d*(\\.\\d{0,2})?$', maxLength: 12 }}
                        sx={{ flex: 1, minWidth: 180 }}
                    />
                    <FormControl sx={{ width: 180, minWidth: 160 }}>
                        <InputLabel>Unit</InputLabel>
                        <Select label="Unit" value={payUnit} onChange={(e) => setPayUnit(e.target.value)}>
                            <MenuItem value="salary">Per year</MenuItem>
                            <MenuItem value="hourly">Per hour</MenuItem>
                            <MenuItem value="project">Per project</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
                <Typography variant="caption">Annual amount in USD if “Per year”.</Typography>

                {/* Expires at */}
                <TextField
                    label="Expires at"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 240 }}
                />

                {/* Photo (single) */}
                <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Photo (optional)</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <label style={{ cursor: 'pointer' }}>
                            <input hidden accept="image/*" type="file" onChange={onPickPhoto} />
                            <Box
                                sx={{
                                    width: 120, height: 120, border: '2px dashed grey', borderRadius: 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <CloudUploadIcon />
                            </Box>
                        </label>
                        {photoPreview && (
                            <Box component="img" src={photoPreview} alt="" sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 1 }} />
                        )}
                    </Box>
                </Box>

                {/* Description (fixed height, scrollable, not resizable) */}
                <TextField
                    label="Description"
                    multiline
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                    fullWidth
                    inputProps={{ maxLength: MAX_DESC, style: { height: 220, overflow: 'auto' } }}
                    sx={{
                        '& .MuiInputBase-input': { resize: 'none' },
                    }}
                />
                <Typography variant="caption">{description.length} / {MAX_DESC}</Typography>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Tooltip title={tooltipMsg} disableHoverListener={!tooltipMsg}>
          <span>
            <Button variant="contained" onClick={handlePost} disabled={!canSubmit}>
              {submitting ? 'Posting…' : 'Post Job'}
            </Button>
          </span>
                </Tooltip>
                <Button variant="outlined" onClick={onClose} disabled={submitting}>
                    Cancel
                </Button>
            </DialogActions>
        </>
    );
}
