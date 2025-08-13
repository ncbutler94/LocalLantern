// src/api/businesses/businesses.js
export async function listBusinesses(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/businesses${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to load businesses');
    return res.json(); // { businesses, points }
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
    return res.json(); // { uploadUrl, publicUrl, objectPath }
}
