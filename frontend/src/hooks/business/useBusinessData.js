import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

/**
 * Fetch businesses + build GeoJSON for map.
 * Works with either:
 *   - Array response:        [ { ... } ]
 *   - Object response shape: { ok: true, items: [ ... ] }
 * Only includes businesses validated/verified (validation == 1 || verified == 1).
 * Cleans up requests to avoid destroy-function warnings.
 */
export default function useBusinessData({ search, city, county, category, sort }) {
    const [businesses, setBusinesses] = useState([]);
    const [points, setPoints] = useState({ type: 'FeatureCollection', features: [] });
    const [isLoading, setIsLoading] = useState(false);

    const abortRef = useRef(null);

    const normalize = (row) => {
        const validation = Number(row.validation ?? row.verified ?? 0);
        const lat = row.latitude != null ? Number(row.latitude) : null;
        const lng = row.longitude != null ? Number(row.longitude) : null;
        return {
            id: row.id,
            name: row.name ?? row.business_name ?? '',
            category: row.category ?? '',
            city: row.city ?? '',
            county: row.county ?? '',
            latitude: lat,
            longitude: lng,
            // prefer snake_case from backend, fall back to camelCase
            logoUrl: row.logo_url || row.logoUrl || '',
            coverUrl: row.cover_url || row.coverUrl || (Array.isArray(row.photos) ? row.photos[0] : ''),
            description: row.description ?? row.bio ?? '',
            validation,
            // optional metadata if present
            rating: Number(row.rating ?? 0),
            ratingCount: Number(row.rating_count ?? row.ratingCount ?? 0),
            likesCount: Number(row.likesCount ?? 0),
            slug: row.slug,
            hours: row.hours,
            street_address: row.street_address,
            photos: row.photos,
        };
    };

    const toFeatures = useCallback((items) =>
        items
            .filter((b) => b.latitude != null && b.longitude != null)
            .map((b) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [Number(b.longitude), Number(b.latitude)] },
                properties: {
                    id: `b${b.id}`,
                    category: b.category || 'business',
                    logoUrl: b.logoUrl || '',
                },
            })), []
    );

    const fetchData = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        try {
            const { data } = await axios.get('/api/businesses', {
                params: { search, city, county, category, sort },
                withCredentials: true,
                signal: controller.signal,
            });

            const raw = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
            const normalized = raw.map(normalize).filter((b) => Number(b.validation) === 1);

            if (controller.signal.aborted) return;
            setBusinesses(normalized);
            setPoints({ type: 'FeatureCollection', features: toFeatures(normalized) });
        } catch (err) {
            if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED') return;
            console.error('useBusinessData fetch error:', err);
            if (abortRef.current?.signal?.aborted) return;
            setBusinesses([]);
            setPoints({ type: 'FeatureCollection', features: [] });
        } finally {
            if (!abortRef.current?.signal?.aborted) {
                setIsLoading(false);
            }
        }
    }, [search, city, county, category, sort, toFeatures]);

    useEffect(() => {
        fetchData();
        return () => abortRef.current?.abort();
    }, [fetchData]);

    return { businesses, points, isLoading, refetch: fetchData };
}
