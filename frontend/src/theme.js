// src/theme.js
import { createTheme, alpha, responsiveFontSizes } from '@mui/material/styles';

/**
 * The Local Lantern — Lantern Classic (Navy & Gold)
 * - Primary: deep navy for structure & actions
 * - Secondary: warm gold accent (subtle, not overpowering)
 * - Calm slate canvas; bright paper; crisp dividers; accessible contrast
 * - Pill buttons, refined inputs, consistent focus rings
 * - Dialogs/popovers keep your “X in the top-right” UX but look cleaner
 */

const palette = {
    mode: 'light',

    primary: {
        main: '#1E3A8A',      // navy 800
        light: '#3B82F6',     // indigo/blue 500
        dark:  '#172554',     // navy 900
        contrastText: '#FFFFFF',
    },
    secondary: {
        main: '#F59E0B',      // lantern gold
        light: '#FBBF24',
        dark:  '#B45309',
        contrastText: '#111827',
    },

    // Keep "success" vivid for the New Post button in CommunityPanel
    success: {
        main: '#16A34A',
        light: '#22C55E',
        dark:  '#15803D',
        contrastText: '#FFFFFF',
    },
    info: {
        main: '#0EA5E9',
        light: '#7DD3FC',
        dark:  '#0369A1',
        contrastText: '#FFFFFF',
    },
    warning: {
        main: '#F59E0B',
        light: '#FBBF24',
        dark:  '#B45309',
        contrastText: '#111827',
    },
    error: {
        main: '#EF4444',
        light: '#F87171',
        dark:  '#B91C1C',
        contrastText: '#FFFFFF',
    },

    // Calm neutral canvas; bright card surfaces
    background: {
        default: '#F6F8FB',   // app canvas (also used by the AL map mask outside the state)
        paper:   '#FFFFFF',   // cards, panels, dialogs
    },

    text: {
        primary:   '#0F172A', // slate-900
        secondary: '#475569', // slate-600
    },

    divider: '#E7EAF2',

    grey: {
        50:  '#F8FAFC',
        100: '#F1F5F9',
        200: '#E2E8F0',
        300: '#CBD5E1',
        400: '#94A3B8',
        500: '#64748B',
        600: '#475569',
        700: '#334155',
        800: '#1E293B',
        900: '#0F172A',
    },

    action: {
        hover: alpha('#0F172A', 0.04),
        selected: alpha('#0F172A', 0.08),
        disabledBackground: alpha('#0F172A', 0.06),
        focus: alpha('#1E3A8A', 0.24),
    },
};

let theme = createTheme({
    palette,

    shape: {
        borderRadius: 14,
    },

    typography: {
        fontFamily:
            "'Inter', 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji'",
        h1: { fontWeight: 800, letterSpacing: -0.5 },
        h2: { fontWeight: 800, letterSpacing: -0.4 },
        h3: { fontWeight: 700, letterSpacing: -0.2 },
        h4: { fontWeight: 700 },
        h5: { fontWeight: 700 },
        h6: { fontWeight: 700 },
        button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0.2 },
        subtitle1: { fontWeight: 600 },
        subtitle2: { fontWeight: 600 },
        body1: { lineHeight: 1.6 },
        body2: { lineHeight: 1.55 },
        caption: { color: palette.text.secondary },
    },

    components: {
        /* Global polish & scrollbars (subtle; performance-friendly) */
        MuiCssBaseline: {
            styleOverrides: (t) => ({
                'html, body, #root': {
                    height: '100%',
                    backgroundColor: t.palette.background.default,
                },
                '*': { WebkitTapHighlightColor: 'transparent' },
                '::selection': { background: alpha(t.palette.primary.main, 0.18) },

                '*::-webkit-scrollbar': { width: 10, height: 10 },
                '*::-webkit-scrollbar-thumb': {
                    backgroundColor: alpha(t.palette.primary.main, 0.3),
                    borderRadius: 8,
                    border: '2px solid transparent',
                    backgroundClip: 'padding-box',
                },
                '*::-webkit-scrollbar-thumb:hover': { backgroundColor: alpha(t.palette.primary.main, 0.45) },
                '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
            }),
        },

        /* Surfaces */
        MuiPaper: {
            styleOverrides: {
                root: ({ theme: t }) => ({ backgroundImage: 'none', borderRadius: t.shape.borderRadius }),
                outlined: ({ theme: t }) => ({ borderColor: t.palette.divider }),
            },
        },
        MuiCard: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius,
                    border: `1px solid ${t.palette.divider}`,
                    boxShadow: '0 8px 22px rgba(2, 6, 23, 0.06)',
                    transition: 'transform 120ms ease, box-shadow 120ms ease',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 14px 34px rgba(2, 6, 23, 0.10)',
                    },
                }),
            },
        },

        /* AppBar / header — neutral, matches the rest of the page */
        MuiAppBar: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    backgroundColor: t.palette.background.paper,
                    color: t.palette.text.primary,
                    boxShadow: '0 6px 20px rgba(2, 6, 23, 0.08)',
                    borderBottom: `1px solid ${t.palette.divider}`,
                }),
            },
        },

        /* Inputs: TextField / Select / Autocomplete share OutlinedInput */
        MuiOutlinedInput: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius - 4,
                    backgroundColor: '#fff',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: t.palette.divider },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.palette.text.primary, 0.28) },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: t.palette.primary.main,
                        borderWidth: 2,
                        boxShadow: `0 0 0 3px ${alpha(t.palette.primary.main, 0.18)}`,
                    },
                }),
                input: { paddingTop: 12, paddingBottom: 12 },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: ({ theme: t }) => ({ color: t.palette.text.secondary, '&.Mui-focused': { color: t.palette.primary.main } }),
            },
        },
        MuiSelect: { styleOverrides: { icon: { color: palette.text.secondary } } },
        MuiMenu: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    border: `1px solid ${t.palette.divider}`,
                    boxShadow: '0 12px 28px rgba(2, 6, 23, 0.14)',
                    borderRadius: t.shape.borderRadius,
                }),
            },
        },
        MuiAutocomplete: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    border: `1px solid ${t.palette.divider}`,
                    boxShadow: '0 12px 28px rgba(2, 6, 23, 0.14)',
                    borderRadius: t.shape.borderRadius,
                }),
            },
        },

        /* Buttons */
        MuiButtonBase: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    '&:focus-visible': {
                        outline: `3px solid ${alpha(t.palette.primary.main, 0.36)}`,
                        outlineOffset: 2,
                    },
                }),
            },
        },
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: 999,
                    paddingInline: 16,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    '&.Mui-disabled': { color: alpha(t.palette.text.primary, 0.35) },
                }),
                containedPrimary: ({ theme: t }) => ({
                    backgroundColor: t.palette.primary.main,
                    '&:hover': { backgroundColor: t.palette.primary.dark },
                }),
                containedSecondary: ({ theme: t }) => ({
                    backgroundColor: t.palette.secondary.main,
                    color: t.palette.secondary.contrastText,
                    '&:hover': { backgroundColor: t.palette.secondary.dark, color: t.palette.secondary.contrastText },
                }),
                containedSuccess: ({ theme: t }) => ({
                    backgroundColor: t.palette.success.main,
                    '&:hover': { backgroundColor: t.palette.success.dark },
                }),
                outlined: ({ theme: t }) => ({
                    borderColor: t.palette.divider,
                    '&:hover': { borderColor: alpha(t.palette.text.primary, 0.32), background: t.palette.action.hover },
                }),
                text: ({ theme: t }) => ({ '&:hover': { background: t.palette.action.hover } }),
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: 12,
                    '&:hover': { background: t.palette.action.hover },
                    '&:active': { transform: 'translateY(0.5px)' },
                }),
            },
        },

        /* Chips (category/status tags) */
        MuiChip: {
            styleOverrides: {
                root: ({ theme: t }) => ({ borderRadius: 999, fontWeight: 700 }),
                outlined: ({ theme: t }) => ({ borderColor: t.palette.divider }),
                colorDefault: { backgroundColor: '#EFF3F9', color: '#0F172A' },
            },
        },

        /* Tabs */
        MuiTabs: { styleOverrides: { indicator: ({ theme: t }) => ({ height: 3, borderRadius: 3, backgroundColor: t.palette.primary.main }) } },
        MuiTab: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    textTransform: 'none',
                    fontWeight: 700,
                    color: t.palette.text.secondary,
                    '&.Mui-selected': { color: t.palette.text.primary },
                }),
            },
        },

        /* Dialogs / Popovers / Tooltip — elegant and consistent */
        MuiDialog: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius + 2,
                    border: `1px solid ${t.palette.divider}`,
                    boxShadow: '0 22px 60px rgba(2, 6, 23, 0.22)',
                    backgroundImage: 'none',
                }),
            },
        },
        MuiPopover: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius,
                    border: `1px solid ${t.palette.divider}`,
                    boxShadow: '0 16px 38px rgba(2, 6, 23, 0.18)',
                }),
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: ({ theme: t }) => ({
                    borderRadius: 10,
                    backgroundColor: t.palette.grey[900],
                    color: '#fff',
                    fontWeight: 600,
                }),
                arrow: ({ theme: t }) => ({ color: t.palette.grey[900] }),
            },
        },

        /* Switch (Map View toggle) */
        MuiSwitch: {
            styleOverrides: {
                switchBase: ({ theme: t }) => ({
                    '&.Mui-checked + .MuiSwitch-track': { backgroundColor: alpha(t.palette.primary.main, 0.55) },
                    '&.Mui-checked .MuiSwitch-thumb': { backgroundColor: t.palette.primary.main },
                }),
                track: ({ theme: t }) => ({ backgroundColor: t.palette.grey[300], borderRadius: 22 }),
                thumb: { boxShadow: '0 2px 6px rgba(15, 23, 42, 0.18)' },
            },
        },

        /* Dividers & links */
        MuiDivider: { styleOverrides: { root: ({ theme: t }) => ({ borderColor: t.palette.divider }) } },
        MuiLink: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    fontWeight: 600,
                    color: t.palette.primary.main,
                    '&:hover': { color: t.palette.primary.dark },
                }),
            },
        },

        /* Avatars & Badges — tiny touch of depth */
        MuiAvatar: { styleOverrides: { root: { boxShadow: '0 1px 3px rgba(2, 6, 23, 0.10)' } } },
        MuiBadge:  { styleOverrides: { badge: { border: `1px solid ${palette.background.paper}` } } },
    },
});

theme = responsiveFontSizes(theme);

export default theme;
