/**
 * @file Тема MUI для расписания и админки.
 * Палитра и радиус совпадают с публичными страницами: один залитый акцент — чёрный.
 * Чипы типов слота держат цвета main: info, error, success, но мягкой заливкой.
 * Скелет — серая плашка #f3f3f3, радиус 12, лёгкая волна.
 */
import { createTheme } from '@mui/material/styles';

const ink = '#111111';
const muted = '#767676';
const line = '#e6e6e6';

/**
 * Светлая тема без синих акцентов MUI по умолчанию.
 * @returns Тема для ThemeProvider
 */
export const appTheme = createTheme({
    palette: {
        mode: 'light',
        primary: { main: ink, contrastText: '#ffffff' },
        error: { main: '#8f2d2d' },
        text: { primary: ink, secondary: muted },
        divider: line,
        background: { default: '#ffffff', paper: '#ffffff' },
    },
    shape: { borderRadius: 12 },
    typography: {
        fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
        h1: { fontSize: 22, fontWeight: 650, lineHeight: 1.2 },
        h2: { fontSize: 16, fontWeight: 650, lineHeight: 1.3 },
        h3: { fontSize: 16, fontWeight: 650, lineHeight: 1.3 },
        body1: { fontSize: 15, lineHeight: 1.45 },
        body2: { fontSize: 15, lineHeight: 1.45, color: muted },
        button: { fontSize: 15, fontWeight: 650, textTransform: 'none' },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: { minHeight: 44, borderRadius: 12, textTransform: 'none' },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    border: `1px solid ${line}`,
                    borderRadius: 12,
                    background: '#fff',
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    height: 28,
                    borderRadius: 999,
                    fontWeight: 650,
                },
                colorInfo: {
                    backgroundColor: 'var(--chip-rehearsal-bg)',
                    color: 'var(--chip-rehearsal-fg)',
                    border: '1px solid var(--chip-rehearsal-line)',
                },
                colorError: {
                    backgroundColor: 'var(--chip-recording-bg)',
                    color: 'var(--chip-recording-fg)',
                    border: '1px solid var(--chip-recording-line)',
                },
                colorSuccess: {
                    backgroundColor: 'var(--chip-shooting-bg)',
                    color: 'var(--chip-shooting-fg)',
                    border: '1px solid var(--chip-shooting-line)',
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    minHeight: 44,
                    fontSize: 16,
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: ink,
                        borderWidth: 1,
                    },
                },
                notchedOutline: { borderColor: line },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: {
                    color: muted,
                    '&.Mui-focused': { color: ink },
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    minHeight: 44,
                    textTransform: 'none',
                    fontWeight: 650,
                    fontSize: 15,
                    color: muted,
                    '&.Mui-selected': { color: ink },
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: { backgroundColor: ink, height: 1 },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: { backgroundImage: 'none' },
            },
        },
        MuiSkeleton: {
            defaultProps: { animation: 'wave', variant: 'rounded' },
            styleOverrides: {
                root: { backgroundColor: '#f3f3f3' },
                rounded: { borderRadius: 12 },
            },
        },
    },
});
