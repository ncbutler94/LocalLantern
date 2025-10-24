// src/pages/Layout.jsx

import React from 'react';
import Header from '../components/Header/Header'; // adjust this path if your Header lives elsewhere

/**
 * Layout component: wraps every page in your app with Header and main content.
 *
 * Props:
 *   - user:        the current logged-in user object (or null)
 *   - onLogin:     function(user) → void, called after a successful login
 *   - onLogout:    function() → void, called to log the user out
 *   - activeTab:   string, the key/name of the currently selected tab
 *   - onTabChange: function(tabKey: string) → void, called when the user picks a new tab
 *   - children:    React nodes to render as the page’s main content
 */
export default function Layout({
                                   user,
                                   onLogin,
                                   onLogout,
                                   activeTab,
                                   onTabChange,
                                   children
                               }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {/* Header at the top, forwarding all necessary props */}
            <Header
                user={user}
                onLogin={onLogin}
                onLogout={onLogout}
                activeTab={activeTab}
                onTabChange={onTabChange}
            />

            {/* Main content area grows to fill the rest of the viewport */}
            <main style={{ flexGrow: 1 }}>
                {children}
            </main>
        </div>
    );
}
