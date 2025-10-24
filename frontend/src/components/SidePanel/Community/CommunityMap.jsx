import React, { useRef } from 'react';
import MapView from '../../Map/MapView';

/**
 * CommunityMap wraps MapView with community-specific props.
 */
export default function CommunityMap({
                                         points,
                                         center,
                                         zoomLevel,
                                         hoveredId,
                                         openedPopupId,
                                         popupContentById,
                                         onMarkerClick,
                                         onPopupClose
                                     }) {
    const mapRef = useRef(null);

    return (
        <MapView
            data={points}
            mapRef={mapRef}
            center={center}
            zoomLevel={zoomLevel}
            hoveredId={hoveredId}
            openedPopupId={openedPopupId}
            popupContentById={popupContentById}
            onMarkerClick={onMarkerClick}
            onPopupClose={onPopupClose}
        />
    );
}
