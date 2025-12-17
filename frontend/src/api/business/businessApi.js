// src/api/business/businessApi.js
// ------------------------------------------------------------------
// Business Detail API helpers (fetch + credentials).
// Shapes match your /api/businesses routes.  Throws on non-OK.
// ------------------------------------------------------------------

const BASE = '';

async function jsonOrThrow(res) {
    let parsed = null;
    try {
        parsed = await res.json();
    } catch {
        /* ignore parse error; fall back to status text below */
    }
    if (!res.ok) {
        const msg = parsed?.error || parsed?.message || `${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        err.payload = parsed;
        throw err;
    }
    return parsed;
}

/* --------- Business core --------- */
export async function getBusiness(id, { signal } = {}) {
    const res = await fetch(`${BASE}/api/businesses/${id}`, { credentials: 'include', signal });
    return jsonOrThrow(res);
}
export async function getBusinessMedia(id, { signal } = {}) {
    const res = await fetch(`${BASE}/api/businesses/${id}/media`, { credentials: 'include', signal });
    return jsonOrThrow(res);
}

/**
 * PATCH /api/businesses/:id
 * Owner-only: update fields like long_description, website, phone, price_range,
 * hours_json, amenities_json, socials, links, etc.
 * Expects a plain object; JSON-serializes for the request body.
 */
export async function updateBusiness(id, payload = {}) {
    const res = await fetch(`${BASE}/api/businesses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
}

/* --------- Media comments & likes --------- */
export async function getMediaComments(mediaId, { sort = 'popular', signal } = {}) {
    const res = await fetch(
        `${BASE}/api/businesses/media/${mediaId}/comments?sort=${encodeURIComponent(sort)}`,
        { credentials: 'include', signal }
    );
    return jsonOrThrow(res);
}

export async function postMediaComment(mediaId, formData) {
    // formData may include: text, image (File), parent_id
    const res = await fetch(`${BASE}/api/businesses/media/${mediaId}/comments`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });
    return jsonOrThrow(res);
}

export async function toggleCommentLike(commentId) {
    const res = await fetch(`${BASE}/api/businesses/media/comments/${commentId}/like`, {
        method: 'POST',
        credentials: 'include',
    });
    return jsonOrThrow(res);
}

export async function getMediaLikes(mediaId, { signal } = {}) {
    const res = await fetch(`${BASE}/api/businesses/media/${mediaId}/likes`, {
        credentials: 'include',
        signal,
    });
    return jsonOrThrow(res);
}

export async function toggleMediaLike(mediaId) {
    const res = await fetch(`${BASE}/api/businesses/media/${mediaId}/likes/toggle`, {
        method: 'POST',
        credentials: 'include',
    });
    return jsonOrThrow(res);
}

/* --------- Reviews --------- */
export async function getReviews(businessId, { signal } = {}) {
    const res = await fetch(`${BASE}/api/businesses/${businessId}/reviews`, {
        credentials: 'include',
        signal,
    });
    return jsonOrThrow(res);
}

export async function createOrUpdateReview(businessId, { rating, comment, image_url } = {}) {
    const body = { rating, comment };
    if (image_url) body.image_url = image_url; // backend can ignore safely for now
    const res = await fetch(`${BASE}/api/businesses/${businessId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
    });
    return jsonOrThrow(res);
}

export async function deleteMyReview(businessId) {
    const res = await fetch(`${BASE}/api/businesses/${businessId}/reviews/me`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return jsonOrThrow(res);
}

export async function replyToReview(reviewId, text) {
    const res = await fetch(`${BASE}/api/businesses/reviews/${reviewId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'include',
    });
    return jsonOrThrow(res);
}
