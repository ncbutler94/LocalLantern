// src/components/Login.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Box,
    Container,
    Paper,
    TextField,
    Button,
    Typography,
    Link,
    Collapse,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm(props) {
    const {
        onLogin,
        showTitle = false,
        title = 'Log in to continue',
        onTitleChange = null,
    } = props;

    // Support multiple close prop names, since this form is often rendered inside different modals.
    const closeModal =
        props.onClose ||
        props.onRequestClose ||
        props.handleClose ||
        props.closeModal ||
        props.close ||
        null;

    const setOpen =
        props.setOpen ||
        props.setLoginOpen ||
        props.setIsOpen ||
        props.setModalOpen ||
        null;

    const doClose = () => {
        if (typeof closeModal === 'function') return closeModal();
        if (typeof setOpen === 'function') return setOpen(false);
        return undefined;
    };

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

    // If the user navigates away (e.g., to /register) while this modal is open,
    // proactively close the modal so it doesn't remain on top of the new page.
    useEffect(() => {
        if (location.pathname === '/register') {
            doClose();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

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

    const formBaseSx = {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
    };

    return (
        <Box
            sx={{
                minHeight: { xs: 'auto', md: 'calc(100vh - 120px)' },
                bgcolor: 'background.default',
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'flex-start' },
                pt: { xs: 2, sm: 2.5, md: 3.5 },
                pb: { xs: 2, sm: 2.5, md: 3.5 },
            }}
        >
            <Container maxWidth="sm" sx={{ px: { xs: 1.25, sm: 2 } }}>
                <Paper
                    elevation={0}
                    sx={{
                        width: '100%',
                        mx: 'auto',
                        overflow: 'hidden',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: (t) => alpha(t.palette.primary.main, 0.12),
                        bgcolor: (t) => alpha(t.palette.common.white, 0.80),
                        mt: { xs: 0, sm: 1.5, md: 2 },
                        backdropFilter: 'saturate(140%) blur(10px)',
                        backgroundImage: 'none',
                        boxShadow: (t) => `0 16px 46px ${alpha(t.palette.common.black, 0.10)}`,
                    }}
                >
                    <Box sx={{ p: { xs: 2.25, sm: 3, md: 4 } }}>
                        <Box sx={{ mb: 2.5, textAlign: 'center' }}>
                            <Typography
                                variant="h5"
                                sx={{ fontWeight: 900, letterSpacing: -0.3, mb: 0.75 }}
                            >
                                {headerText === 'Forgot Password' ? 'Forgot Password' : 'Log In'}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: 'text.secondary',
                                    maxWidth: 520,
                                    mx: 'auto',
                                }}
                            >
                                {headerText === 'Forgot Password'
                                    ? 'Enter your email or username and we’ll send a reset link if it matches an account.'
                                    : 'Welcome back! Log in to continue.'}
                            </Typography>
                        </Box>

                        {/*
                            ✅ FIX: The old layout used absolutely-positioned panes with a fixed minHeight,
                            which caused the bottom of the form to be clipped (appearing "hidden") whenever
                            an error message increased the form's height.
                            Using Collapse keeps the container height dynamic while still animating between views.
                        */}
                        <Box sx={{ width: '100%' }}>
                            {/* LOGIN PANE */}
                            <Collapse in={!isForgotFlow} timeout={200} unmountOnExit>
                                <Box component="form" onSubmit={submitLogin} sx={formBaseSx}>
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
                                        InputLabelProps={{ shrink: true }}
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
                                        InputLabelProps={{ shrink: true }}
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

                                    <Button
                                        type="submit"
                                        variant="contained"
                                        size="large"
                                        fullWidth
                                        disabled={loginSubmitting}
                                        sx={{ py: 1.35, fontWeight: 950, borderRadius: 999, mt: 0.5 }}
                                    >
                                        {loginSubmitting ? 'Logging in…' : 'Login'}
                                    </Button>

                                    <Box sx={{ textAlign: 'center', mt: 2 }}>
                                        <Typography variant="body2">
                                            New here?{' '}
                                            <Link
                                                component={RouterLink}
                                                to="/register"
                                                underline="hover"
                                                onClick={() => {
                                                    doClose();
                                                }}
                                            >
                                                Create an account
                                            </Link>
                                        </Typography>
                                    </Box>
                                </Box>
                            </Collapse>

                            {/* FORGOT PANE */}
                            <Collapse in={isForgotFlow} timeout={200} unmountOnExit>
                                <Box component="form" onSubmit={submitForgot} sx={formBaseSx}>
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
                                                InputLabelProps={{ shrink: true }}
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
                                                    size="large"
                                                    fullWidth
                                                    disabled={forgotSubmitting}
                                                    sx={{ py: 1.35, fontWeight: 950, borderRadius: 999 }}
                                                >
                                                    {forgotSubmitting ? 'Sending…' : 'Continue'}
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="outlined"
                                                    fullWidth
                                                    onClick={cancelForgot}
                                                    disabled={forgotSubmitting}
                                                    sx={{ borderRadius: 999, fontWeight: 900 }}
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
                            </Collapse>
                        </Box>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
}
