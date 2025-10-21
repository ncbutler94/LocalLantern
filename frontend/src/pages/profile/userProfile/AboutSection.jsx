// src/pages/profile/userProfile/AboutSection.jsx
import React from 'react';
import { Box, Card, CardContent, Divider, IconButton, MenuItem, TextField, Typography, Button } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import CakeIcon from '@mui/icons-material/Cake';
import FavoriteIcon from '@mui/icons-material/Favorite';

const REL_OPTIONS = [
    { value: '', label: 'Prefer not to say' },
    { value: 'single', label: 'Single' },
    { value: 'in-relationship', label: 'In a relationship' },
    { value: 'married', label: 'Married' },
    { value: 'its-complicated', label: 'It’s complicated' },
];

const REL_LABEL = {
    'single': 'Single',
    'in-relationship': 'In a relationship',
    'married': 'Married',
    'its-complicated': 'It’s complicated',
    'prefer-not': 'Prefer not to say',
    '': 'Prefer not to say',
};

export default function AboutSection({
                                         editMode,
                                         profile,
                                         bioDraft, setBioDraft,
                                         relationship, setRelationship,
                                         birthday, setBirthday,
                                         onPrivacy,
                                     }) {
    return (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                <Typography variant="h6">About Me</Typography>
                {editMode && (
                    <Button size="small" startIcon={<PublicIcon />} onClick={(e) => onPrivacy(e, 'about')}>
                        Edit Privacy
                    </Button>
                )}
            </Box>
            <Divider />
            <CardContent sx={{ p: 1.5 }}>
                {editMode ? (
                    <Box sx={{ display: 'grid', gap: 2, maxWidth: 900 }}>
                        {/* Bio + privacy */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>Bio</Typography>
                            <IconButton size="small" onClick={(e) => onPrivacy(e, 'bio')}><PublicIcon fontSize="small" /></IconButton>
                        </Box>
                        <TextField
                            value={bioDraft}
                            onChange={(e) => setBioDraft(e.target.value.slice(0, 500))}
                            multiline
                            minRows={5}
                            fullWidth
                            inputProps={{ maxLength: 500, style: { resize: 'none' } }}
                            helperText={`${500 - bioDraft.length} characters remaining`}
                        />

                        {/* Relationship with privacy */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>Relationship</Typography>
                            <IconButton size="small" onClick={(e) => onPrivacy(e, 'relationship')}><PublicIcon fontSize="small" /></IconButton>
                        </Box>
                        <TextField select value={relationship} onChange={(e) => setRelationship(e.target.value)} fullWidth>
                            {REL_OPTIONS.map((o) => <MenuItem key={o.value || '__'} value={o.value}>{o.label}</MenuItem>)}
                        </TextField>

                        {/* Birthday with privacy */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>Birthday</Typography>
                            <IconButton size="small" onClick={(e) => onPrivacy(e, 'birthday')}><PublicIcon fontSize="small" /></IconButton>
                        </Box>
                        <TextField type="date" value={birthday || ''} onChange={(e) => setBirthday(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                    </Box>
                ) : (
                    <>
                        <Typography
                            sx={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                mb: 1.5,
                            }}
                        >
                            {profile.bio || 'No bio yet.'}
                        </Typography>

                        <Box sx={{ display: 'grid', gap: 1.25 }}>
                            {profile.birthday && (
                                <Typography><CakeIcon sx={{ mr: 0.5, verticalAlign: 'middle' }} /> <b>Birthday:</b> {new Date(profile.birthday).toLocaleDateString()}</Typography>
                            )}
                            {profile.relationship && (
                                <Typography><FavoriteIcon sx={{ mr: 0.5, verticalAlign: 'middle' }} color="error" /> <b>Relationship:</b> {REL_LABEL[profile.relationship] || profile.relationship}</Typography>
                            )}
                        </Box>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
