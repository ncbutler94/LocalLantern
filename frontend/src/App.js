// src/App.js
import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
    useLocation,
    useParams,
} from 'react-router-dom';
import { Box } from '@mui/material';

import { AuthModalProvider, useAuth } from './components/AuthModalContext';

import Layout from './pages/Layout';
import Home from './pages/Home';
import Login from './components/Login';
// ⛔ Removed: SocialLoginSuccess, SocialSignup (OAuth-only pages)
import SocialHome from './pages/social/SocialHome';
import UserProfilePage from './pages/profile/userProfile/UserProfilePage';

// Register + 404 pages
import Register from './pages/Register';
import ResetPasswordPage from './pages/ResetPasswordPage';
import NotFound from './pages/NotFound';

const BusinessPage = lazy(() => import('./pages/business/BusinessPage'));
const EventsPage = lazy(() => import('./pages/events/EventsPage'));
const EventDetails = lazy(() => import('./pages/events/EventDetails'));
const EventCreate = lazy(() => import('./pages/events/EventCreate'));
const JobsPage = lazy(() => import('./pages/jobs/JobsPage'));
const PostPage = lazy(() => import('./pages/community/PostPage'));
const CommunityPage = lazy(() => import('./pages/community/CommunityPage'));
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'));

/** Redirect old /u/:handleOrId links to /:handleOrId */
function LegacyUserRedirect() {
    const { handleOrId } = useParams();
    return <Navigate to={`/${handleOrId}`} replace />;
}

/**
 * ProfileRoute: gates /:handleOrId behind an existence check.
 * If the user exists, render the profile page; otherwise, show 404.
 */
function ProfileRoute({ me }) {
    const { handleOrId } = useParams();
    const [state, setState] = useState('loading');

    useEffect(() => {
        let active = true;
        const base = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
        const url = `${base}/users/public/${encodeURIComponent(handleOrId)}`;
        (async () => {
            try {
                const r = await fetch(url, { credentials: 'include' });
                if (!active) return;
                setState(r.ok ? 'ok' : 'notfound');
            } catch {
                if (active) setState('notfound');
            }
        })();
        return () => {
            active = false;
        };
    }, [handleOrId]);

    if (state === 'loading') return null;
    if (state === 'ok') return <UserProfilePage me={me} />;
    return <NotFound />;
}

/** Child shell that CONSUMES the auth context (must be under provider) */
function AppShell() {
    const { user, status, refresh, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('All');
    const location = useLocation();

    const handleLogin = async () => {
        await refresh({ silent: true });
    };
    const handleLogout = () => {
        logout();
    };

    // Keep header's selected tab in sync with the URL for top-level tabs.
    useEffect(() => {
        const first = (location.pathname.split('/')[1] || '').toLowerCase();
        const tabMap = {
            '': 'All',
            community: 'Community',
            events: 'Events',
            jobs: 'Jobs',
            business: 'Businesses',
            music: 'Music',
            services: 'Services',
            marketplace: 'Marketplace',
            deals: 'Deals',
            'real-estate': 'Real Estate',
        };
        if (Object.prototype.hasOwnProperty.call(tabMap, first)) {
            setActiveTab(tabMap[first]);
        }
    }, [location.pathname]);

    // Avoid flashing UI until the first auth check completes
    if (status === 'loading') return null;

    return (
        <Routes>
            {/* Businesses */}
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
                            <Route index element={<BusinessPage user={user} />} />
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
                    <Layout
                        user={user}
                        onLogin={handleLogin}
                        onLogout={handleLogout}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    >
                        <Routes>
                            {/* Auth */}
                            <Route
                                path="login"
                                element={
                                    <Box
                                        sx={{
                                            width: '100%',
                                            px: { xs: 2, sm: 3 },
                                            pt: { xs: 10, sm: 12 }, // 80–96px typical header clearance
                                            pb: { xs: 8, sm: 10 },
                                        }}
                                    >
                                        <Login onLogin={handleLogin} showTitle title="Log In" />
                                    </Box>
                                }
                            />
                            <Route path="register" element={<Register />} />
                            <Route path="reset-password" element={<ResetPasswordPage />} />

                            {/* Social (site section; not OAuth) */}
                            <Route path="social" element={<SocialHome user={user} />} />

                            {/* Messages (full page) */}
                            <Route path="messages" element={<MessagesPage />} />

                            {/* Events */}
                            <Route path="events" element={<EventsPage user={user} />} />
                            <Route path="events/new" element={<EventCreate />} />
                            <Route path="events/:eventId" element={<EventDetails user={user} />} />

                            {/* Jobs */}
                            <Route path="jobs" element={<JobsPage user={user} />} />

                            {/* Community post */}
                            <Route path="posts/:postId" element={<PostPage user={user} />} />

                            {/* Community page */}
                            <Route path="community" element={<CommunityPage user={user} />} />

                            {/* Explicit tab routes */}
                            <Route path="music" element={<Home user={user} activeTab="Music" />} />
                            <Route path="services" element={<Home user={user} activeTab="Services" />} />
                            <Route path="marketplace" element={<Home user={user} activeTab="Marketplace" />} />
                            <Route path="deals" element={<Home user={user} activeTab="Deals" />} />
                            <Route path="real-estate" element={<Home user={user} activeTab="Real Estate" />} />

                            {/* Profiles */}
                            <Route path="u/:handleOrId" element={<LegacyUserRedirect />} />
                            <Route path=":handleOrId" element={<ProfileRoute me={user} />} />

                            {/* Home + catch-all */}
                            <Route index element={<Home user={user} activeTab={activeTab} />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Layout>
                }
            />
        </Routes>
    );
}

export default function App() {
    return (
        <Router>
            <AuthModalProvider>
                <Suspense fallback={null}>
                    <AppShell />
                </Suspense>
            </AuthModalProvider>
        </Router>
    );
}
