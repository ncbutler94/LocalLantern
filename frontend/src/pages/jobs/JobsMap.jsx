// src/components/SidePanel/Jobs/JobsMap.jsx
// Lightweight wrapper kept for compatibility if imported elsewhere.
// Use JobsPage's MapView directly; this is a safe pass-through.

import React, { useRef } from 'react';
import CommunityMap from '../community/CommunityMapView';

export default function JobsMap({
                                    data,
                                    center,
                                    zoomLevel,
                                    openedPopupId,
                                    popupContentById,
                                    onMarkerClick,
                                    onPopupClose
                                }) {
    const mapRef = useRef(null);
    const markerRefs = useRef({});
    return (
        <CommunityMap
            data={data}
            mapRef={mapRef}
            markerRefs={markerRefs}
            center={center}
            zoomLevel={zoomLevel}
            openedPopupId={openedPopupId}
            popupContentById={popupContentById}
            onMarkerClick={onMarkerClick}
            onPopupClose={onPopupClose}
        />
    );
}
