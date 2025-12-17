// src/api/businesses.js
// Canonical business API helpers used across the app.
// These mirror the backend /api/businesses routes.
//
// Notes:
// - Public reads do not require auth; owner actions send credentials.
// - Media comment creation uses FormData (multipart) to support optional images.

async function jsonOrThrow(res) {
    let parsed = null;
    try {
        parsed = await res.json();
    } catch {
        /* ignore parse errors; we'll still surface HTTP status text below */
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

/* --------------------------------- List ---------------------------------- */
export async function listBusinesses(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/businesses${qs ? `?${qs}` : ''}`, { credentials: 'include' });
    return jsonOrThrow(res); // { ok, items }
}

/* -------------------------------- Create --------------------------------- */
export async function createBusiness(payload) {
    const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const j = await jsonOrThrow(res);
    if (!j.ok) throw new Error(j.error || 'Failed to create business');
    return j.business;
}

/* ---------------------------- Signed URL (opt) ---------------------------- */
export async function getSignedUrl({ folder, fileName, contentType }) {
    const res = await fetch('/api/uploads/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folder, fileName, contentType }),
    });
    return jsonOrThrow(res);
}

/* -------------------------------- Detail --------------------------------- */
export async function getBusinessById(id) {
    const res = await fetch(`/api/businesses/${id}`, { credentials: 'include' });
    return jsonOrThrow(res);
}

/* ------------------------------ Update (PATCH) ---------------------------- */
/** Owner-only: update profile fields, hours/amenities JSON, socials, etc. */
export async function updateBusiness(id, payload = {}) {
    const res = await fetch(`/api/businesses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    return jsonOrThrow(res); // { ok, business }
}

/* -------------------------------- Reviews -------------------------------- */
export async function listReviews(id) {
    // Backend returns { ok, items, can_reply, me_review }
    const res = await fetch(`/api/businesses/${id}/reviews`, { credentials: 'include' });
    return jsonOrThrow(res);
}

export async function upsertReview(id, { rating, comment }) {
    const res = await fetch(`/api/businesses/${id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rating, comment }),
    });
    return jsonOrThrow(res);
}

export async function deleteMyReview(id) {
    const res = await fetch(`/api/businesses/${id}/reviews/me`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return jsonOrThrow(res);
}

/* Owner reply to a specific review */
export async function replyToReviewApi(reviewId, text) {
    const res = await fetch(`/api/businesses/reviews/${reviewId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
    });
    return jsonOrThrow(res);
}

/* --------------------------------- Deals --------------------------------- */
export async function listDeals(id) {
    const res = await fetch(`/api/businesses/${id}/deals`, { credentials: 'include' });
    return jsonOrThrow(res); // { ok, items }
}

/* --------------------------------- Media --------------------------------- */
export async function listBusinessMedia(businessId) {
    const res = await fetch(`/api/businesses/${businessId}/media`, { credentials: 'include' });
    return jsonOrThrow(res); // { ok, items }
}

export async function addBusinessMedia(businessId, { type, url, caption, sort_order = 0 }) {
    const res = await fetch(`/api/businesses/${businessId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, url, caption, sort_order }),
    });
    const j = await jsonOrThrow(res);
    if (!j.ok) throw new Error(j.error || 'Failed to add media');
    return j.media;
}

export async function deleteBusinessMedia(businessId, mediaId) {
    const res = await fetch(`/api/businesses/${businessId}/media/${mediaId}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    const j = await jsonOrThrow(res);
    if (!j.ok) throw new Error(j.error || 'Failed to delete media');
    return j;
}

export async function reorderBusinessMedia(businessId, items) {
    const res = await fetch(`/api/businesses/${businessId}/media/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items }),
    });
    const j = await jsonOrThrow(res);
    if (!j.ok) throw new Error(j.error || 'Failed to reorder media');
    return j;
}

/* ----------------------- Media comments & likes --------------------------- */
export async function listMediaComments(mediaId, { sort = 'popular' } = {}) {
    const res = await fetch(
        `/api/businesses/media/${mediaId}/comments?sort=${encodeURIComponent(sort)}`,
        { credentials: 'include' }
    );
    return jsonOrThrow(res); // { ok, items }
}

export async function addMediaComment(mediaId, { text, imageFile, parent_id } = {}) {
    const fd = new FormData();
    if (text != null) fd.set('text', String(text));
    if (parent_id != null) fd.set('parent_id', String(parent_id));
    if (imageFile instanceof File) fd.set('image', imageFile);
    const res = await fetch(`/api/businesses/media/${mediaId}/comments`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
    });
    return jsonOrThrow(res); // { ok, comment }
}

export async function getMediaLikeStatus(mediaId) {
    const res = await fetch(`/api/businesses/media/${mediaId}/likes`, { credentials: 'include' });
    return jsonOrThrow(res); // { ok, count, liked }
}

export async function toggleMediaLike(mediaId) {
    const res = await fetch(`/api/businesses/media/${mediaId}/likes/toggle`, {
        method: 'POST',
        credentials: 'include',
    });
    return jsonOrThrow(res); // { ok, liked, count }
}

/* ------------------------------ Business Posts ---------------------------- */
/** Posts authored by any owner of the business (community posts). */
export async function listBusinessPosts(businessId, { limit = 60 } = {}) {
    const qs = new URLSearchParams({ limit }).toString();
    const res = await fetch(`/api/businesses/${businessId}/posts?${qs}`, { credentials: 'include' });
    return jsonOrThrow(res); // { ok, items }
}

/* --------------------------------- Follow -------------------------------- */
/** Follow / Unfollow a business (viewer). action: 'follow' | 'unfollow' */
export async function setBusinessFollow(businessId, action) {
    const res = await fetch(`/api/businesses/${businessId}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
    });
    return jsonOrThrow(res); // { ok, isFollowing, followers }
}
