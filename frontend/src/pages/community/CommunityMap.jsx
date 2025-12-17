// CommunityMap.jsx
import React, { useRef, useMemo } from 'react';
import MapView from './CommunityMapView';

/**
 * CommunityMap
 * ------------
 * Small, defensive wrapper around MapView so callers can safely pass
 * undefined/null/incorrect shapes without breaking the map. Also exposes
 * an internal ref for future map programmatic controls.
 */
export default function CommunityMap({
                                         points,
                                         center,
                                         zoomLevel,
                                         hoveredId,
                                         openedPopupId,
                                         popupContentById,
                                         onMarkerClick,
                                         onPopupClose,
                                     }) {
    const mapRef = useRef(null);

    // Guards + stable identities to minimize needless re-renders.
    const safeData = useMemo(() => (Array.isArray(points) ? points : []), [points]);
    const safePopupMap = useMemo(
        () => (popupContentById instanceof Map ? popupContentById : new Map()),
        [popupContentById]
    );

    return (
        <MapView
            data={safeData}
            mapRef={mapRef}
            center={center}
            zoomLevel={zoomLevel}
            hoveredId={hoveredId}
            openedPopupId={openedPopupId}
            popupContentById={safePopupMap}
            onMarkerClick={onMarkerClick}
            onPopupClose={onPopupClose}
        />
    );
}
