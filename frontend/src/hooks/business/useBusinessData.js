// src/hooks/business/useBusinessData.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

/**
 * Fetch businesses + build GeoJSON for map.
 * Matches the API shape used by Community (list + geojson), but for /api/businesses.
 * Safe if API isn't ready yet: falls back to [].
 */
export default function useBusinessData({ search, city, county, category, sort }) {
    const [businesses, setBusinesses] = useState([]);
    const [points, setPoints] = useState({ type: 'FeatureCollection', features: [] });
    const [isLoading, setIsLoading] = useState(false);

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
        setIsLoading(true);
        try {
            const { data } = await axios.get('/api/businesses', {
                params: { search, city, county, category, sort },
                withCredentials: true,
            });
            setBusinesses(Array.isArray(data) ? data : []);
            setPoints({ type: 'FeatureCollection', features: toFeatures(Array.isArray(data) ? data : []) });
        } catch (err) {
            console.error('useBusinessData fetch error:', err);
            setBusinesses([]);
            setPoints({ type: 'FeatureCollection', features: [] });
        } finally {
            setIsLoading(false);
        }
    }, [search, city, county, category, sort, toFeatures]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { businesses, points, isLoading, refetch: fetchData };
}
