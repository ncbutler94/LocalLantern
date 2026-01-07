// src/hooks/community/useCommunityData.js
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch community posts + build GeoJSON points for markers.
 *
 * Supports:
 * - view=all|mine|following|trending
 * - subtype (category/subtype filter)
 * - sort=newest|popular|trending|random
 * - randomSeed (stable pseudo-random ordering for paging when sort=random)
 * - includeTotal=1 (backend returns X-Total-Count)
 */
export default function useCommunityData({
                                             city = '',
                                             county = '',
                                             search = '',
                                             view = 'all',
                                             subtype = '',
                                             sort = 'newest',
                                             dateRange = 'all',
                                             window = '48h',
                                             limit = 100,
                                             offset = 0,
                                             randomSeed = '',
                                         } = {}) {
    const [posts, setPosts] = useState([]);
    const [points, setPoints] = useState({ type: 'FeatureCollection', features: [] });
    const [totalCount, setTotalCount] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const abortRef = useRef(null);

    const buildPoints = useCallback((items) => {
        const arr = Array.isArray(items) ? items : [];
        const features = arr
            .filter((p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)))
            .map((p) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [Number(p.longitude), Number(p.latitude)],
                },
                properties: {
                    id: p.id,
                    category: p.category || '',
                },
            }));

        return { type: 'FeatureCollection', features };
    }, []);

    const fetchData = useCallback(async () => {
        if (abortRef.current) {
            try {
                abortRef.current.abort();
            } catch {
                // ignore
            }
        }

        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);

        try {
            const params = new URLSearchParams();

            const v = String(view || 'all').trim().toLowerCase();
            const s = String(sort || 'newest').trim().toLowerCase();
            const st = String(subtype || '').trim().toLowerCase();

            if (city) params.set('city', String(city).trim());
            if (county) params.set('county', String(county).trim());
            if (search) params.set('search', String(search).trim());
            if (v) params.set('view', v);
            if (st) params.set('subtype', st);
            if (s) params.set('sort', s);
            if (dateRange) params.set('dateRange', String(dateRange).trim().toLowerCase());
            if (window) params.set('window', String(window).trim().toLowerCase());

            if (s === 'random' && randomSeed) params.set('randomSeed', String(randomSeed));

            params.set('limit', String(Number.isFinite(Number(limit)) ? Number(limit) : 100));
            params.set('offset', String(Number.isFinite(Number(offset)) ? Number(offset) : 0));
            params.set('includeTotal', '1');

            const res = await fetch(`/api/community?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
                signal: controller.signal,
            });

            if (!res.ok) {
                setPosts([]);
                setPoints({ type: 'FeatureCollection', features: [] });
                setTotalCount(null);
                return;
            }

            const data = await res.json();
            const arr = Array.isArray(data) ? data : [];
            setPosts(arr);
            setPoints(buildPoints(arr));

            const headerVal = Number(res.headers.get('x-total-count'));
            if (Number.isFinite(headerVal)) setTotalCount(headerVal);
            else setTotalCount(null);
        } catch (err) {
            const aborted = err?.name === 'AbortError';
            if (!aborted) {
                setPosts([]);
                setPoints({ type: 'FeatureCollection', features: [] });
                setTotalCount(null);
            }
        } finally {
            setIsLoading(false);
        }
    }, [buildPoints, city, county, dateRange, limit, offset, randomSeed, search, sort, subtype, view, window]);

    useEffect(() => {
        fetchData();
        return () => {
            if (abortRef.current) {
                try {
                    abortRef.current.abort();
                } catch {
                    // ignore
                }
            }
        };
    }, [fetchData]);

    return { posts, points, totalCount, isLoading, refetch: fetchData };
}
