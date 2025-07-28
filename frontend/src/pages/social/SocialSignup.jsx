// src/pages/SocialSignup.jsx

import React, { useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function SocialSignup({ onLogin }) {
  // Read the `redirect` query parameter (use "/" if none provided)
  const [searchParams] = useSearchParams();
  const redirect       = searchParams.get('redirect') || '/';

  // useNavigate from react-router-dom v6+ for programmatic nav
  const navigate = useNavigate();

  useEffect(() => {
    // After OAuth signup, backend has set the JWT cookie.
    // Fetch the new user profile to hydrate React state.
    axios
        .get(
            `${process.env.REACT_APP_API_URL}/users/profile`,
            { withCredentials: true }            // include the cookie
        )
        .then(res => {
          // Invoke the parent callback to set user state
          onLogin(res.data.user);

          // Replace this history entry with the original page
          navigate(redirect, { replace: true });
        })
        .catch(() => {
          // On error, still navigate back so user isn't stuck here
          navigate(redirect, { replace: true });
        });
  }, [onLogin, navigate, redirect]);

  // Interim UI while we fetch & redirect
  return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Finalizing signup…</h2>
      </div>
  );
}
