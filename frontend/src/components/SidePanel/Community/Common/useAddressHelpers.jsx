import { useState, useCallback } from 'react';
import { coordsFromLocalData }   from './useBasePostForm';

/**
 * Adds street-address state + a coordinate resolver.
 * Pass in the parent form’s { city, county } so we can look up centroids.
 */
export default function useAddressHelpers({ city, county }) {
    const [streetAddress, setStreetAddress] = useState('');

    /* city becomes required as soon as user types an address */
    const cityRequired = Boolean(streetAddress.trim());

    /**
     * Resolves [lat, lng] using Google when an address is given, or falls back
     * to local centroid JSON for city / county only.
     */
    const resolveCoordinates = useCallback(async () => {
        if (streetAddress.trim()) {
            const address = [streetAddress.trim(), city, county, 'Alabama']
                .filter(Boolean)
                .join(', ');
            const res = await fetch('/api/geocode-google', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ address })
            });
            if (!res.ok) {
                const msg =
                    res.status === 404 ? 'Address not found.' : 'Geocode request failed.';
                throw new Error(msg);
            }
            const { lat, lng } = await res.json();
            return [lat, lng];
        }

        /* else → centroid */
        const local = coordsFromLocalData(city, county);
        if (local) return local;

        throw new Error('Unable to determine coordinates for that city / county.');
    }, [streetAddress, city, county]);

    return {
        streetAddress,
        setStreetAddress,
        cityRequired,
        resolveCoordinates
    };
}
