// src/components/PostCard/PostCard.jsx
import React from 'react';
import {
    Card, CardHeader, CardContent, CardActions, CardMedia,
    Avatar, Typography, Box, Button, Chip, Stack
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import ReportIcon from '@mui/icons-material/Report';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import FindInPageIcon from '@mui/icons-material/FindInPage';

const toStringSafe = (v) => (v == null ? '' : (typeof v === 'string' ? v : String(v)));
const trimSafe    = (v) => toStringSafe(v).trim();
const firstNonEmpty = (...vals) => {
    for (const v of vals) {
        const t = trimSafe(v);
        if (t) return t;
    }
    return '';
};
const validDate = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d.valueOf()) ? d : null;
};
const dateOnly = (v) => {
    const d = validDate(v);
    return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
};

const makeExcerpt = (txt, maxLen = 300) => {
    const clean = trimSafe(txt).replace(/\s+/g, ' ');
    if (clean.length <= maxLen) return clean;
    const cut = clean.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
};

const CATEGORY_META = {
    'announcement':           { label: 'Announcement',            Icon: CampaignIcon },
    'lost-found':             { label: 'Lost & Found',            Icon: FindInPageIcon },
    'public-safety-alerts':   { label: 'Public Safety Alert',     Icon: ReportIcon },
    'recommendation':         { label: 'Recommendations & Tips',  Icon: TipsAndUpdatesIcon },
    'volunteer-requests':     { label: 'Volunteer',               Icon: VolunteerActivismIcon },
    'post':                   { label: 'Post',                    Icon: CampaignIcon },
};

const FIRST_IMAGE = (post) => {
    const tryVal = (...keys) => {
        for (const k of keys) {
            const v = post?.[k];
            if (!v) continue;
            if (typeof v === 'string') return v;
            if (Array.isArray(v) && v.length) {
                const first = v[0];
                if (typeof first === 'string') return first;
                if (typeof first?.url === 'string') return first.url;
                if (typeof first?.src === 'string') return first.src;
            }
            if (typeof v?.url === 'string') return v.url;
            if (typeof v?.src === 'string') return v.src;
        }
        return '';
    };
    return tryVal('image_url', 'image', 'photo_url', 'photo', 'cover', 'thumb', 'images', 'photos', 'attachments');
};

export default function PostCard({ post, onOpen, actions }) {
    const author = post?.author || post?.user || post?.owner || {};
    const title  = firstNonEmpty(post?.title, post?.name, post?.heading, 'Untitled Post');
    const body   = firstNonEmpty(post?.body, post?.content, post?.description, '');
    const excerpt = makeExcerpt(body);

    const avatarUrl =
        trimSafe(author?.avatar_url) ||
        trimSafe(author?.profile_picture) ||
        trimSafe(post?.user_avatar) ||
        trimSafe(post?.author_avatar) ||
        '';

    const authorName = firstNonEmpty(
        author?.display_name,
        [author?.first_name, author?.last_name].filter(Boolean).join(' '),
        post?.user_name,
        post?.posted_by,
        'Anonymous'
    );

    const createdAt = post?.created_at || post?.createdAt || post?.date || post?.date_created;
    const when = dateOnly(createdAt);

    const categoryKey = trimSafe(post?.category || post?.type || 'post').toLowerCase();
    const { label: categoryLabel, Icon: CatIcon } =
    CATEGORY_META[categoryKey] || { label: (categoryKey || 'Post'), Icon: CampaignIcon };

    const imgUrl = FIRST_IMAGE(post);

    const CARD_HEIGHT = 380;
    const MEDIA_HEIGHT = imgUrl ? 160 : 0;

    return (
        <Card
            variant="outlined"
            sx={{ display: 'flex', flexDirection: 'column', height: CARD_HEIGHT, borderRadius: 2, cursor: onOpen ? 'pointer' : 'default' }}
            onClick={() => onOpen?.(post)}
        >
            {imgUrl ? (
                <CardMedia component="img" image={imgUrl} alt="" sx={{ height: MEDIA_HEIGHT, objectFit: 'cover' }} />
            ) : null}

            <CardHeader
                sx={{ py: 1.25 }}
                avatar={<Avatar src={avatarUrl} alt={authorName} />}
                title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>{trimSafe(title) || 'Untitled Post'}</Typography>}
                subheader={<Typography variant="body2" color="text.secondary" noWrap>{authorName}{when ? ` • ${when}` : ''}</Typography>}
            />

            <Stack direction="row" spacing={1} sx={{ px: 2, pb: 0.5 }}>
                <Chip size="small" icon={<CatIcon fontSize="small" />} label={categoryLabel} variant="outlined" />
            </Stack>

            {excerpt && (
                <CardContent sx={{ pt: 0.5, pb: 1, px: 2, flexGrow: 1, overflow: 'hidden' }}>
                    <Typography
                        variant="body2"
                        sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            whiteSpace: 'normal',
                        }}
                    >
                        {excerpt}
                    </Typography>
                </CardContent>
            )}

            {(onOpen || actions) && (
                <CardActions sx={{ px: 2, pb: 1 }}>
                    {onOpen && (
                        <Button size="small" variant="text" onClick={(e) => { e.stopPropagation(); onOpen?.(post); }}>
                            Read more
                        </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {actions}
                </CardActions>
            )}
        </Card>
    );
}
