// src/components/AuthModalContext.jsx
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
// NOTE: We intentionally do NOT render a login popup anymore.
// The app uses the /login route for authentication UI.

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
const AUTH_STORAGE_KEY = 'auth:event';
const MIN_REFRESH_COOLDOWN_MS = 4000;
const MIN_PROMPT_COOLDOWN_MS = 10000;

const AuthContext = createContext({
    user: null,
    isAuthenticated: false,
    status: 'loading',
    loginOpen: false,

    openLogin: () => {},
    closeLogin: () => {},

    openAuth: () => {},
    closeAuth: () => {},
    open: () => {},
    close: () => {},

    logout: async () => {},
    refresh: async () => false,
    requireAuth: async () => false,
});

export function AuthModalProvider({ children }) {
    const [user, setUser] = useState(null);
    const [status, setStatus] = useState('loading');

    // We keep a minimal "loginOpen" flag for compatibility with callers,
    // but we no longer render a dialog. Auth UI lives at /login.
    const [loginOpen, setLoginOpen] = useState(false);

    const loginOpenRef = useRef(false);
    const lastPromptAtRef = useRef(0);
    const lastRefreshAtRef = useRef(0);
    const loginWaitersRef = useRef([]);

    const navigate = useNavigate();

    useEffect(() => {
        axios.defaults.withCredentials = true;
    }, []);

    const openLogin = useCallback(() => {
        const now = Date.now();
        if (now - lastPromptAtRef.current < MIN_PROMPT_COOLDOWN_MS && loginOpenRef.current) return;
        lastPromptAtRef.current = now;

        // Instead of opening a popup, redirect to /login.
        setLoginOpen(false);
        loginOpenRef.current = false;

        // Preserve current path so /login can navigate back after success.
        const from = window.location.pathname + window.location.search + window.location.hash;
        navigate(`/login?redirect=${encodeURIComponent(from)}`);
    }, [navigate]);

    const closeLogin = useCallback(() => {
        // No dialog to close, but keep the contract.
        setLoginOpen(false);
        loginOpenRef.current = false;

        if (loginWaitersRef.current.length) {
            loginWaitersRef.current.forEach((r) => r(false));
            loginWaitersRef.current = [];
        }
    }, []);

    const refresh = useCallback(
        async ({ silent = false } = {}) => {
            const since = Date.now() - lastRefreshAtRef.current;
            if (since < MIN_REFRESH_COOLDOWN_MS && status !== 'loading') {
                return status === 'authenticated';
            }
            lastRefreshAtRef.current = Date.now();

            try {
                const res = await axios.get(`${API_BASE}/users/profile`, {
                    headers: { 'x-auth-check': '1' },
                });
                const nextUser = res?.data?.user || null;

                setUser(nextUser);
                setStatus('authenticated');

                if (loginOpenRef.current) {
                    setLoginOpen(false);
                    loginOpenRef.current = false;
                }

                if (loginWaitersRef.current.length) {
                    loginWaitersRef.current.forEach((r) => r(true));
                    loginWaitersRef.current = [];
                }

                try {
                    localStorage.setItem(
                        AUTH_STORAGE_KEY,
                        JSON.stringify({ type: 'login', at: Date.now() })
                    );
                } catch {}

                return true;
            } catch {
                setUser(null);
                setStatus('unauthenticated');

                if (!silent && !loginOpenRef.current) {
                    // remain silent by default
                }
                return false;
            }
        },
        [status]
    );

    useEffect(() => {
        const respId = axios.interceptors.response.use(
            (r) => r,
            async (error) => {
                const statusCode = error?.response?.status;
                const url = String(error?.config?.url || '');
                const method = String(error?.config?.method || 'get').toLowerCase();

                const isAuthEndpoint =
                    url.includes('/auth/login') ||
                    url.includes('/auth/logout') ||
                    url.includes('/auth/google') ||
                    url.includes('/auth/facebook');

                const promptHeader = error?.config?.headers?.['x-auth-prompt'];
                const promptMeta = error?.config?.meta?.promptOn401;

                if (statusCode === 401 && !isAuthEndpoint) {
                    setUser(null);
                    setStatus('unauthenticated');

                    const shouldPrompt =
                        method !== 'get' ||
                        promptHeader === '1' ||
                        promptHeader === 1 ||
                        promptMeta === true;

                    if (shouldPrompt) openLogin();
                }

                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.response.eject(respId);
        };
    }, [openLogin]);

    useEffect(() => {
        const onFocusOrVisible = () => refresh({ silent: true });
        const onStorage = (e) => {
            if (e.key === AUTH_STORAGE_KEY && e.newValue) {
                try {
                    const payload = JSON.parse(e.newValue);
                    if (payload?.type === 'login' || payload?.type === 'logout') {
                        refresh({ silent: true });
                    }
                } catch {}
            }
        };

        window.addEventListener('focus', onFocusOrVisible);
        document.addEventListener('visibilitychange', onFocusOrVisible);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener('focus', onFocusOrVisible);
            document.removeEventListener('visibilitychange', onFocusOrVisible);
            window.removeEventListener('storage', onStorage);
        };
    }, [refresh]);

    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.pathname === '/social-login-success') {
            const redirectTo = url.searchParams.get('redirect') || '/';
            refresh({ silent: true }).finally(() => {
                window.history.replaceState({}, '', redirectTo);
            });
        }
    }, [refresh]);

    useEffect(() => {
        refresh({ silent: true });
    }, [refresh]);

    const logout = useCallback(async () => {
        try {
            await axios.post(`${API_BASE}/auth/logout`);
        } catch {
            /* ignore */
        }
        setUser(null);
        setStatus('unauthenticated');
        try {
            localStorage.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify({ type: 'logout', at: Date.now() })
            );
        } catch {}
    }, []);

    const requireAuth = useCallback(async () => {
        if (status === 'authenticated' && user) return true;
        openLogin();
        return new Promise((resolve) => {
            loginWaitersRef.current.push(resolve);
        });
    }, [openLogin, status, user]);

    const value = {
        user,
        isAuthenticated: status === 'authenticated' && !!user,
        status,
        loginOpen,

        openLogin,
        closeLogin,

        openAuth: openLogin,
        closeAuth: closeLogin,
        open: openLogin,
        close: closeLogin,

        logout,
        refresh,
        requireAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

export function useAuthModal() {
    const ctx = useAuth();
    return {
        user: ctx.user,
        status: ctx.status,
        loginOpen: ctx.loginOpen,

        open: ctx.openLogin,
        close: ctx.closeLogin,
        openAuth: ctx.openLogin,
        closeAuth: ctx.closeLogin,

        logout: ctx.logout,
        refresh: ctx.refresh,
        requireAuth: ctx.requireAuth,
    };
}

export function AuthGate({ children, fallback = null }) {
    const { isAuthenticated, status, openLogin } = useAuth();
    useEffect(() => {
        if (status === 'unauthenticated') openLogin();
    }, [status, openLogin]);
    if (status === 'loading') return fallback;
    if (!isAuthenticated) return fallback;
    return <>{children}</>;
}
