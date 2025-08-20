// src/api/businesses/businesses.js
export async function listBusinesses(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/businesses${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to load businesses');
    return res.json(); // { ok, items } or array (normalized by hook)
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

/* ---------- New helpers for the Detail Modal ---------- */
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
