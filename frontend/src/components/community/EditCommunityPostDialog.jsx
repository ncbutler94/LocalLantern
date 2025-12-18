import React, { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    IconButton,
    CircularProgress,
    Box,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import DeletePostConfirmDialog from './DeletePostConfirmDialog';

// New-post forms reused for edit mode
import NewAnnouncementForm from '../../pages/community/NewCommunityPosts/NewAnnouncementForm';
import NewGeneralDiscussionForm from '../../pages/community/NewCommunityPosts/NewGeneralDiscussionForm';
import NewLostAndFoundForm from '../../pages/community/NewCommunityPosts/NewLostAndFoundForm';
import NewRecommendationForm from '../../pages/community/NewCommunityPosts/NewRecommendationForm';
import NewPublicSafetyForm from '../../pages/community/NewCommunityPosts/NewPublicSafetyForm';
import NewVolunteerHelpForm from '../../pages/community/NewCommunityPosts/NewVolunteerHelpForm';

/**
 * EditCommunityPostDialog
 *
 * - Loads post by id
 * - Renders correct form based on category
 * - Saves via PATCH /api/community/:id
 *   • If form calls onSubmit(payloadObject) => we send JSON
 *   • If form calls onSubmit(FormData)      => we send multipart (future)
 * - Uses shared DeletePostConfirmDialog
 * - Emits global events:
 *    ll:communityPost:updated
 *    ll:communityPost:deleted
 */
export default function EditCommunityPostDialog({ open, postId, onClose }) {
    const [loading, setLoading] = useState(false);
    const [post, setPost] = useState(null);
    const [error, setError] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Reset when dialog closes
    useEffect(() => {
        if (!open) {
            setPost(null);
            setError('');
            setDeleteOpen(false);
            setLoading(false);
        }
    }, [open]);

    // Load post
    useEffect(() => {
        if (!open || !postId) return;

        let alive = true;
        setLoading(true);
        setError('');

        fetch(`/api/community/${postId}`, {
            credentials: 'include',
        })
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(
                        res.status === 404
                            ? 'The post you are trying to find does not exist or has been deleted.'
                            : 'Failed to load post.'
                    );
                }
                return res.json();
            })
            .then((data) => {
                if (!alive) return;
                setPost(data);
            })
            .catch((err) => {
                if (!alive) return;
                setError(err?.message || 'Failed to load post.');
            })
            .finally(() => {
                if (alive) setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [open, postId]);

    const category = post?.category || '';

    const patchPost = async (payloadOrFormData) => {
        let res;

        // JSON payload path (current edit-mode forms send plain objects)
        if (payloadOrFormData && typeof payloadOrFormData === 'object' && !(payloadOrFormData instanceof FormData)) {
            res = await fetch(`/api/community/${postId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadOrFormData),
                credentials: 'include',
            });
        } else {
            // FormData path (reserved for future multipart edit uploads)
            res = await fetch(`/api/community/${postId}`, {
                method: 'PATCH',
                body: payloadOrFormData,
                credentials: 'include',
            });
        }

        if (!res.ok) {
            const msg = (await res.text()) || 'Failed to save changes.';
            throw new Error(msg);
        }

        const updated = await res.json();

        window.dispatchEvent(
            new CustomEvent('ll:communityPost:updated', {
                detail: { post: updated },
            })
        );

        onClose();
    };

    const commonProps = useMemo(() => {
        if (!post) return null;
        return {
            onClose,
            onSubmit: patchPost,
            onRefresh: null,
            defaultCity: post.city || '',
            defaultCounty: post.county || '',
            countyRequired: true,
            editMode: true,
            initialData: post,
            onDelete: () => setDeleteOpen(true),
        };
    }, [post, onClose]);

    const renderForm = () => {
        if (!post || !commonProps) return null;

        switch (category) {
            case 'announcement':
            case 'announcements':
                return <NewAnnouncementForm {...commonProps} />;

            case 'general-discussion':
            case 'discussion':
                return <NewGeneralDiscussionForm {...commonProps} />;

            case 'lost-and-found':
            case 'lost-found':
                return <NewLostAndFoundForm {...commonProps} />;

            case 'recommendations-tips':
            case 'recommendations':
            case 'tips':
                return <NewRecommendationForm {...commonProps} />;

            case 'public-safety-alerts':
                return <NewPublicSafetyForm {...commonProps} />;

            case 'volunteer-help':
            case 'volunteer-help-requests':
            case 'volunteer-requests':
            case 'help-requests':
            case 'volunteers':
                return <NewVolunteerHelpForm {...commonProps} />;

            default:
                return (
                    <Box p={3}>
                        <Typography color="error">Unsupported post type.</Typography>
                    </Box>
                );
        }
    };

    return (
        <>
            <Dialog
                open={open}
                fullWidth
                maxWidth="sm"
                onClose={(_, reason) => {
                    if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') onClose();
                }}
                PaperProps={{ sx: { position: 'relative' } }}
            >
                <IconButton
                    onClick={onClose}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'rgba(0,0,0,0.05)',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                        zIndex: 2,
                    }}
                    aria-label="Close"
                >
                    <CloseIcon />
                </IconButton>

                {loading ? (
                    <Box p={4} display="flex" justifyContent="center">
                        <CircularProgress />
                    </Box>
                ) : null}

                {!loading && error ? (
                    <Box p={3}>
                        <Typography color="error">{error}</Typography>
                    </Box>
                ) : null}

                {!loading && !error ? renderForm() : null}
            </Dialog>

            <DeletePostConfirmDialog
                open={deleteOpen}
                postId={postId}
                onClose={() => setDeleteOpen(false)}
                onDeleted={() => {
                    window.dispatchEvent(
                        new CustomEvent('ll:communityPost:deleted', {
                            detail: { postId },
                        })
                    );
                    setDeleteOpen(false);
                    onClose();
                }}
            />
        </>
    );
}