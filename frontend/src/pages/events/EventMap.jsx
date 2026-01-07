// src/pages/events/EventMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import {
    MapContainer,
    TileLayer,
    GeoJSON,
    Marker,
    Popup,
    useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Reuse the same popup/marker styling Community uses
import '../../components/MapView.css';

import alabama from '../../data/alabama.json';

/* Marker PNGs (reuse Community set; “General Discussion” for events) */
import announcementMarkerPng from '../../assets/mapMarkers/community/announcement-marker.png';
import discussionMarkerPng from '../../assets/mapMarkers/community/discussion-marker.png';
import lostAndFoundMarkerPng from '../../assets/mapMarkers/community/lost-and-found-marker.png';
import publicSafetyAlertMarkerPng from '../../assets/mapMarkers/community/public-safety-alert-marker.png';
import recommendationAndTipsMarkerPng from '../../assets/mapMarkers/community/recommendations-marker.png';
import volunteerHelpRequestsMarkerPng from '../../assets/mapMarkers/community/volunteer-help-requests-marker.png';

/* Build DivIcons identical to Community’s MapView */
const makeDivIcon = (png) =>
    L.divIcon({
        className: 'community-div-icon',
        iconSize: [48, 64],
        iconAnchor: [24, 64],
        popupAnchor: [0, -64],
        html: `
      <div style="position:relative;width:48px;height:64px;">
        <img src="${png}" class="marker-icon" style="position:absolute;bottom:8px;left:0;width:48px;height:48px;" />
      </div>
    `,
    });

const discussionDivIcon = makeDivIcon(discussionMarkerPng);
const announcementDivIcon = makeDivIcon(announcementMarkerPng);
const lostAndFoundDivIcon = makeDivIcon(lostAndFoundMarkerPng);
const publicSafetyAlertDivIcon = makeDivIcon(publicSafetyAlertMarkerPng);
const recommendationDivIcon = makeDivIcon(recommendationAndTipsMarkerPng);
const volunteerHelpDivIcon = makeDivIcon(volunteerHelpRequestsMarkerPng);

/* Category → marker icon (events use “General Discussion” marker) */
const CATEGORY_ICON_MAP = {
    event: discussionDivIcon,
    events: discussionDivIcon,
    announcement: announcementDivIcon,
    announcements: announcementDivIcon,
    'general-discussion': discussionDivIcon,
    'lost-and-found': lostAndFoundDivIcon,
    'public-safety-alerts': publicSafetyAlertDivIcon,
    recommendation: recommendationDivIcon,
    'recommendations-tips': recommendationDivIcon,
    'volunteer-requests': volunteerHelpDivIcon,
    'volunteer-and-help-requests': volunteerHelpDivIcon,
    'volunteer-help': volunteerHelpDivIcon,
    'volunteer-help-requests': volunteerHelpDivIcon,
};

/* De-stack helpers (same as Community) */
const BASE_OFFSET_M = 40;
const DEG = Math.PI / 180;
const mToLat = (m) => m / 111_320;
const mToLng = (m, lat) => m / (111_320 * Math.cos(lat * DEG));
const radiusForZoom = (zoom) => BASE_OFFSET_M * (18 - zoom + 1);
const offsetCoords = ([lat, lng], idx, total, zoom) => {
    if (total === 1) return [lat, lng];
    const r = radiusForZoom(zoom);
    const angle = (2 * Math.PI * idx) / total;
    return [lat + mToLat(r) * Math.sin(angle), lng + mToLng(r, lat) * Math.cos(angle)];
};

/* Map constants & wrapper */
const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;
const RAW_BOUNDS = L.geoJSON(alabama.features[0]).getBounds();
const PADDED_BOUNDS = RAW_BOUNDS.pad(0.12);

const MapWrapper = styled(Box)(() => ({
    position: 'relative',
    width: '100%',
    height: '100%',
    '& .leaflet-container': { width: '100%', height: '100%', marginTop: '-32px' },
    '& .leaflet-control-attribution': {
        bottom: '32px !important',
        left: '50% !important',
        transform: 'translateX(-50%)',
        textAlign: 'center',
    },
}));

/* Small helpers copied from Community MapView */
const RemovePrefix = () => {
    const map = useMap();
    useEffect(() => {
        try { map?.attributionControl?.setPrefix?.(''); } catch {}
    }, [map]);
    return null;
};

const MaskController = () => {
    const map = useMap();
    useEffect(() => {
        const outer = [[-180, -90],[180, -90],[180, 90],[-180, 90],[-180, -90]];
        const hole = alabama.features[0].geometry.coordinates[0];

        const pane = map.createPane('maskPane');
        if (pane) pane.style.zIndex = 650;

        const mask = L.geoJSON(
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, hole] } },
            { pane: 'maskPane', interactive: false, style: { fillColor: 'white', fillOpacity: 0.7, color: '#000', weight: 2 } }
        ).addTo(map);

        return () => { try { map?.removeLayer?.(mask); } catch {} };
    }, [map]);
    return null;
};

const BoundsController = () => {
    const map = useMap();
    useEffect(() => { try { map?.setMaxBounds?.(PADDED_BOUNDS); } catch {} }, [map]);
    return null;
};

const Recenter = ({ center, zoomLevel }) => {
    const map = useMap();
    useEffect(() => {
        if (center?.length === 2) {
            try { map.setView(center, zoomLevel ?? DEFAULT_ZOOM); } catch {}
        }
    }, [map, center, zoomLevel]);
    return null;
};

/* Robust resolver for popup content by id */
function resolvePopupNode(source, id) {
    if (!source) return null;
    const s = String(id);
    const candidates = [id, s, `c${s}`, `post-${s}`, `p${s}`];

    if (source instanceof Map) {
        for (const k of candidates) {
            if (source.has(k)) return source.get(k);
        }
        return null;
    }
    for (const k of candidates) {
        const v = source[k];
        if (v != null) return v;
    }
    return null;
}

export default function EventMap({
                                     data = { features: [] },
                                     center = DEFAULT_CENTER,
                                     zoomLevel,
                                     hoveredId,
                                     mapRef,
                                     onMarkerClick,
                                     onPopupClose,
                                     openedPopupId,
                                     popupContentById,
                                 }) {
    const markerRefs = useRef({});
    const [activeIdxByGroup, setActiveIdxByGroup] = useState({});
    const animRef = useRef(null);
    const iconElRef = useRef(null);

    /* Normalize incoming points to GeoJSON-like {features: []} */
    const normalizedData = useMemo(() => {
        if (Array.isArray(data?.features)) return data;
        if (Array.isArray(data)) {
            const features = data
                .filter((p) => Number(p?.lat ?? p?.latitude) && Number(p?.lng ?? p?.longitude))
                .map((p) => {
                    const id = p.id ?? p.properties?.id;
                    const lat = Number(p.lat ?? p.latitude);
                    const lng = Number(p.lng ?? p.longitude);
                    const cat = String(p.category || 'event').toLowerCase();
                    const pics = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [lng, lat] },
                        properties: { id, category: cat, photos: pics, title: p.title || '' },
                    };
                });
            return { features };
        }
        return { features: [] };
    }, [data]);

    /* Hover bounce animation (same as Community) */
    useEffect(() => {
        if (animRef.current) { try { animRef.current.cancel?.(); } catch {} animRef.current = null; }
        if (iconElRef.current) { try { iconElRef.current.style.transform = ''; } catch {} iconElRef.current = null; }

        if (hoveredId != null) {
            const marker = markerRefs.current[`c${hoveredId}`];
            const img = marker?.getElement()?.querySelector('.marker-icon');
            if (img) {
                iconElRef.current = img;
                img.style.transformOrigin = '50% 100%';
                animRef.current = img.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-15px)' }], {
                    duration: 600, iterations: Infinity, easing: 'ease-in-out', direction: 'alternate',
                });
            }
        }

        return () => {
            if (animRef.current) { try { animRef.current.cancel?.(); } catch {} animRef.current = null; }
            if (iconElRef.current) { try { iconElRef.current.style.transform = ''; } catch {} iconElRef.current = null; }
        };
    }, [hoveredId]);

    /* Auto-open popup for controlled id */
    useEffect(() => {
        if (openedPopupId != null) {
            try { markerRefs.current[openedPopupId]?.openPopup?.(); } catch {}
        }
    }, [openedPopupId]);

    /* Close popup when clicking outside/zooming (same behavior as Community) */
    useEffect(() => {
        const handler = (e) => {
            if (!openedPopupId) return;
            if (e.target?.closest?.('.leaflet-container')) return;
            onPopupClose?.();
        };
        document.addEventListener('click', handler, false);
        return () => document.removeEventListener('click', handler, false);
    }, [openedPopupId, onPopupClose]);

    useEffect(() => {
        const map = mapRef?.current;
        if (!map) return;
        const close = () => onPopupClose?.();
        map.on('zoomstart', close).on('zoom', close);
        return () => {
            try { map?.off?.('zoomstart', close); map?.off?.('zoom', close); } catch {}
        };
    }, [mapRef, onPopupClose]);

    /* Group by coordinate then category, then de-stack */
    const coordCat = {};
    (normalizedData.features || []).forEach((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const coordKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
        const cat = (f.properties.category || 'event').toLowerCase();
        ((coordCat[coordKey] ||= {})[cat] ||= []).push(f.properties.id);
    });

    const markerEntries = [];
    Object.entries(coordCat).forEach(([coordKey, catMap]) => {
        const catKeys = Object.keys(catMap);
        catKeys.forEach((cat, i) => {
            const ids = catMap[cat];
            const feature = normalizedData.features.find((f) => f.properties.id === ids[0]);
            if (!feature) return;
            const [lng, lat] = feature.geometry.coordinates;
            const currentZoom = mapRef.current?.getZoom?.() ?? DEFAULT_ZOOM;
            const position = offsetCoords([lat, lng], i, catKeys.length, currentZoom);
            markerEntries.push({ groupKey: `${coordKey}|${cat}`, position, cat, ids });
        });
    });

    return (
        <MapWrapper>
            <div style={{ width: '100%', height: '100%' }} onWheelCapture={() => onPopupClose?.()}>
                <MapContainer
                    center={center}
                    zoom={zoomLevel ?? DEFAULT_ZOOM}
                    whenCreated={(m) => (mapRef.current = m)}
                    scrollWheelZoom
                    minZoom={DEFAULT_ZOOM}
                    maxZoom={18}
                    maxBounds={PADDED_BOUNDS}
                    maxBoundsViscosity={1}
                    zoomSnap={0.5}
                    zoomDelta={0.5}
                    doubleClickZoom={false}
                    touchZoom={false}
                    keyboard={false}
                    zoomControl={false}
                    closeOnClick={false}
                    attributionControl
                    style={{ width: '100%', height: '100%' }}
                >
                    <RemovePrefix />
                    <BoundsController />
                    <MaskController />
                    <Recenter center={center} zoomLevel={zoomLevel} />

                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" noWrap />
                    <GeoJSON data={alabama} interactive={false} style={{ color: '#000', weight: 2, fillOpacity: 0 }} />

                    {markerEntries.map(({ groupKey, position, cat, ids }) => {
                        const idx = activeIdxByGroup[groupKey] ?? 0;
                        const activeId = ids[idx];
                        const multiple = ids.length > 1;
                        const icon = CATEGORY_ICON_MAP[cat] || discussionDivIcon; // events default

                        const resolvedContent = resolvePopupNode(popupContentById, activeId);
                        const isOpen = String(openedPopupId) === String(activeId);

                        return (
                            <Marker
                                key={groupKey}
                                position={position}
                                icon={icon}
                                ref={(m) => {
                                    if (!m) return;
                                    ids.forEach((id) => {
                                        markerRefs.current[id] = m;         // open/close by id
                                        markerRefs.current[`c${id}`] = m;   // hover animation reference
                                    });
                                }}
                                eventHandlers={{
                                    click: () => {
                                        onMarkerClick?.(activeId);
                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: idx }));
                                    },
                                }}
                            >
                                {isOpen && (
                                    <Popup closeButton closeOnClick={false} onClose={() => onPopupClose?.()} maxWidth={420}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                                            {multiple && (
                                                <IconButton
                                                    size="large"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newIdx = Math.max(idx - 1, 0);
                                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: newIdx }));
                                                        onMarkerClick?.(ids[newIdx]);
                                                    }}
                                                >
                                                    ‹
                                                </IconButton>
                                            )}

                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                {resolvedContent ? (
                                                    typeof resolvedContent === 'string'
                                                        ? <div dangerouslySetInnerHTML={{ __html: resolvedContent }} />
                                                        : resolvedContent
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">Loading event…</Typography>
                                                )}
                                            </Box>

                                            {multiple && (
                                                <IconButton
                                                    size="large"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newIdx = Math.min(idx + 1, ids.length - 1);
                                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: newIdx }));
                                                        onMarkerClick?.(ids[newIdx]);
                                                    }}
                                                >
                                                    ›
                                                </IconButton>
                                            )}
                                        </Box>
                                    </Popup>
                                )}
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </MapWrapper>
    );
}
