// src/hooks/business/useBusinessDetail.js
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';

export default function useBusinessDetail(id, seed) {
    const [business, setBusiness] = useState(seed || null);
    const [reviews, setReviews] = useState([]);
    const [deals, setDeals] = useState([]);
    const [meReview, setMeReview] = useState(null);

    const profileAbort = useRef(null);
    const reviewsAbort = useRef(null);
    const dealsAbort = useRef(null);

    const fetchProfile = useCallback(async () => {
        if (!id) return;
        profileAbort.current?.abort();
        const controller = new AbortController();
        profileAbort.current = controller;
        try {
            const { data } = await axios.get(`/api/businesses/${id}`, {
                signal: controller.signal,
                withCredentials: true,
            });
            if (!controller.signal.aborted) setBusiness(data);
        } catch (e) {
            if (!axios.isCancel(e)) console.error('business profile error', e);
        }
    }, [id]);

    const fetchReviews = useCallback(async () => {
        if (!id) return;
        reviewsAbort.current?.abort();
        const controller = new AbortController();
        reviewsAbort.current = controller;
        try {
            const { data } = await axios.get(`/api/businesses/${id}/reviews`, {
                params: { page: 1, pageSize: 50 },
                signal: controller.signal,
                withCredentials: true,
            });
            if (!controller.signal.aborted) {
                setReviews(data.items || data || []);
                // naive "me" pick: assume API includes user_id; backend keeps it
                const me = (data.items || data || []).find(r => r.is_me) || null;
                setMeReview(me ? { id: me.id, rating: (me.rating_half_stars || 0) / 2, comment: me.comment || '' } : null);
            }
        } catch (e) {
            if (!axios.isCancel(e)) console.error('reviews error', e);
        }
    }, [id]);

    const fetchDeals = useCallback(async () => {
        if (!id) return;
        dealsAbort.current?.abort();
        const controller = new AbortController();
        dealsAbort.current = controller;
        try {
            const { data } = await axios.get(`/api/businesses/${id}/deals`, {
                signal: controller.signal,
            });
            if (!controller.signal.aborted) setDeals(Array.isArray(data) ? data : (data?.items || []));
        } catch (e) {
            if (!axios.isCancel(e)) console.error('deals error', e);
        }
    }, [id]);

    const refresh = useCallback(async () => {
        await Promise.all([fetchProfile(), fetchReviews()]);
    }, [fetchProfile, fetchReviews]);

    const refreshDeals = useCallback(async () => {
        await fetchDeals();
    }, [fetchDeals]);

    useEffect(() => {
        refresh();
        fetchDeals();
        return () => {
            profileAbort.current?.abort();
            reviewsAbort.current?.abort();
            dealsAbort.current?.abort();
        };
    }, [refresh, fetchDeals]);

    const submitReview = useCallback(async (rating, comment) => {
        if (!id) return;
        await axios.post(`/api/businesses/${id}/reviews`, { rating, comment }, { withCredentials: true });
        await refresh();
    }, [id, refresh]);

    const removeMyReview = useCallback(async () => {
        if (!id) return;
        await axios.delete(`/api/businesses/${id}/reviews/me`, { withCredentials: true });
        await refresh();
    }, [id, refresh]);

    return { business, reviews, deals, refresh, refreshDeals, submitReview, removeMyReview, meReview };
}
