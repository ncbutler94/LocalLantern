// frontend/src/utils/imageProcessing.js

const DEFAULT_MAX_LONG_EDGE = 2048;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_BYTES = 1600000; // ~1.6MB target per photo

const canUseCreateImageBitmap =
    typeof window !== 'undefined' && typeof window.createImageBitmap === 'function';

const detectWebpSupport = (() => {
    let cached = null;
    return () => {
        if (cached != null) return cached;
        try {
            const c = document.createElement('canvas');
            c.width = 1;
            c.height = 1;
            const url = c.toDataURL('image/webp');
            cached = typeof url === 'string' && url.startsWith('data:image/webp');
            return cached;
        } catch {
            cached = false;
            return cached;
        }
    };
})();

async function loadBitmap(file) {
    if (canUseCreateImageBitmap) {
        try {
            // imageOrientation: "from-image" fixes iPhone rotation in modern browsers
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            // fall through
        }
        try {
            return await createImageBitmap(file);
        } catch {
            // fall through
        }
    }

    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;

        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas context');

        ctx.drawImage(img, 0, 0);

        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function getBitmapSize(bitmap) {
    const w = Number(bitmap.width || bitmap.naturalWidth || 0);
    const h = Number(bitmap.height || bitmap.naturalHeight || 0);
    return { w, h };
}

function computeTargetSize(w, h, maxLongEdge) {
    if (!w || !h) return { tw: w, th: h };
    const longEdge = Math.max(w, h);
    if (longEdge <= maxLongEdge) return { tw: w, th: h };
    const scale = maxLongEdge / longEdge;
    return { tw: Math.round(w * scale), th: Math.round(h * scale) };
}

function sanitizeBaseName(name) {
    const base = String(name || 'photo').replace(/\.[^/.]+$/, '');
    return base || 'photo';
}

async function canvasToBlob(canvas, type, quality) {
    const q = Math.min(0.95, Math.max(0.4, Number.isFinite(quality) ? quality : DEFAULT_QUALITY));
    return await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), type, q);
    });
}

/**
 * preprocessImages
 * - Enforces maxCount upstream (caller should also cap UI)
 * - Resizes to maxLongEdge
 * - Compresses to WebP when supported (fallback JPEG)
 * - Tries to keep each image under maxBytes without noticeable quality loss
 */
export async function preprocessImages(files, opts = {}) {
    const list = Array.isArray(files) ? files : Array.from(files || []);
    const maxCount = Number.isFinite(opts.maxCount) ? Math.max(0, opts.maxCount) : list.length;
    const maxLongEdge = Number.isFinite(opts.maxLongEdge) ? Math.max(256, opts.maxLongEdge) : DEFAULT_MAX_LONG_EDGE;
    const maxBytes = Number.isFinite(opts.maxBytes) ? Math.max(150000, opts.maxBytes) : DEFAULT_MAX_BYTES;
    const baseQuality = Number.isFinite(opts.quality) ? Math.min(0.92, Math.max(0.5, opts.quality)) : DEFAULT_QUALITY;

    const out = [];
    const useWebp = detectWebpSupport();
    const mime = useWebp ? 'image/webp' : 'image/jpeg';
    const ext = useWebp ? 'webp' : 'jpg';

    const slice = list
        .filter((f) => f && String(f.type || '').startsWith('image/'))
        .slice(0, maxCount);

    for (const file of slice) {
        // If already small-ish, keep as-is (but still enforce dimension cap)
        if (file.size <= maxBytes) {
            const bitmap = await loadBitmap(file);
            const { w, h } = getBitmapSize(bitmap);
            const { tw, th } = computeTargetSize(w, h, maxLongEdge);

            if (tw === w && th === h) {
                out.push(file);
                if (bitmap && typeof bitmap.close === 'function') bitmap.close();
                continue;
            }

            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
        }

        const bitmap = await loadBitmap(file);
        const { w, h } = getBitmapSize(bitmap);
        const { tw, th } = computeTargetSize(w, h, maxLongEdge);

        const canvas = document.createElement('canvas');
        canvas.width = tw || w;
        canvas.height = th || h;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            out.push(file);
            continue;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        if (bitmap && typeof bitmap.close === 'function') bitmap.close();

        let quality = baseQuality;
        let blob = await canvasToBlob(canvas, mime, quality);

        // Try stepping quality down slightly if still too large
        const steps = [0.78, 0.72, 0.66, 0.6, 0.54];
        let i = 0;
        while (blob && blob.size > maxBytes && i < steps.length) {
            quality = steps[i];
            blob = await canvasToBlob(canvas, mime, quality);
            i += 1;
        }

        if (!blob) {
            out.push(file);
            continue;
        }

        const baseName = sanitizeBaseName(file.name);
        const newName = `${baseName}.${ext}`;

        out.push(new File([blob], newName, { type: mime, lastModified: Date.now() }));
    }

    return out;
}
