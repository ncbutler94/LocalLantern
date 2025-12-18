import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Button,
    IconButton,
    Box,
    CircularProgress,
    Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * DeletePostConfirmDialog
 *
 * Shared reusable delete confirmation dialog.
 * Requirements:
 * - Has an X in the top-right.
 * - Does NOT close by clicking outside.
 * - Shows success/error within the popup.
 *
 * Props:
 * - open: boolean
 * - postId: number | string
 * - onClose: () => void
 * - onDeleted?: () => void  (fires after successful delete)
 * - postTitle?: string      (optional, for nicer wording)
 */
export default function DeletePostConfirmDialog({
                                                    open,
                                                    postId,
                                                    onClose,
                                                    onDeleted,
                                                    postTitle = '',
                                                }) {
    const [submitting, setSubmitting] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState('');
    const [successMsg, setSuccessMsg] = React.useState('');

    React.useEffect(() => {
        if (!open) {
            setSubmitting(false);
            setErrorMsg('');
            setSuccessMsg('');
        }
    }, [open]);

    const safeClose = React.useCallback(() => {
        if (submitting) return;
        onClose();
    }, [onClose, submitting]);

    const handleConfirm = React.useCallback(async () => {
        if (submitting) return;
        setErrorMsg('');
        setSuccessMsg('');

        const idNum = Number(postId);
        if (!Number.isFinite(idNum) || idNum <= 0) {
            setErrorMsg('Delete action is not available.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/community/${idNum}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to delete the post.');
            }

            let data = null;
            try {
                data = await res.json();
            } catch {
                data = { ok: true };
            }

            const ok = data && typeof data === 'object' && 'ok' in data ? !!data.ok : true;

            if (!ok) {
                setErrorMsg('Failed to delete the post.');
                return;
            }

            setSuccessMsg('Post successfully deleted.');

            if (typeof onDeleted === 'function') {
                try {
                    onDeleted();
                } catch {
                    // ignore
                }
            }
        } catch (err) {
            setErrorMsg(err?.message || 'Failed to delete the post.');
        } finally {
            setSubmitting(false);
        }
    }, [onDeleted, postId, submitting]);

    const titleLine = postTitle
        ? `Delete “${String(postTitle).slice(0, 80)}”?`
        : 'Delete this post?';

    return (
        <Dialog
            open={open}
            onClose={(_, reason) => {
                if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
                safeClose();
            }}
            fullWidth
            maxWidth="xs"
            PaperProps={{ sx: { borderRadius: 3, position: 'relative' } }}
        >
            <IconButton
                aria-label="Close"
                onClick={safeClose}
                sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    bgcolor: 'rgba(0,0,0,0.05)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                    zIndex: 2,
                }}
                disabled={submitting}
            >
                <CloseIcon />
            </IconButton>

            <DialogTitle sx={{ pr: 5, fontWeight: 900 }}>{titleLine}</DialogTitle>

            <DialogContent dividers sx={{ pt: 2 }}>
                {errorMsg ? (
                    <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                        {errorMsg}
                    </Alert>
                ) : null}

                {successMsg ? (
                    <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                        {successMsg}
                    </Alert>
                ) : null}

                <Typography variant="body2" color="text.secondary">
                    This action cannot be undone.
                </Typography>

                {submitting ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">
                            Deleting…
                        </Typography>
                    </Box>
                ) : null}
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, p: 2 }}>
                <Button
                    variant="outlined"
                    onClick={safeClose}
                    disabled={submitting}
                    sx={{ fontWeight: 800, borderRadius: 999, px: 3 }}
                >
                    {successMsg ? 'Close' : 'Cancel'}
                </Button>

                {!successMsg ? (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleConfirm}
                        disabled={submitting}
                        sx={{ fontWeight: 900, borderRadius: 999, px: 3 }}
                    >
                        {submitting ? <CircularProgress size={20} /> : 'Delete Post'}
                    </Button>
                ) : null}
            </DialogActions>
        </Dialog>
    );
}