// src/components/Login.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Box,
    TextField,
    Button,
    Typography,
    Link,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm({
                                      onLogin,
                                      showTitle = false,
                                      title = 'Log in to continue',
                                      onTitleChange = null,
                                  }) {
    // view: 'login' | 'forgot' | 'forgotSent'
    const [view, setView] = useState('login');

    // login state
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginSubmitting, setLoginSubmitting] = useState(false);

    // forgot state
    const [identifier, setIdentifier] = useState('');
    const [forgotError, setForgotError] = useState('');
    const [forgotSubmitting, setForgotSubmitting] = useState(false);
    const [forgotAck, setForgotAck] = useState('');

    const location = useLocation();
    const navigate = useNavigate();
    const isLoginPage = location.pathname === '/login';

    const isForgotFlow = view === 'forgot' || view === 'forgotSent';
    const headerText = view === 'login' ? title : 'Forgot Password';

    useEffect(() => {
        if (typeof onTitleChange === 'function') {
            onTitleChange(headerText);
        }
    }, [headerText, onTitleChange]);

    const startForgot = () => {
        setLoginError('');
        setForgotError('');
        setForgotAck('');

        const prefill = String(login || '').trim();
        setIdentifier(prefill);
        setView('forgot');
    };

    const cancelForgot = () => {
        setForgotError('');
        setForgotAck('');
        setForgotSubmitting(false);
        setView('login');
    };

    const submitLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoginSubmitting(true);

        try {
            const res = await axios.post(
                `${process.env.REACT_APP_API_URL}/auth/login`,
                { login: login.trim(), password },
                { withCredentials: true }
            );

            if (onLogin) onLogin(res.data.user);

            if (isLoginPage) {
                navigate('/', { replace: true });
            }
        } catch (err) {
            setLoginError(err?.response?.data?.message || 'Login failed');
        } finally {
            setLoginSubmitting(false);
        }
    };

    const submitForgot = async (e) => {
        e.preventDefault();
        setForgotError('');
        setForgotAck('');

        const cleaned = String(identifier || '').trim();
        if (!cleaned) {
            setForgotError('Please enter your email address or username.');
            return;
        }

        setForgotSubmitting(true);
        try {
            await axios.post(
                `${process.env.REACT_APP_API_URL}/auth/forgot-password`,
                { login: cleaned },
                { withCredentials: true }
            );

            const isEmail = emailRegex.test(cleaned.toLowerCase());
            const ack = isEmail
                ? `If the email is associated with a The Local Lantern account, a password reset link will be sent to ${cleaned}.`
                : `If that username exists with a The Local Lantern account, an email will be sent to the email address on file.`;

            setForgotAck(ack);
            setView('forgotSent');
        } catch (err) {
            setForgotError(err?.response?.data?.message || 'Unable to send reset email. Please try again.');
        } finally {
            setForgotSubmitting(false);
        }
    };

    const paneBaseSx = {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
        transition: 'opacity 200ms ease, transform 200ms ease',
    };

    return (
        <Box
            sx={{
                width: '100%',
                maxWidth: 420,
                mx: 'auto',
                pt: 0, // ✅ remove extra top padding to prevent tiny overflow scroll
            }}
        >
            {showTitle && (
                <Typography
                    variant="h5"
                    align="center"
                    sx={{ fontWeight: 600, mb: 0.5 }}
                >
                    {headerText}
                </Typography>
            )}

            <Box
                sx={{
                    position: 'relative',
                    width: '100%',
                    minHeight: { xs: 300, sm: 270 }, // ✅ enough for both views, less likely to overflow dialog
                }}
            >
                {/* LOGIN PANE */}
                <Box
                    component="form"
                    onSubmit={submitLogin}
                    aria-hidden={isForgotFlow ? 'true' : 'false'}
                    sx={{
                        ...paneBaseSx,
                        opacity: isForgotFlow ? 0 : 1,
                        transform: isForgotFlow ? 'translateY(6px)' : 'translateY(0px)',
                        pointerEvents: isForgotFlow ? 'none' : 'auto',
                        visibility: isForgotFlow ? 'hidden' : 'visible',
                    }}
                >
                    {loginError && (
                        <Typography color="error" align="center">
                            {loginError}
                        </Typography>
                    )}

                    <TextField
                        variant="outlined"
                        label="Email or username"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        required
                        fullWidth
                        autoComplete="username"
                        inputProps={{ maxLength: 254 }}
                        InputLabelProps={{
                            shrink: true,
                            sx: { px: 0.5, backgroundColor: 'background.paper' },
                        }}
                        sx={{
                            overflow: 'visible',
                            '& .MuiOutlinedInput-root': { borderRadius: 2 },
                            '& .MuiInputLabel-root': { lineHeight: 1.2 },
                        }}
                    />

                    <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        fullWidth
                        autoComplete="current-password"
                        inputProps={{ maxLength: 128 }}
                        InputLabelProps={{
                            shrink: true,
                            sx: { px: 0.5, backgroundColor: 'background.paper' },
                        }}
                        sx={{
                            overflow: 'visible',
                            '& .MuiOutlinedInput-root': { borderRadius: 2 },
                        }}
                    />

                    <Box sx={{ textAlign: 'right' }}>
                        <Link
                            component="button"
                            type="button"
                            variant="body2"
                            onClick={startForgot}
                            sx={{ cursor: 'pointer' }}
                        >
                            Forgot password?
                        </Link>
                    </Box>

                    <Button type="submit" variant="contained" fullWidth disabled={loginSubmitting}>
                        {loginSubmitting ? 'Logging in…' : 'Login'}
                    </Button>

                    <Box sx={{ textAlign: 'center', mt: 2 }}>
                        <Typography variant="body2">
                            New here?{' '}
                            <Link component={RouterLink} to="/register" underline="hover">
                                Create an account
                            </Link>
                        </Typography>
                    </Box>
                </Box>

                {/* FORGOT PANE */}
                <Box
                    component="form"
                    onSubmit={submitForgot}
                    aria-hidden={isForgotFlow ? 'false' : 'true'}
                    sx={{
                        ...paneBaseSx,
                        opacity: isForgotFlow ? 1 : 0,
                        transform: isForgotFlow ? 'translateY(0px)' : 'translateY(6px)',
                        pointerEvents: isForgotFlow ? 'auto' : 'none',
                        visibility: isForgotFlow ? 'visible' : 'hidden',
                    }}
                >
                    {forgotError && (
                        <Typography color="error" align="center">
                            {forgotError}
                        </Typography>
                    )}

                    {view === 'forgotSent' ? (
                        <>
                            <Typography align="center" sx={{ lineHeight: 1.5 }}>
                                {forgotAck}
                            </Typography>

                            <Button
                                type="button"
                                variant="contained"
                                fullWidth
                                onClick={cancelForgot}
                            >
                                Back to login
                            </Button>
                        </>
                    ) : (
                        <>
                            <TextField
                                variant="outlined"
                                label="Enter your email address or username"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                                fullWidth
                                autoComplete="username"
                                inputProps={{ maxLength: 254 }}
                                InputLabelProps={{
                                    shrink: true,
                                    sx: { px: 0.5, backgroundColor: 'background.paper' },
                                }}
                                sx={{
                                    overflow: 'visible',
                                    '& .MuiOutlinedInput-root': { borderRadius: 2 },
                                    '& .MuiInputLabel-root': { lineHeight: 1.2 },
                                }}
                            />

                            <Box
                                sx={{
                                    display: 'flex',
                                    gap: 1.5,
                                    flexDirection: { xs: 'column', sm: 'row' },
                                }}
                            >
                                <Button
                                    type="submit"
                                    variant="contained"
                                    fullWidth
                                    disabled={forgotSubmitting}
                                >
                                    {forgotSubmitting ? 'Sending…' : 'Continue'}
                                </Button>

                                <Button
                                    type="button"
                                    variant="outlined"
                                    fullWidth
                                    onClick={cancelForgot}
                                    disabled={forgotSubmitting}
                                >
                                    Cancel
                                </Button>
                            </Box>

                            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
                                We’ll send a reset link if your account exists. For your security, we don’t confirm whether an account is registered.
                            </Typography>
                        </>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
