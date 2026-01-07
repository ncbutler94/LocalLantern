// src/theme.js
import { createTheme, alpha, responsiveFontSizes } from '@mui/material/styles';

/**
 * The Local Lantern — Premium Light: "Heritage Linen (Polished)"
 * Vibe: warm, local, premium (Linen canvas + Evergreen primary + Brass accent)
 *
 * Includes the label-notch readability fix:
 * - Outlined floating labels get a solid background when shrunk so the outline
 *   line never shows behind the label text.
 */

const palette = {
    mode: 'light',

    primary: {
        main: '#124E3A', // evergreen
        light: '#1E6B52',
        dark: '#0B3426',
        contrastText: '#FFFFFF',
    },

    secondary: {
        main: '#C9A24D', // brass (marker-match)
        light: '#D5B97B',
        dark: '#9F7E38',
        // IMPORTANT: White on this gold is low contrast. Use deep green for a more premium, readable look.
        contrastText: '#0B3426',
    },

    success: {
        main: '#16A34A',
        light: '#22C55E',
        dark: '#15803D',
        contrastText: '#FFFFFF',
    },
    info: {
        main: '#2563EB',
        light: '#60A5FA',
        dark: '#1E40AF',
        contrastText: '#FFFFFF',
    },
    warning: {
        main: '#F59E0B',
        light: '#FBBF24',
        dark: '#B45309',
        contrastText: '#FFFFFF',
    },
    error: {
        main: '#DC2626',
        light: '#F87171',
        dark: '#991B1B',
        contrastText: '#FFFFFF',
    },

    // Cream / linen surfaces (warmer than pure white)
    background: {
        // App background behind everything (linen)
        default: '#FBF8F1',
        // General surface (Paper/AppBar/etc.) — warm cream, not stark white
        paper: '#F7F1E6',
    },

    text: {
        primary: '#0B1220',
        secondary: '#55606E',
    },

    divider: alpha('#0B1220', 0.13),

    action: {
        hover: alpha('#124E3A', 0.045),
        selected: alpha('#124E3A', 0.085),
        disabledBackground: alpha('#124E3A', 0.06),
        focus: alpha('#C9A24D', 0.22),
    },
};

const shadow = {
    sm: '0 8px 22px rgba(15, 23, 42, 0.08)',
    md: '0 16px 46px rgba(15, 23, 42, 0.11)',
    lg: '0 24px 76px rgba(15, 23, 42, 0.14)',
};

let theme = createTheme({
    palette,

    shape: {
        borderRadius: 8,
    },

    typography: {
        fontFamily:
            "'Inter', 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji'",
        h1: { fontWeight: 860, letterSpacing: -0.8 },
        h2: { fontWeight: 860, letterSpacing: -0.6 },
        h3: { fontWeight: 820, letterSpacing: -0.3 },
        h4: { fontWeight: 800 },
        h5: { fontWeight: 760 },
        h6: { fontWeight: 760 },
        button: { fontWeight: 900, textTransform: 'none', letterSpacing: 0.25 },
        subtitle1: { fontWeight: 650 },
        subtitle2: { fontWeight: 650 },
        body1: { lineHeight: 1.64 },
        body2: { lineHeight: 1.58 },
        caption: { color: palette.text.secondary },
    },

    components: {
        MuiCssBaseline: {
            styleOverrides: (t) => ({
                'html, body, #root': {
                    height: '100%',
                    backgroundColor: t.palette.background.default,
                },
                '*': { WebkitTapHighlightColor: 'transparent' },
                // Cream dropdown menu paper (used by Select MenuProps PaperProps.className)
                '.ll-cream-menu-paper': {
                    backgroundColor: '#FFFFFF',
                    backgroundImage: 'none',
                },
                '::selection': { background: alpha(t.palette.secondary.main, 0.22) },

                '*::-webkit-scrollbar': { width: 10, height: 10 },
                '*::-webkit-scrollbar-thumb': {
                    backgroundColor: alpha(t.palette.primary.main, 0.20),
                    borderRadius: 12,
                    border: '2px solid transparent',
                    backgroundClip: 'padding-box',
                },
                '*::-webkit-scrollbar-thumb:hover': {
                    backgroundColor: alpha(t.palette.primary.main, 0.32),
                },
                '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
            }),
        },

        MuiPaper: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    backgroundImage: 'none',
                    borderRadius: t.shape.borderRadius,
                    border: `1px solid ${alpha(t.palette.primary.main, 0.12)}`,
                }),
                outlined: ({ theme: t }) => ({ borderColor: t.palette.divider }),
            },
        },

        MuiCard: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius,
                    border: `1px solid ${alpha(t.palette.primary.main, 0.14)}`,
                    backgroundImage: 'none',
                    // Keep post cards crisp white so cream backgrounds feel intentional (not muddy)
                    backgroundColor: '#FFFFFF',
                    boxShadow: `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.10)}`,
                    transition: 'box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease',
                    '&:hover': {
                        boxShadow: shadow.lg,
                        borderColor: alpha(t.palette.secondary.main, 0.34),
                        transform: 'translateY(-1px)',
                    },
                }),
            },
        },

        MuiAppBar: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    backgroundColor: alpha(t.palette.background.paper, 0.90),
                    backdropFilter: 'saturate(1.12) blur(10px)',
                    color: t.palette.text.primary,
                    boxShadow: shadow.sm,
                    borderBottom: `1px solid ${alpha(t.palette.primary.main, 0.14)}`,
                }),
            },
        },

        MuiOutlinedInput: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius - 7,
                    // Inputs stay very clean; use a near-white so they pop off the cream
                    backgroundColor: '#FFFFFF',
                    boxShadow: `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.10)}`,
                    transition: 'box-shadow 140ms ease, border-color 140ms ease, background-color 140ms ease',

                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha(t.palette.primary.main, 0.22),
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha(t.palette.primary.main, 0.36),
                    },

                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: t.palette.secondary.main,
                        borderWidth: 2,
                    },

                    '&.Mui-focused': {
                        boxShadow: `0 0 0 4px ${alpha(t.palette.secondary.main, 0.20)}`,
                    },

                    '&.Mui-error .MuiOutlinedInput-notchedOutline': {
                        borderColor: t.palette.error.main,
                    },
                }),
                input: { paddingTop: 12, paddingBottom: 12 },
            },
        },

        // Fix: label background so the outline line never shows behind label text

        // Autocomplete: allow a warm cream input surface where needed
        // Usage: <Autocomplete className="ll-cream-autocomplete" ... />
        // Usage: pass MenuProps={{ PaperProps: { className: 'll-cream-menu-paper' } }} to Select
        MuiAutocomplete: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    '&.ll-cream-autocomplete .MuiOutlinedInput-root': {
                        backgroundColor: '#FFFFFF',
                    },
                    '&.ll-cream-autocomplete .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha(t.palette.primary.main, 0.22),
                    },
                    '&.ll-cream-autocomplete:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha(t.palette.primary.main, 0.36),
                    },
                    '&.ll-cream-autocomplete.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: t.palette.secondary.main,
                        borderWidth: 2,
                    },
                }),
            },
        },

        MuiInputLabel: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    color: t.palette.text.secondary,
                    '&.Mui-focused': { color: t.palette.secondary.dark },
                    '&.MuiInputLabel-shrink': {
                        // Keep label background white so it stays perfectly readable over any surface
                        backgroundColor: '#FFFFFF',
                        padding: '0 7px',
                        borderRadius: 10,
                        lineHeight: 1.15,
                        boxShadow: `0 1px 0 ${alpha(t.palette.primary.main, 0.06)}`,
                    },
                }),
            },
        },

        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: 999,
                    paddingInline: 18,
                    fontWeight: 900,
                    letterSpacing: 0.25,
                }),
                containedPrimary: ({ theme: t }) => ({
                    backgroundColor: t.palette.primary.main,
                    '&:hover': { backgroundColor: t.palette.primary.dark },
                }),
                containedSecondary: ({ theme: t }) => ({
                    backgroundColor: t.palette.secondary.main,
                    color: t.palette.secondary.contrastText,
                    '&:hover': {
                        backgroundColor: t.palette.secondary.dark,
                        color: t.palette.secondary.contrastText,
                    },
                }),
                outlined: ({ theme: t }) => ({
                    borderColor: alpha(t.palette.primary.main, 0.22),
                    '&:hover': {
                        borderColor: alpha(t.palette.secondary.main, 0.44),
                        background: alpha(t.palette.secondary.main, 0.06),
                    },
                }),
                text: ({ theme: t }) => ({
                    '&:hover': { background: alpha(t.palette.primary.main, 0.04) },
                }),
            },
        },

        MuiIconButton: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: 16,
                    '&:hover': { background: alpha(t.palette.primary.main, 0.05) },
                }),
            },
        },

        MuiChip: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: 999,
                    fontWeight: 900,
                }),
                outlined: ({ theme: t }) => ({ borderColor: alpha(t.palette.primary.main, 0.16) }),
            },
        },

        MuiTabs: {
            styleOverrides: {
                indicator: ({ theme: t }) => ({
                    height: 3,
                    borderRadius: 3,
                    backgroundColor: t.palette.secondary.main,
                }),
            },
        },

        MuiTab: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    textTransform: 'none',
                    fontWeight: 900,
                    color: t.palette.text.secondary,
                    minHeight: 'unset',
                    '&.Mui-selected': { color: t.palette.text.primary },
                }),
            },
        },

        MuiDialog: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius + 2,
                    border: `1px solid ${alpha(t.palette.primary.main, 0.14)}`,
                    boxShadow: shadow.lg,
                    backgroundImage: 'none',
                    // Keep dialogs crisp white (premium, readable)
                    backgroundColor: '#FFFFFF',
                }),
            },
        },


        MuiMenu: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    backgroundImage: 'none',
                    backgroundColor: '#FFFFFF',
                    border: `1px solid ${alpha(t.palette.primary.main, 0.12)}`,
                    boxShadow: '0 18px 55px rgba(15, 23, 42, 0.16)',
                    borderRadius: t.shape.borderRadius,
                }),
                list: {
                    paddingTop: 6,
                    paddingBottom: 6,
                },
            },
        },

        MuiPopover: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    backgroundImage: 'none',
                    backgroundColor: '#FFFFFF',
                    border: `1px solid ${alpha(t.palette.primary.main, 0.12)}`,
                    boxShadow: '0 18px 55px rgba(15, 23, 42, 0.16)',
                    borderRadius: t.shape.borderRadius,
                }),
            },
        },

        MuiTooltip: {
            styleOverrides: {
                tooltip: ({ theme: t }) => ({
                    borderRadius: 14,
                    backgroundColor: t.palette.grey[700], // ✅ gray instead of green
                    color: '#fff',
                    fontWeight: 700,
                    boxShadow: shadow.sm,
                }),
                arrow: ({ theme: t }) => ({ color: t.palette.grey[700] }), // ✅ match arrow
            },
        },

        MuiLink: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    fontWeight: 800,
                    color: t.palette.primary.main,
                    '&:hover': { color: t.palette.secondary.dark },
                }),
            },
        },

        MuiListItemButton: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    borderRadius: t.shape.borderRadius - 7,
                    transition: 'background-color 120ms ease',
                    '&:hover': { backgroundColor: alpha(t.palette.primary.main, 0.04) },
                    '&.Mui-selected': {
                        backgroundColor: alpha(t.palette.secondary.main, 0.14),
                        '&:hover': { backgroundColor: alpha(t.palette.secondary.main, 0.18) },
                    },
                }),
            },
        },
    },
});

theme = responsiveFontSizes(theme);

export default theme;