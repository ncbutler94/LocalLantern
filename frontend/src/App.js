// src/App.js

import React, { useState, useEffect } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate
} from 'react-router-dom';
import axios from 'axios';

import { AuthModalProvider } from './contexts/AuthModalContext';  // ← NEW

import Layout             from './pages/Layout';
import Home               from './pages/Home';
import Login              from './components/Login/Login';
import Register           from './components/Register/Register';
import SocialLoginSuccess from './pages/social/SocialLoginSuccess';
import SocialSignup       from './pages/social/SocialSignup';

export default function App() {
    // Holds the authenticated user (null = not logged in)
    const [user, setUser] = useState(null);
    // Track which tab is active in Header
    const [activeTab, setActiveTab] = useState('All');
    // TRUE while we’re checking the JWT cookie on startup
    const [authChecking, setAuthChecking] = useState(true);

    // Called when we get a valid user back
    const handleLogin = (userData) => {
        setUser(userData);
    };

    // Log out both server-side and client-side
    const handleLogout = () => {
        axios
            .post(
                `${process.env.REACT_APP_API_URL}/auth/logout`,
                {},
                { withCredentials: true }
            )
            .finally(() => setUser(null));
    };

    // On mount, check /users/profile once to hydrate `user`
    useEffect(() => {
        axios
            .get(`${process.env.REACT_APP_API_URL}/users/profile`, {
                withCredentials: true
            })
            .then(res => {
                handleLogin(res.data.user);
            })
            .catch(() => {
                // no valid session → stay logged out
            })
            .finally(() => {
                // we’re done checking either way
                setAuthChecking(false);
            });
    }, []);

    // While we’re waiting for the profile check, render nothing (or a spinner)
    if (authChecking) {
        return null;
        // Or return <YourLoader />; if you have a global spinner component
    }

    return (
        <AuthModalProvider>                                   {/* ← WRAP here */}
            <Router>
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
            </Router>
        </AuthModalProvider>
    );
}
