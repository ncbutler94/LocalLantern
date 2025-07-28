// src/contexts/AuthModalContext.jsx

import React, { createContext, useContext, useState } from 'react';

// 1) Create the Context
const AuthModalContext = createContext({
    open: () => {},
    close: () => {},
    loginOpen: false
});

// 2) Provider to wrap your app
export function AuthModalProvider({ children }) {
    const [loginOpen, setLoginOpen] = useState(false);

    const open  = () => setLoginOpen(true);
    const close = () => setLoginOpen(false);

    return (
        <AuthModalContext.Provider value={{ open, close, loginOpen }}>
            {children}
        </AuthModalContext.Provider>
    );
}

// 3) Hook for consuming
export function useAuthModal() {
    return useContext(AuthModalContext);
}
