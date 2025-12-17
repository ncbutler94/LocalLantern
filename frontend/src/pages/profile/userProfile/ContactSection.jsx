// src/pages/userProfile/ContactSection.jsx
// Fonts of link text unified to match Community Posts (0.95rem).

import React from 'react';
import {
    Box,
    Typography,
    TextField,
    InputAdornment,
    Link as MuiLink,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import LanguageIcon from '@mui/icons-material/Language';

/** ---- Helpers ---------------------------------------------------------- */

function formatPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function canView(privacyValue, isOwner, isFollower) {
    if (isOwner) return true;
    if (privacyValue === 'public') return true;
    if (privacyValue === 'friends') return !!isFollower;
    return false;
}

const isMobileDevice =
    typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function canonicalizeSocial(raw, which /* 'facebook' | 'instagram' */) {
    const v = String(raw || '').trim();
    if (!v) return '';

    const BASE = which === 'facebook' ? 'https://facebook.com/' : 'https://instagram.com/';
    const domain = which === 'facebook' ? 'facebook.com' : 'instagram.com';

    if (/^https?:\/\//i.test(v) || v.startsWith('www.')) {
        const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
        try {
            const u = new URL(withScheme);
            if (u.hostname.includes(domain)) {
                const path = u.pathname.replace(/^\/+/, '');
                return path ? `${BASE}${path}` : BASE;
            }
            return withScheme;
        } catch {
            return withScheme;
        }
    }

    if (v.toLowerCase().includes(domain)) {
        const idx = v.toLowerCase().indexOf(domain);
        const after = v.slice(idx + domain.length).replace(/^\/+/, '');
        return `${BASE}${after}`;
    }

    const handle = v.replace(/^@/, '');
    return `${BASE}${handle}`;
}

function websiteHref(raw) {
    let v = String(raw || '').trim();
    if (!v) return '';
    const withScheme = /^https?:\/\//i.test(v) ? v : `http://${v}`;
    return withScheme;
}

function websiteDisplay(raw) {
    let v = String(raw || '').trim();
    if (!v) return '';
    const withScheme = /^https?:\/\//i.test(v) ? v : `http://${v}`;
    try {
        const u = new URL(withScheme);
        const host = u.hostname.startsWith('www.') ? u.hostname : `www.${u.hostname}`;
        const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
        const query = u.search || '';
        const hash = u.hash || '';
        return `${host}${path}${query}${hash}`;
    } catch {
        return v.startsWith('www.') ? v : `www.${v}`;
    }
}

function stripSchemeForDisplay(url) {
    if (!url) return '';
    try {
        const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
        const path = u.pathname === '/' ? '' : u.pathname;
        return `${u.hostname}${path}${u.search || ''}${u.hash || ''}`;
    } catch {
        return String(url).replace(/^https?:\/\//i, '').replace(/^\/+/, '');
    }
}

/** ---- Component -------------------------------------------------------- */

export default function ContactSection({
                                           editMode = false,
                                           isOwner = false,
                                           isFollower = false,
                                           privacyValue = 'public',
                                           contact,
                                           onChange,
                                       }) {
    const viewable = canView(privacyValue, isOwner, isFollower);

    const handleChange = (field) => (e) => {
        let v = e.target.value;
        if (field === 'phone') v = formatPhone(v);
        onChange({ ...contact, [field]: v });
    };

    if (!editMode && !viewable) {
        return (
            <Typography variant="body2" color="text.secondary">
                {privacyValue === 'private'
                    ? 'This section is visible to you only.'
                    : 'This section is visible to followers.'}
            </Typography>
        );
    }

    if (editMode) {
        return (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
                <TextField
                    fullWidth
                    label="Phone"
                    placeholder="###-###-####"
                    value={contact.phone || ''}
                    onChange={handleChange('phone')}
                    inputMode="tel"
                    autoComplete="tel"
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <PhoneIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    fullWidth
                    label="Email"
                    placeholder="name@example.com"
                    type="email"
                    value={contact.email || ''}
                    onChange={handleChange('email')}
                    autoComplete="email"
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <EmailIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    fullWidth
                    label="Facebook URL or @handle"
                    placeholder="https://facebook.com/yourpage"
                    value={contact.facebook || ''}
                    onChange={handleChange('facebook')}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <FacebookIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    fullWidth
                    label="Instagram URL or @handle"
                    placeholder="https://instagram.com/yourhandle"
                    value={contact.instagram || ''}
                    onChange={handleChange('instagram')}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <InstagramIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    fullWidth
                    label="Website"
                    placeholder="your-site.com or https://your-site.com"
                    value={contact.website || ''}
                    onChange={handleChange('website')}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <LanguageIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>
        );
    }

    // Read-only rendering
    const hasAny =
        (contact.phone && contact.phone.trim()) ||
        (contact.email && contact.email.trim()) ||
        (contact.facebook && contact.facebook.trim()) ||
        (contact.instagram && contact.instagram.trim()) ||
        (contact.website && contact.website.trim());

    if (!hasAny) {
        return (
            <Typography variant="body2" color="text.secondary">
                No contact info added yet.
            </Typography>
        );
    }

    const facebookUrl = canonicalizeSocial(contact.facebook, 'facebook');
    const instagramUrl = canonicalizeSocial(contact.instagram, 'instagram');
    const websiteUrl = websiteHref(contact.website);
    const websiteText = websiteDisplay(contact.website);

    const items = [
        {
            icon: <PhoneIcon fontSize="small" />,
            label: contact.phone,
            href:
                isMobileDevice && contact.phone && contact.phone.replace(/\D/g, '').length
                    ? `tel:${contact.phone.replace(/\D/g, '')}`
                    : '',
        },
        {
            icon: <EmailIcon fontSize="small" />,
            label: contact.email, // plain text (no mailto)
            href: '',
        },
        {
            icon: <FacebookIcon fontSize="small" />,
            label: stripSchemeForDisplay(facebookUrl),
            href: facebookUrl,
        },
        {
            icon: <InstagramIcon fontSize="small" />,
            label: stripSchemeForDisplay(instagramUrl),
            href: instagramUrl,
        },
        {
            icon: <LanguageIcon fontSize="small" />,
            label: websiteText,
            href: websiteUrl,
        },
    ];

    return (
        <Box sx={{ display: 'grid', gap: 1 }}>
            {items
                .filter((it) => (it.label || '').toString().trim())
                .map((it, idx) => (
                    <Box key={`citem-${idx}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {it.icon}
                        {it.href ? (
                            <MuiLink
                                href={it.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                underline="hover"
                                sx={{ wordBreak: 'break-all', fontSize: '0.95rem' }}
                            >
                                {it.label}
                            </MuiLink>
                        ) : (
                            <Typography sx={{ wordBreak: 'break-all', fontSize: '0.95rem' }}>
                                {it.label}
                            </Typography>
                        )}
                    </Box>
                ))}
        </Box>
    );
}
