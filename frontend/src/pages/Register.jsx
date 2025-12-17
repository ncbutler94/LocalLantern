// src/pages/Register.jsx
import { useState } from 'react';
import {
    Box,
    Container,
    Paper,
    Typography,
    TextField,
    Button,
    InputAdornment,
} from '@mui/material';
import GlobalStyles from '@mui/material/GlobalStyles';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthModalContext';
import registerArt from '../assets/register.png';
import CityCountySelect from '../components/CityCountySelect';

// Page background tone (the warm cream)
const REGISTER_BG = '#F7F0E6';

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const handleRegex = /^[a-zA-Z0-9_.-]{3,30}$/;
// Password: 10–20 chars, at least 1 uppercase and 1 special character
const passwordRegex = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{10,20}$/;

const pad2 = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function Register() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    // Stable random suffix used to discourage autofill heuristics
    const [autoToken] = useState(() => Math.random().toString(36).slice(2));

    const [form, setForm] = useState({
        email: '',
        dob: '', // YYYY-MM-DD
        first_name: '',
        last_name: '',
        county: '',
        city: '',
        handle: '',
        password: '',
    });

    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({
        general: '',
        city: '',
        county: '',
        dob: '',
        password: '',
    });

    // Date bounds for DOB
    const today = new Date();
    const maxDobDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const minDobDate = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
    const MAX_DOB = toISODate(maxDobDate); // must be <= this (18+)
    const MIN_DOB = toISODate(minDobDate);

    // Anti‑autofill attributes
    const antiFillAttrs = {
        autoComplete: 'off',
        'data-1p-ignore': 'true',
        'data-lpignore': 'true',
    };
    const makeEditableOnFocus = (e) => {
        if (e && e.target && e.target.hasAttribute('readonly')) {
            e.target.removeAttribute('readonly');
        }
    };

    const update = (k) => (e) => {
        if (k === 'handle') {
            const raw = e.target.value || '';
            setForm((s) => ({ ...s, handle: raw.replace(/@/g, '') }));
            return;
        }
        const val = e.target.value;
        setForm((s) => ({ ...s, [k]: val }));
        if (k === 'city' && val) setErrors((er) => ({ ...er, city: '' }));
        if (k === 'county' && val) setErrors((er) => ({ ...er, county: '' }));
        if (k === 'dob' && val) setErrors((er) => ({ ...er, dob: '' }));
        if (k === 'password') setErrors((er) => ({ ...er, password: '' }));
    };

    const getAge = (dobString) => {
        const dob = new Date(`${dobString}T00:00:00`);
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const m = now.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
        return age;
    };

    const submit = async (e) => {
        e.preventDefault();
        setErrors({ general: '', city: '', county: '', dob: '', password: '' });

        const first = form.first_name.trim();
        const last = form.last_name.trim();
        const email = form.email.trim();

        // Basic validation
        if (!first || !last) {
            setErrors((s) => ({ ...s, general: 'Please enter your first and last name.' }));
            return;
        }
        if (first.length > 50 || last.length > 50) {
            setErrors((s) => ({ ...s, general: 'Names must be 50 characters or fewer.' }));
            return;
        }
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            setErrors((s) => ({ ...s, general: 'Please enter a valid email.' }));
            return;
        }
        if (email.length > 254) {
            setErrors((s) => ({ ...s, general: 'Email is too long (max 254 characters).' }));
            return;
        }

        // DOB validation (required & 18+)
        if (!form.dob) {
            setErrors((s) => ({ ...s, dob: 'Date of birth is required.' }));
            return;
        }
        const dobDate = new Date(`${form.dob}T00:00:00`);
        if (Number.isNaN(dobDate.getTime())) {
            setErrors((s) => ({ ...s, dob: 'Please enter a valid date of birth.' }));
            return;
        }
        if (dobDate > today) {
            setErrors((s) => ({ ...s, dob: 'Date of birth cannot be in the future.' }));
            return;
        }
        if (getAge(form.dob) < 18) {
            setErrors((s) => ({ ...s, dob: 'You must be at least 18 years old to sign up.' }));
            return;
        }

        // Location + username
        if (!form.county) {
            setErrors((s) => ({ ...s, county: 'County is required.' }));
            return;
        }
        if (!form.city) {
            setErrors((s) => ({ ...s, city: 'City is required.' }));
            return;
        }
        if (!form.handle || !handleRegex.test(form.handle)) {
            setErrors((s) => ({
                ...s,
                general: 'Username must be 3–30 chars: letters, numbers, dot, dash, underscore.',
            }));
            return;
        }

        // Password strength
        if (!passwordRegex.test(form.password)) {
            setErrors((s) => ({
                ...s,
                password:
                    'Password must be 10–20 characters and include at least 1 uppercase letter and 1 special character.',
            }));
            return;
        }

        try {
            setSubmitting(true);
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    first_name: first,
                    last_name: last,
                    home_county: form.county,
                    home_city: form.city,
                    handle: form.handle.trim(),
                    password: form.password,
                    dob: form.dob, // sent so backend can enforce 18+
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setErrors((s) => ({
                    ...s,
                    general: data?.message || 'Registration failed. Please try again.',
                }));
                setSubmitting(false);
                return;
            }

            // Success: server sets a JWT cookie; reload to hydrate user state
            navigate('/', { replace: true });
            window.setTimeout(() => window.location.reload(), 0);
        } catch {
            setErrors((s) => ({ ...s, general: 'Network error. Please try again.' }));
            setSubmitting(false);
        }
    };

    // If already logged in, show message + logout link; keep form disabled.
    const formDisabled = Boolean(user);

    return (
        <>
            <GlobalStyles
                styles={{
                    html: { backgroundColor: REGISTER_BG },
                    body: { margin: 0, backgroundColor: REGISTER_BG },
                    '#root': { backgroundColor: REGISTER_BG },
                }}
            />

            <Box sx={{ bgcolor: REGISTER_BG, minHeight: '100vh' }}>
                <Container
                    maxWidth="xl"
                    sx={{ pt: { xs: 2, md: 3 }, pb: { xs: 6, md: 9 } }}
                >
                    <Paper
                        elevation={1}
                        sx={{
                            width: '100%',
                            maxWidth: { xs: 1080, md: 1500 },
                            mx: 'auto',
                            overflow: 'hidden',
                            borderRadius: 2,
                        }}
                    >
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    md: 'minmax(560px, 52%) 1fr',
                                    lg: 'minmax(720px, 54%) 1fr',
                                },
                                alignItems: 'start',
                            }}
                        >
                            {/* LEFT: Illustration */}
                            <Box
                                sx={{
                                    p: { xs: 3, md: 4 },
                                    borderRight: { md: '1px solid rgba(0,0,0,0.06)' },
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <Box
                                    component="img"
                                    src={registerArt}
                                    alt="Join the community illustration"
                                    sx={{
                                        width: '100%',
                                        maxWidth: { xs: 560, md: 900, lg: 1040 },
                                        height: 'auto',
                                        objectFit: 'contain',
                                        display: 'block',
                                    }}
                                />
                            </Box>

                            {/* RIGHT: Form */}
                            <Box sx={{ p: { xs: 3, md: 4 } }}>
                                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                                    Create your account
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                                    Join The Local Lantern to connect with your community.
                                </Typography>

                                {user && (
                                    <Box
                                        role="note"
                                        sx={{
                                            border: '1px solid',
                                            borderColor: 'info.light',
                                            bgcolor: '#f0f6ff',
                                            color: 'info.main',
                                            p: 1.25,
                                            borderRadius: 1,
                                            mb: 2,
                                            fontSize: 14,
                                        }}
                                    >
                                        You’re already signed in. To create a different account,{' '}
                                        <Button size="small" onClick={logout}>log out</Button> first.
                                    </Box>
                                )}

                                {errors.general ? (
                                    <Box
                                        role="alert"
                                        sx={{
                                            border: '1px solid',
                                            borderColor: 'error.light',
                                            bgcolor: '#fff5f5',
                                            color: 'error.main',
                                            p: 1.25,
                                            borderRadius: 1,
                                            mb: 2,
                                            fontSize: 14,
                                        }}
                                    >
                                        {errors.general}
                                    </Box>
                                ) : null}

                                <Box
                                    component="form"
                                    onSubmit={submit}
                                    noValidate
                                    autoComplete="off"
                                    // visually indicate disabled if already logged in
                                    sx={formDisabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
                                >
                                    {/* Honeypots to absorb Chrome autofill */}
                                    <input
                                        type="text"
                                        name="username"
                                        autoComplete="username"
                                        tabIndex={-1}
                                        aria-hidden="true"
                                        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, border: 0, padding: 0 }}
                                    />
                                    <input
                                        type="password"
                                        name="password"
                                        autoComplete="current-password"
                                        tabIndex={-1}
                                        aria-hidden="true"
                                        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, border: 0, padding: 0 }}
                                    />

                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                                            gridTemplateAreas: {
                                                xs: `
                          "first"
                          "last"
                          "email"
                          "dob"
                          "location"
                          "username"
                          "password"
                        `,
                                                md: `
                          "first last"
                          "email dob"
                          "location location"
                          "username username"
                          "password password"
                        `,
                                            },
                                        }}
                                    >
                                        {/* Row 1 */}
                                        <TextField
                                            sx={{ gridArea: 'first' }}
                                            label="First name"
                                            id={`first-name-${autoToken}`}
                                            name={`first-name-${autoToken}`}
                                            value={form.first_name}
                                            onChange={update('first_name')}
                                            onFocus={makeEditableOnFocus}
                                            fullWidth
                                            required
                                            autoComplete="off"
                                            inputProps={{ ...antiFillAttrs, maxLength: 50, readOnly: true }}
                                        />
                                        <TextField
                                            sx={{ gridArea: 'last' }}
                                            label="Last name"
                                            id={`last-name-${autoToken}`}
                                            name={`last-name-${autoToken}`}
                                            value={form.last_name}
                                            onChange={update('last_name')}
                                            onFocus={makeEditableOnFocus}
                                            fullWidth
                                            required
                                            autoComplete="off"
                                            inputProps={{ ...antiFillAttrs, maxLength: 50, readOnly: true }}
                                        />

                                        {/* Row 2: Email + DOB */}
                                        <TextField
                                            sx={{ gridArea: 'email' }}
                                            label="Email"
                                            id={`email-${autoToken}`}
                                            name={`email-${autoToken}`}
                                            type="email"
                                            value={form.email}
                                            onChange={update('email')}
                                            onFocus={makeEditableOnFocus}
                                            fullWidth
                                            required
                                            autoComplete="off"
                                            inputProps={{
                                                ...antiFillAttrs,
                                                maxLength: 254,
                                                readOnly: true,
                                                inputMode: 'email',
                                            }}
                                        />
                                        <TextField
                                            sx={{ gridArea: 'dob' }}
                                            label="Date of Birth"
                                            id={`dob-${autoToken}`}
                                            name={`dob-${autoToken}`}
                                            type="date"
                                            value={form.dob}
                                            onChange={update('dob')}
                                            onFocus={makeEditableOnFocus}
                                            fullWidth
                                            required
                                            autoComplete="off"
                                            error={Boolean(errors.dob)}
                                            helperText={errors.dob || 'Must be 18 or older.'}
                                            InputLabelProps={{ shrink: true }}
                                            inputProps={{
                                                ...antiFillAttrs,
                                                min: MIN_DOB,
                                                max: MAX_DOB,
                                                readOnly: true,
                                                'aria-label': 'Date of birth',
                                            }}
                                        />

                                        {/* Row 3: City/County combined */}
                                        <Box sx={{ gridArea: 'location' }}>
                                            <CityCountySelect
                                                city={form.city}
                                                setCity={(v) => {
                                                    setForm((s) => ({ ...s, city: v }));
                                                    if (v) setErrors((er) => ({ ...er, city: '' }));
                                                }}
                                                county={form.county}
                                                setCounty={(v) => {
                                                    setForm((s) => ({ ...s, county: v }));
                                                    if (v) setErrors((er) => ({ ...er, county: '' }));
                                                }}
                                                cityError={errors.city}
                                                countyError={errors.county}
                                                cityRequired
                                                countyRequired
                                                sx={{ mt: { xs: 0, md: 0 } }}
                                            />
                                        </Box>

                                        {/* Row 4 */}
                                        <TextField
                                            sx={{ gridArea: 'username' }}
                                            label="Username"
                                            id={`username-${autoToken}`}
                                            name={`username-${autoToken}`}
                                            value={form.handle}
                                            onChange={update('handle')}
                                            onFocus={makeEditableOnFocus}
                                            fullWidth
                                            required
                                            autoComplete="off"
                                            helperText="3–30 chars: letters, numbers, dot, dash, underscore"
                                            inputProps={{
                                                ...antiFillAttrs,
                                                maxLength: 30,
                                                readOnly: true,
                                                'aria-label': 'Username',
                                            }}
                                            InputProps={{
                                                startAdornment: <InputAdornment position="start">@</InputAdornment>,
                                            }}
                                        />

                                        {/* Row 5 */}
                                        <TextField
                                            sx={{ gridArea: 'password' }}
                                            label="Password"
                                            id={`password-${autoToken}`}
                                            name={`password-${autoToken}`}
                                            type="password"
                                            value={form.password}
                                            onChange={update('password')}
                                            onFocus={makeEditableOnFocus}
                                            fullWidth
                                            required
                                            autoComplete="new-password"
                                            error={Boolean(errors.password)}
                                            helperText={
                                                errors.password ||
                                                'Use 10–20 characters, include at least 1 uppercase letter and 1 special character (e.g., !@#$%&*).'
                                            }
                                            inputProps={{
                                                ...antiFillAttrs,
                                                maxLength: 20,
                                                readOnly: true,
                                                'aria-label': 'Password',
                                            }}
                                        />
                                    </Box>

                                    <Button
                                        type="submit"
                                        variant="contained"
                                        size="large"
                                        fullWidth
                                        disabled={submitting || formDisabled}
                                        sx={{ mt: 3 }}
                                    >
                                        {submitting ? 'Creating account…' : 'Create Account'}
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    </Paper>
                </Container>
            </Box>
        </>
    );
}
