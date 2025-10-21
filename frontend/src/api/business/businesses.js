export async function listBusinesses(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/businesses${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to load businesses');
    return res.json();
}

export async function createBusiness(payload) {
    const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to create business');
    return json.business;
}

export async function getSignedUrl({ folder, fileName, contentType }) {
    const res = await fetch('/api/uploads/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, fileName, contentType }),
    });
    if (!res.ok) throw new Error('Could not get signed URL');
    return res.json();
}

/* ---------- Detail ---------- */
export async function getBusinessById(id) {
    const res = await fetch(`/api/businesses/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load business');
    return res.json();
}

export async function listReviews(id, { page = 1, pageSize = 50 } = {}) {
    const res = await fetch(`/api/businesses/${id}/reviews?page=${page}&pageSize=${pageSize}`, {
        credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to load reviews');
    return res.json();
}

export async function upsertReview(id, { rating, comment }) {
    const res = await fetch(`/api/businesses/${id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rating, comment }),
    });
    if (!res.ok) throw new Error('Failed to submit review');
    return res.json();
}

export async function deleteMyReview(id) {
    const res = await fetch(`/api/businesses/${id}/reviews/me`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete review');
    return res.json();
}

export async function listDeals(id) {
    const res = await fetch(`/api/businesses/${id}/deals`);
    if (!res.ok) throw new Error('Failed to load deals');
    return res.json();
}

/* ---------- Media ---------- */
export async function listBusinessMedia(businessId) {
    const res = await fetch(`/api/businesses/${businessId}/media`);
    if (!res.ok) throw new Error('Failed to load media');
    return res.json(); // { ok, items }
}

export async function addBusinessMedia(businessId, { type, url, caption, sort_order = 0 }) {
    const res = await fetch(`/api/businesses/${businessId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, url, caption, sort_order }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to add media');
    return j.media;
}

export async function deleteBusinessMedia(businessId, mediaId) {
    const res = await fetch(`/api/businesses/${businessId}/media/${mediaId}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to delete media');
    return j;
}

export async function reorderBusinessMedia(businessId, items) {
    const res = await fetch(`/api/businesses/${businessId}/media/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to reorder media');
    return j;
}

/* ---------- Media comments & likes ---------- */
export async function listMediaComments(mediaId) {
    const res = await fetch(`/api/businesses/media/${mediaId}/comments`);
    if (!res.ok) throw new Error('Failed to load comments');
    return res.json();
}

export async function addMediaComment(mediaId, text) {
    const res = await fetch(`/api/businesses/media/${mediaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to add comment');
    return j.comment;
}

export async function getMediaLikeStatus(mediaId) {
    const res = await fetch(`/api/businesses/media/${mediaId}/likes`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load like status');
    return res.json(); // { ok, count, liked }
}

export async function toggleMediaLike(mediaId) {
    const res = await fetch(`/api/businesses/media/${mediaId}/likes/toggle`, {
        method: 'POST',
        credentials: 'include',
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to toggle like');
    return j; // { ok, liked, count }
}
