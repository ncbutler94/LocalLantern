import fs from 'fs/promises';
import express from 'express';

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function absoluteUrl(base, maybeUrl) {
    const u = String(maybeUrl || '').trim();
    if (!u) return '';
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/')) return `${base}${u}`;
    return `${base}/${u}`;
}

function normalizeBaseUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function readIndexHtml(buildIndexHtmlPath) {
    try {
        const indexPath = buildIndexHtmlPath();
        const html = await fs.readFile(indexPath, 'utf8');
        if (!html || typeof html !== 'string') return null;
        return html;
    } catch {
        return null;
    }
}

function minimalHtmlShell(title, ogBlock) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
${ogBlock}
</head>
<body>
<div id="root"></div>
</body>
</html>`;
}

export default function createOgPostsPreviewRouter({ getPostById, buildIndexHtmlPath, siteBaseUrl }) {
    if (!getPostById || !buildIndexHtmlPath || !siteBaseUrl) {
        throw new Error('createOgPostsPreviewRouter missing required config: getPostById, buildIndexHtmlPath, siteBaseUrl');
    }

    const base = normalizeBaseUrl(siteBaseUrl);
    const router = express.Router();

    router.get('/posts/:id', async (req, res, next) => {
        try {
            const { id } = req.params;

            const indexHtml = await readIndexHtml(buildIndexHtmlPath);

            let post = null;
            try {
                post = await getPostById(id);
            } catch {
                post = null;
            }

            const titleRaw =
                post?.title ||
                post?.post_title ||
                post?.headline ||
                post?.name ||
                'The Local Lantern';

            const descRaw =
                post?.description ||
                post?.text ||
                post?.body ||
                post?.content ||
                post?.caption ||
                post?.details ||
                '';

            const descClean = String(descRaw).replace(/\s+/g, ' ').trim();
            const description = descClean.length > 280 ? `${descClean.slice(0, 280)}…` : descClean;

            const imageRaw =
                post?.og_image ||
                post?.cover_photo ||
                post?.coverPhoto ||
                post?.image_url ||
                post?.imageUrl ||
                post?.photo_url ||
                post?.photoUrl ||
                post?.thumbnail_url ||
                post?.thumbnailUrl ||
                '';

            const url = `${base}/posts/${encodeURIComponent(id)}`;
            const image = absoluteUrl(base, imageRaw) || `${base}/favicon.ico`;

            const ogBlock = [
                `<meta property="og:type" content="article" />`,
                `<meta property="og:site_name" content="The Local Lantern" />`,
                `<meta property="og:title" content="${esc(titleRaw)}" />`,
                `<meta property="og:description" content="${esc(description)}" />`,
                `<meta property="og:url" content="${esc(url)}" />`,
                `<meta property="og:image" content="${esc(image)}" />`,
                `<meta property="og:image:alt" content="${esc(titleRaw)}" />`,
                `<meta name="twitter:card" content="summary_large_image" />`,
                `<meta name="twitter:title" content="${esc(titleRaw)}" />`,
                `<meta name="twitter:description" content="${esc(description)}" />`,
                `<meta name="twitter:image" content="${esc(image)}" />`,
            ].join('\n');

            let html = indexHtml
                ? indexHtml.replace(/<title>.*?<\/title>/i, `<title>${esc(titleRaw)}</title>`)
                : minimalHtmlShell(titleRaw, ogBlock);

            if (indexHtml) {
                html = html.replace(/<\/head>/i, `${ogBlock}\n</head>`);
            }

            res.setHeader('Cache-Control', 'public, max-age=300');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(html);
        } catch (err) {
            return next(err);
        }
    });

    return router;
}
