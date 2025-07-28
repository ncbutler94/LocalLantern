// src/hooks/community/useCommunityData.js
import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Custom hook to fetch community posts and GeoJSON points.
 * @param {{ city:string, county:string, search:string, view:string,
 *           subtype:string, sort:string, dateRange:string }} filters
 */
export default function useCommunityData({
                                             city,
                                             county,
                                             search,
                                             view,
                                             subtype,
                                             sort,
                                             dateRange,
                                         }) {
    const [posts, setPosts] = useState([]);
    const [points, setPoints] = useState({
        type: 'FeatureCollection',
        features: [],
    });
    const [isLoading, setIsLoading] = useState(false);

    /* helper → generate GeoJSON Features */
    const toFeatures = (items) =>
        items
            .filter((p) => p.latitude != null && p.longitude != null)
            .map((p) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [Number(p.longitude), Number(p.latitude)],
                },
                properties: { id: `c${p.id}`, category: p.category },
            }));

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data } = await axios.get('/api/community', {
                params: { view, search, subtype, sort, dateRange, city, county },
                withCredentials: true,
            });

            setPosts(data);
            setPoints({
                type: 'FeatureCollection',
                features: toFeatures(data),
            });
        } catch (err) {
            console.error('useCommunityData fetch error:', err);
            setPosts([]);
            setPoints({ type: 'FeatureCollection', features: [] });
        } finally {
            setIsLoading(false);
        }
    };

    /* refetch whenever filters change */
    useEffect(() => {
        fetchData();
    }, [city, county, search, view, subtype, sort, dateRange]);

    return { posts, points, isLoading, refetch: fetchData };
}
