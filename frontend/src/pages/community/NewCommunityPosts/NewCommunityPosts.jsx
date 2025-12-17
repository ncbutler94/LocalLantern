// src/components/SidePanel/Community/NewCommunityPosts/NewCommunityPosts.jsx
import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Box,
    Typography,
    Tooltip
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CityCountySelect from '../../../components/CityCountySelect';

const MAX_TITLE       = 100;
const MAX_ADDRESS     = 100;
const MAX_DESCRIPTION = 500;

export default function NewCommunityPosts({ open, onClose, onNext }) {
    const [title, setTitle]         = useState('');
    const [date, setDate]           = useState('');
    const [city, setCity]           = useState('');
    const [county, setCounty]       = useState('');
    const [address, setAddress]     = useState('');
    const [description, setDescription] = useState('');
    const [latitude, setLatitude]   = useState(null);
    const [longitude, setLongitude] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Whenever address/city/county change, re-geocode
    useEffect(() => {
        if (!address.trim()) return;

        const fullAddress = [
            address,
            city    && `, ${city}`,
            county  && `, ${county}`
        ].filter(Boolean).join('');

        fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?` +
            `address=${encodeURIComponent(fullAddress)}` +
            `&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`
        )
            .then(res => res.json())
            .then(data => {
                if (data.status === 'OK' && data.results.length) {
                    const loc = data.results[0].geometry.location;
                    setLatitude(loc.lat);
                    setLongitude(loc.lng);
                }
            })
            .catch(console.error);
    }, [address, city, county]);

    const handleFileChange = e => {
        if (e.target.files.length) {
            setUploading(true);
            setTimeout(() => setUploading(false), 1000);
        }
    };

    const isNextDisabled = !title.trim() || uploading;
    const tooltipMsg = !title.trim()
        ? 'Please enter a title.'
        : uploading
            ? 'Image is still uploading.'
            : '';

    const handleNext = () => {
        onNext({
            title,
            date,
            city,
            county,
            address,
            description,
            latitude,
            longitude
        });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>New Community Post</DialogTitle>
            <DialogContent dividers>
                <Box display="flex" flexDirection="column" gap={2} py={1}>
                    {/* Title */}
                    <Box>
                        <TextField
                            label="Title"
                            fullWidth
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            inputProps={{ maxLength: MAX_TITLE }}
                        />
                        <Typography variant="caption">
                            {title.length} / {MAX_TITLE}
                        </Typography>
                    </Box>

                    {/* Date */}
                    <Box>
                        <TextField
                            label="Date"
                            type="date"
                            fullWidth
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Box>

                    {/* City & County */}
                    <Box>
                        <CityCountySelect
                            city={city}
                            setCity={setCity}
                            county={county}
                            setCounty={setCounty}
                        />
                    </Box>

                    {/* Street Address */}
                    <Box>
                        <TextField
                            label="Street Address"
                            fullWidth
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            inputProps={{ maxLength: MAX_ADDRESS }}
                        />
                        <Typography variant="caption">
                            {address.length} / {MAX_ADDRESS}
                        </Typography>
                    </Box>

                    {/* Description */}
                    <Box>
                        <TextField
                            label="Description"
                            fullWidth
                            multiline
                            rows={4}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            inputProps={{ maxLength: MAX_DESCRIPTION }}
                        />
                        <Typography variant="caption">
                            {description.length} / {MAX_DESCRIPTION}
                        </Typography>
                    </Box>

                    {/* Image Upload */}
                    <Box display="flex" gap={1}>
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <label key={idx}>
                                <input type="file" hidden onChange={handleFileChange} />
                                <Box
                                    sx={{
                                        width: 80, height: 80,
                                        border: '2px dashed',
                                        borderColor: 'grey.500',
                                        bgcolor: 'grey.100',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 1,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <CloudUploadIcon fontSize="large" />
                                </Box>
                            </label>
                        ))}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, mb: 2 }}>
                <Tooltip title={tooltipMsg} disableHoverListener={!isNextDisabled}>
          <span>
            <Button
                variant="contained"
                disabled={isNextDisabled}
                onClick={handleNext}
            >
              Next
            </Button>
          </span>
                </Tooltip>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}
