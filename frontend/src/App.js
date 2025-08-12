// src/App.js

import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate
} from 'react-router-dom';
import axios from 'axios';

import { AuthModalProvider } from './contexts/AuthModalContext';

import Layout             from './pages/Layout';
import Home               from './pages/Home';
import Login              from './components/Login/Login';
import Register           from './components/Register/Register';
import SocialLoginSuccess from './pages/social/SocialLoginSuccess';
import SocialSignup       from './pages/social/SocialSignup';

// Lazy-load Business page so adding it later won’t require edits here.
// Create ./pages/BusinessPage.jsx when ready.
const BusinessPage = lazy(() => import('./pages/BusinessPage'));

export default function App() {
    // Holds the authenticated user (null = not logged in)
    const [user, setUser] = useState(null);
    // Track which tab is active in Header
    const [activeTab, setActiveTab] = useState('All');
    // TRUE while we’re checking the JWT cookie on startup
    const [authChecking, setAuthChecking] = useState(true);

    // set axios defaults once
    useEffect(() => {
        axios.defaults.withCredentials = true;
    }, []);

    // Called when we get a valid user back
    const handleLogin = (userData) => {
        setUser(userData);
    };

    // Log out both server-side and client-side
    const handleLogout = () => {
        axios
            .post(
                `${process.env.REACT_APP_API_URL}/auth/logout`,
                {}
            )
            .finally(() => setUser(null));
    };

    // On mount, check /users/profile once to hydrate `user`
    useEffect(() => {
        let alive = true; // guard to avoid setState after unmount
        axios
            .get(`${process.env.REACT_APP_API_URL}/users/profile`)
            .then(res => {
                if (!alive) return;
                handleLogin(res.data.user);
            })
            .catch(() => {
                // no valid session → stay logged out
            })
            .finally(() => {
                if (!alive) return;
                setAuthChecking(false);
            });
        return () => { alive = false; };
    }, []);

    // While we’re waiting for the profile check, render nothing (or a spinner)
    if (authChecking) {
        return null; // or a global loader
    }

    return (
        <AuthModalProvider>
            <Router>
                <Suspense fallback={null}>
                    <Routes>
                        {/* OAuth callback landing pages */}
                        <Route
                            path="/social-login-success"
                            element={<SocialLoginSuccess onLogin={handleLogin} />}
                        />
                        <Route
                            path="/social-signup"
                            element={<SocialSignup onLogin={handleLogin} />}
                        />

                        {/* Business page (lazy) */}
                        <Route
                            path="/business/*"
                            element={
                                <Layout
                                    user={user}
                                    onLogin={handleLogin}
                                    onLogout={handleLogout}
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                >
                                    <Routes>
                                        <Route path="" element={<BusinessPage user={user} />} />
                                        <Route path="*" element={<Navigate to="/business" replace />} />
                                    </Routes>
                                </Layout>
                            }
                        />

                        {/* All other routes inside Layout */}
                        <Route
                            path="/*"
                            element={
                                <Layout
                                    user={user}
                                    onLogin={handleLogin}
                                    onLogout={handleLogout}
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                >
                                    <Routes>
                                        <Route
                                            path="login"
                                            element={<Login onLogin={handleLogin} />}
                                        />
                                        <Route
                                            path="register"
                                            element={<Register onSignup={handleLogin} />}
                                        />
                                        <Route
                                            path=""
                                            element={<Home user={user} activeTab={activeTab} />}
                                        />
                                        <Route
                                            path="*"
                                            element={<Navigate to="/" replace />}
                                        />
                                    </Routes>
                                </Layout>
                            }
                        />
                    </Routes>
                </Suspense>
            </Router>
        </AuthModalProvider>
    );
}
