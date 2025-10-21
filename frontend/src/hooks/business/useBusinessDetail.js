// src/hooks/business/useBusinessDetail.js
// Robust, null‑safe fetch + normalization for the Business Profile.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { getBusiness, getBusinessMedia } from '../../api/business/businessApi';

export default function useBusinessDetail(businessId, { enabled = true, initialData = null } = {}) {
    const [data, setData] = useState(initialData);
    const [media, setMedia] = useState([]);
    const [loading, setLoading] = useState(Boolean(enabled && !initialData));
    const [error, setError] = useState(null);

    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);

    const load = useCallback(async () => {
        if (!enabled || !businessId) return;
        const ac = new AbortController();
        setLoading(true);
        setError(null);

        try {
            const rawBiz = await getBusiness(businessId, { signal: ac.signal });
            const biz = rawBiz?.business || rawBiz?.item || rawBiz || null;

            let mediaRes = [];
            try {
                const res = await getBusinessMedia(businessId, { signal: ac.signal });
                mediaRes = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
            } catch {
                mediaRes = [];
            }

            if (!alive.current || ac.signal.aborted) return;

            setData(biz || null);
            setMedia(mergeMedia(parseGallery(biz?.gallery_urls), mediaRes));
        } catch (e) {
            if (!alive.current || e?.name === 'AbortError') return;
            setError(e);
            setData(null);
            setMedia([]);
        } finally {
            if (alive.current) setLoading(false);
        }

        return () => ac.abort();
    }, [businessId, enabled]);

    useEffect(() => { load(); }, [load]);

    const normalized = useMemo(() => normalizeBusiness(data), [data]);
    return { data: normalized, raw: data, media, loading, error, refetch: load };
}

/* ---------- helpers ---------- */
function parseGallery(jsonish) {
    try {
        if (!jsonish) return [];
        const arr = Array.isArray(jsonish) ? jsonish : JSON.parse(jsonish);
        return (arr || []).filter(Boolean).map((url, i) => ({
            id: `g${i}`, business_id: null, type: 'photo', url, caption: null, sort_order: i, created_at: null
        }));
    } catch { return []; }
}
function mergeMedia(a = [], b = []) {
    const seen = new Set(); const out = [];
    for (const m of [...a, ...b]) {
        const key = m?.url || m?.id; if (!key || seen.has(key)) continue;
        seen.add(key); out.push(m);
    }
    return out;
}
function normalizeBusiness(b) {
    if (!b || typeof b !== 'object') return null;
    const rating =
        Number(
            b.avg_rating ??
            b.rating ??
            (typeof b.rating_half_stars === 'number' ? b.rating_half_stars / 2 : 0)
        ) || 0;
    const review_count = Number(b.review_count ?? b.reviews_count ?? 0) || 0;
    return { ...b, rating, review_count };
}
