// src/pages/ResetPasswordPage.jsx
import React, { useMemo, useState } from 'react';
import axios from 'axios';
import {
    Box,
    Button,
    Container,
    Paper,
    TextField,
    Typography,
    Link,
    Divider,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import LocalLanternLogo from '../assets/LocalLanternLogo.png';

const passwordRegex = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{10,20}$/;

function useQueryToken() {
    const location = useLocation();
    return useMemo(() => {
        const sp = new URLSearchParams(location.search);
        return (sp.get('token') || '').trim();
    }, [location.search]);
}

export default function ResetPasswordPage() {
    const token = useQueryToken();
    const navigate = useNavigate();

    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');

        if (!token) {
            setError('This password reset link is missing a token. Please request a new reset email.');
            return;
        }

        if (!passwordRegex.test(newPassword)) {
            setError('Password must be 10–20 characters and include at least 1 uppercase letter and 1 special character.');
            return;
        }

        if (newPassword !== confirm) {
            setError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            await axios.post(
                `${process.env.REACT_APP_API_URL}/auth/reset-password`,
                { token, password: newPassword },
                { withCredentials: true }
            );

            setSuccess(true);
        } catch (err) {
            setError(err?.response?.data?.message || 'Unable to reset password. Please request a new reset link.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Container
            maxWidth="sm"
            sx={{
                py: { xs: 3, sm: 6 },
            }}
        >
            <Paper
                elevation={2}
                sx={{
                    p: { xs: 2.5, sm: 4 },
                    borderRadius: 3,
                }}
            >
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                    <Box
                        component="img"
                        src={LocalLanternLogo}
                        alt="The Local Lantern"
                        sx={{
                            height: 56,
                            width: 'auto',
                            maxWidth: '100%',
                            mb: 1,
                        }}
                    />
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        Reset password
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
                        Create a new password for your account.
                    </Typography>
                </Box>

                <Divider sx={{ mb: 2 }} />

                {success ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography sx={{ textAlign: 'center' }}>
                            Your password has been successfully reset.
                        </Typography>

                        <Button
                            variant="contained"
                            fullWidth
                            onClick={() => navigate('/login')}
                        >
                            Go to login
                        </Button>

                        <Box sx={{ textAlign: 'center' }}>
                            <Link component={RouterLink} to="/" underline="hover">
                                Return to home
                            </Link>
                        </Box>
                    </Box>
                ) : (
                    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {error && (
                            <Typography color="error" sx={{ textAlign: 'center' }}>
                                {error}
                            </Typography>
                        )}

                        <TextField
                            label="New password"
                            type="password"
                            fullWidth
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            inputProps={{ maxLength: 20 }}
                            helperText="10–20 characters, include 1 uppercase and 1 special character."
                        />

                        <TextField
                            label="Confirm new password"
                            type="password"
                            fullWidth
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            inputProps={{ maxLength: 20 }}
                        />

                        <Button type="submit" variant="contained" fullWidth disabled={submitting}>
                            {submitting ? 'Updating…' : 'Reset password'}
                        </Button>

                        <Box sx={{ textAlign: 'center' }}>
                            <Link component={RouterLink} to="/login" underline="hover">
                                Back to login
                            </Link>
                        </Box>
                    </Box>
                )}
            </Paper>
        </Container>
    );
}
