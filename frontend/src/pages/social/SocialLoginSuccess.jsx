// src/pages/SocialLoginSuccess.jsx

import React, { useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';

export default function SocialLoginSuccess({ onLogin }) {
    const [searchParams] = useSearchParams();
    const navigate        = useNavigate();
    const location        = useLocation();

    // 1) If you passed ?redirect=PATH, use that
    const fromRedirect = searchParams.get('redirect');

    // 2) Otherwise, if you navigated here with location.state.from,
    //    use that (this lets you do `navigate('/social-login-success', { state: { from: location } })`)
    const fromState = location.state?.from;

    // 3) Fallback to home
    const target = fromRedirect || fromState || '/';

    useEffect(() => {
        axios
            .get(`${process.env.REACT_APP_API_URL}/users/profile`, {
                withCredentials: true
            })
            .then(res => {
                onLogin(res.data.user);
                // Replace this history entry so the user never “sees” this page
                navigate(target, { replace: true });
            })
            .catch(() => {
                // Even on error, send them somewhere sane
                navigate(target, { replace: true });
            });
    }, [onLogin, navigate, target]);

    return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h2>Finishing login…</h2>
        </div>
    );
}
