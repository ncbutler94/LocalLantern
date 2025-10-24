// src/pages/profile/userProfile/ProfileHeader.jsx
import React from 'react';
import { Avatar, Box, Button, Card, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';

export default function ProfileHeader({
                                          profile,
                                          avatarSrc,
                                          isMine,
                                          editMode,
                                          onEnterEdit,
                                          onSave,
                                          onCancel,
                                          onChangeAvatar,
                                          onDeleteAvatar,
                                          onChangeCover,
                                          onDeleteCover,
                                          viewer,
                                          isFollowing,
                                          onToggleFollow,
                                      }) {
    return (
        <>
            {(profile?.cover_url || (isMine && editMode)) && (
                <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2 }}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <Box
                            sx={{
                                height: 420,
                                background: profile?.cover_url ? `url(${profile.cover_url}) center/cover no-repeat` : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {!profile?.cover_url && isMine && editMode && (
                                <Button startIcon={<DriveFolderUploadIcon />} onClick={onChangeCover}>Add Cover Photo</Button>
                            )}
                        </Box>
                        {isMine && editMode && profile?.cover_url && (
                            <Box sx={{ display: 'flex', gap: 1, p: 1, justifyContent: 'flex-end' }}>
                                <Button startIcon={<DriveFolderUploadIcon />} onClick={onChangeCover}>Change Cover Photo</Button>
                                <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={onDeleteCover}>
                                    Delete Cover Photo
                                </Button>
                            </Box>
                        )}
                    </Card>
                </Box>
            )}

            <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2, mt: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', position: 'relative' }}>
                    {/* Avatar + overlay icons during Edit mode */}
                    <Box sx={{ position: 'relative', width: 120, height: 120 }}>
                        <Avatar
                            src={avatarSrc}
                            alt={`${profile.first_name} ${profile.last_name}`}
                            sx={{ width: 120, height: 120, border: '3px solid #fff' }}
                        />
                        {isMine && editMode && (
                            <>
                                <Tooltip title="Change profile picture">
                                    <IconButton
                                        size="small"
                                        onClick={onChangeAvatar}
                                        sx={{
                                            position: 'absolute', bottom: 4, right: 4,
                                            bgcolor: 'rgba(255,255,255,0.85)',
                                        }}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                {avatarSrc && (
                                    <Tooltip title="Delete profile picture">
                                        <IconButton
                                            size="small"
                                            onClick={onDeleteAvatar}
                                            sx={{
                                                position: 'absolute', top: 4, right: 4,
                                                bgcolor: 'rgba(255,255,255,0.85)',
                                            }}
                                        >
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </>
                        )}
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                            {profile.first_name} {profile.last_name}
                        </Typography>
                        {profile.handle && <Chip size="small" label={`@${profile.handle}`} sx={{ mt: 0.5 }} />}
                    </Box>

                    {/* actions (right aligned) */}
                    <Box sx={{ marginLeft: 'auto', display: 'flex', gap: 1 }}>
                        {!isMine && viewer && (
                            <>
                                <Button
                                    size="small"
                                    variant={isFollowing ? 'outlined' : 'contained'}
                                    color={isFollowing ? 'inherit' : 'primary'}
                                    startIcon={<PersonAddAlt1Icon />}
                                    onClick={onToggleFollow}
                                    disabled={isFollowing}
                                >
                                    {isFollowing ? 'Following' : 'Follow'}
                                </Button>
                                {isFollowing && (
                                    <Button size="small" variant="outlined" startIcon={<MailOutlineIcon />}>
                                        Message
                                    </Button>
                                )}
                            </>
                        )}

                        {isMine && (
                            editMode ? (
                                <>
                                    <Button startIcon={<SaveIcon />} onClick={onSave} variant="contained">Save Profile</Button>
                                    <Button startIcon={<CloseIcon />} onClick={onCancel}>Cancel</Button>
                                </>
                            ) : (
                                <Button startIcon={<EditIcon />} onClick={onEnterEdit} variant="contained">Edit Profile</Button>
                            )
                        )}
                    </Box>
                </Box>
            </Box>
        </>
    );
}
