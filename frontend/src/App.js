// src/App.js
import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
    BrowserRouter as Router, Routes, Route, Navigate,
} from 'react-router-dom';
import axios from 'axios';

import { AuthModalProvider } from './contexts/AuthModalContext';

import Layout             from './pages/Layout';
import Home               from './pages/Home';
import Login              from './components/Login/Login';
import Register           from './components/Register/Register';
import SocialLoginSuccess from './pages/social/SocialLoginSuccess';
import SocialSignup       from './pages/social/SocialSignup';
import SocialHome         from './pages/social/SocialHome';
import UserProfilePage    from './pages/profile/userProfile/UserProfilePage';

const BusinessPage = lazy(() => import('./pages/BusinessPage'));
const EventsPage   = lazy(() => import('./pages/EventsPage'));   // ⬅️ NEW
const EventDetails = lazy(() => import('./pages/EventDetails')); // ⬅️ NEW
const EventCreate  = lazy(() => import('./pages/EventCreate'));  // ⬅️ NEW

export default function App() {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('All');
    const [authChecking, setAuthChecking] = useState(true);

    useEffect(() => { axios.defaults.withCredentials = true; }, []);
    const handleLogin  = (u) => setUser(u);
    const handleLogout = () => {
        axios.post(`${process.env.REACT_APP_API_URL}/auth/logout`, {}).finally(() => setUser(null));
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await axios.get(`${process.env.REACT_APP_API_URL}/users/profile`);
                if (!alive) return;
                handleLogin(res.data.user);
            } catch { /* not logged in */ }
            finally { if (alive) setAuthChecking(false); }
        })();
        return () => { alive = false; };
    }, []);

    if (authChecking) return null;

    return (
        <AuthModalProvider>
            <Router>
                <Suspense fallback={null}>
                    <Routes>
                        {/* OAuth */}
                        <Route path="/social-login-success" element={<SocialLoginSuccess onLogin={handleLogin} />} />
                        <Route path="/social-signup"        element={<SocialSignup onLogin={handleLogin} />} />

                        {/* Businesses */}
                        <Route
                            path="/business/*"
                            element={
                                <Layout user={user} onLogin={handleLogin} onLogout={handleLogout} activeTab={activeTab} onTabChange={setActiveTab}>
                                    <Routes>
                                        <Route path="" element={<BusinessPage user={user} />} />
                                        <Route path=":businessId" element={<BusinessPage user={user} />} />
                                        <Route path="*" element={<Navigate to="/business" replace />} />
                                    </Routes>
                                </Layout>
                            }
                        />

                        {/* Everything else */}
                        <Route
                            path="/*"
                            element={
                                <Layout user={user} onLogin={handleLogin} onLogout={handleLogout} activeTab={activeTab} onTabChange={setActiveTab}>
                                    <Routes>
                                        <Route path="login"    element={<Login onLogin={handleLogin} />} />
                                        <Route path="register" element={<Register onSignup={handleLogin} />} />

                                        {/* Social */}
                                        <Route path="social" element={<SocialHome user={user} />} />

                                        {/* Events */}
                                        <Route path="events" element={<EventsPage user={user} />} />
                                        <Route path="events/new" element={<EventCreate />} />
                                        <Route path="events/:eventId" element={<EventDetails user={user} />} />

                                        {/* Legacy profile path kept working */}
                                        <Route path="u/:handleOrId" element={<UserProfilePage me={user} />} />
                                        {/* direct /:handleOrId profile path (after explicit routes to avoid conflicts) */}
                                        <Route path=":handleOrId" element={<UserProfilePage me={user} />} />

                                        {/* Misc */}
                                        <Route path=""   element={<Home user={user} activeTab={activeTab} />} />
                                        <Route path="*"  element={<Navigate to="/" replace />} />
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
