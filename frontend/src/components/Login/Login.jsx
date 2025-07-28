// src/components/Login/LoginForm.jsx

import React, { useState } from 'react';
import axios from 'axios';
import {
    Box,
    TextField,
    Button,
    Divider,
    Typography,
    Link
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

// 👇 Import the PNGs from your src/assets folder
import GooglePNG   from '../../assets/socialMedia/google.png';
import FacebookPNG from '../../assets/socialMedia/facebook.png';

export default function LoginForm({ onLogin, onCancel, onForgot }) {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');

    // current SPA URL for redirect
    const redirect = window.location.pathname + window.location.search;

    // handle email/password submission
    const submit = e => {
        e.preventDefault();
        axios
            .post(
                `${process.env.REACT_APP_API_URL}/auth/login`,
                { email, password },
                { withCredentials: true }
            )
            .then(res => onLogin(res.data.user))
            .catch(err => {
                setError(err.response?.data?.message || 'Login failed');
            });
    };

    // kick off social-flow
    const social = provider => {
        window.location.href =
            `${process.env.REACT_APP_API_URL}/auth/${provider}?redirect=` +
            encodeURIComponent(redirect);
    };

    return (
        <Box
            component="form"
            onSubmit={submit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
            {error && (
                <Typography color="error" align="center">
                    {error}
                </Typography>
            )}

            <TextField
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                fullWidth
                inputProps={{ maxLength: 254 }}
            />

            <TextField
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                fullWidth
                inputProps={{ maxLength: 128 }}
            />

            <Box sx={{ textAlign: 'right' }}>
                <Link
                    component="button"
                    variant="body2"
                    onClick={onForgot}
                >
                    Forgot password?
                </Link>
            </Box>

            <Button
                type="submit"
                variant="contained"
                fullWidth
            >
                Login
            </Button>

            <Box sx={{ my: 2, display: 'flex', alignItems: 'center' }}>
                <Divider sx={{ flexGrow: 1 }} />
                <Typography variant="body2" sx={{ mx: 2, color: 'text.secondary' }}>
                    or
                </Typography>
                <Divider sx={{ flexGrow: 1 }} />
            </Box>

            <Button
                variant="outlined"
                fullWidth
                onClick={() => social('google')}
                startIcon={
                    <Box
                        component="img"
                        src={GooglePNG}
                        alt="Google logo"
                        sx={{ width: 20, height: 20 }}
                    />
                }
                sx={{ mb: 1 }}
            >
                Continue with Google
            </Button>

            <Button
                variant="outlined"
                fullWidth
                onClick={() => social('facebook')}
                startIcon={
                    <Box
                        component="img"
                        src={FacebookPNG}
                        alt="Facebook logo"
                        sx={{ width: 20, height: 20 }}
                    />
                }
            >
                Continue with Facebook
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Typography variant="body2">
                    New here?{' '}
                    <Link
                        component={RouterLink}
                        to="/register"
                        underline="hover"
                    >
                        Create an account
                    </Link>
                </Typography>
            </Box>
        </Box>
    );
}
