// src/components/Map/BusinessMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton } from '@mui/material';
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
import './MapView.css'; // reuses bounce and popup tweaks

import alabama from '../../data/alabama.json';

/* ───────────────────────────────────────────
   Map constants & geometry helpers
   ─────────────────────────────────────────── */
const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

const RAW_BOUNDS = L.geoJSON(alabama.features[0]).getBounds();
const PADDED_BOUNDS = RAW_BOUNDS.pad(0.12);

const DEG = Math.PI / 180;
const mToLat = (m) => m / 111_320;
const mToLng = (m, lat) => m / (111_320 * Math.cos(lat * DEG));
const BASE_OFFSET_M = 40;
const radiusForZoom = (zoom) => BASE_OFFSET_M * (18 - zoom + 1);
const offsetCoords = ([lat, lng], idx, total, zoom) => {
    if (total === 1) return [lat, lng];
    const r = radiusForZoom(zoom);
    const angle = (2 * Math.PI * idx) / total;
    return [
        lat + mToLat(r) * Math.sin(angle),
        lng + mToLng(r, lat) * Math.cos(angle),
    ];
};

/* ───────────────────────────────────────────
   Styled wrapper (same as MapView.jsx)
   ─────────────────────────────────────────── */
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

/* ───────────────────────────────────────────
   Tiny helpers (safe cleanups)
   ─────────────────────────────────────────── */
const RemovePrefix = () => {
    const map = useMap();
    useEffect(() => {
        // setPrefix returns void; cleanup is not needed here
        if (map?.attributionControl?.setPrefix) {
            map.attributionControl.setPrefix('');
        }
    }, [map]);
    return null;
};

const BoundsControl = () => {
    const map = useMap();
    useEffect(() => {
        // setMaxBounds returns the map; cleanup is also not required,
        // but we avoid returning that value (React expects a function or undefined).
        map.setMaxBounds(PADDED_BOUNDS);
    }, [map]);
    return null;
};

const MaskController = () => {
    const map = useMap();
    useEffect(() => {
        // create Alabama mask layer and remove on unmount
        const outer = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
        const hole = alabama.features[0].geometry.coordinates[0];
        // ensure the pane exists
        const pane = map.createPane('maskPane');
        if (pane) pane.style.zIndex = 650;

        const mask = L.geoJSON(
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, hole] } },
            {
                pane: 'maskPane',
                interactive: false,
                style: { fillColor: 'white', fillOpacity: 0.7, color: '#000', weight: 2 },
            }
        ).addTo(map);

        return () => {
            // SAFE cleanup
            if (typeof map.removeLayer === 'function' && mask) {
                map.removeLayer(mask);
            }
        };
    }, [map]);

    return null;
};

const Recenter = ({ center, zoomLevel }) => {
    const map = useMap();
    useEffect(() => {
        if (Array.isArray(center) && center.length === 2) {
            map.setView(center, zoomLevel ?? DEFAULT_ZOOM);
        }
    }, [map, center, zoomLevel]);
    return null;
};

/* ───────────────────────────────────────────
   DivIcon builder (logo-in-pin) with cache
   ─────────────────────────────────────────── */
const iconCache = new Map();
function getLogoDivIcon(logoUrl) {
    const key = logoUrl || '__default__';
    if (iconCache.has(key)) return iconCache.get(key);

    const html = `
    <div class="community-div-icon" style="position:relative;width:48px;height:64px;">
      <div style="position:absolute;bottom:8px;left:0;width:48px;height:48px;">
        <div style="
          width:48px;height:48px;border-radius:50%;
          background:#fff;overflow:hidden;border:2px solid #0f172a;box-shadow:0 2px 4px rgba(0,0,0,.25);
          display:flex;align-items:center;justify-content:center;
        ">
          ${
        logoUrl
            ? `<img src="${logoUrl}" alt="" class="marker-icon" style="width:100%;height:100%;object-fit:cover;" />`
            : `<div class="marker-icon" style="font:700 14px/48px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;text-align:center;">LL</div>`
    }
        </div>
      </div>
    </div>
  `;

    const icon = L.divIcon({
        className: 'business-div-icon',
        iconSize: [48, 64],
        iconAnchor: [24, 64],
        popupAnchor: [0, -64],
        html,
    });

    iconCache.set(key, icon);
    return icon;
}

/* ════════════════════════════════════════════
   BusinessMap component
   ════════════════════════════════════════════ */
export default function BusinessMap({
                                        data = { features: [] }, // GeoJSON FeatureCollection
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

    /* ----- hover bounce animation (SAFE cleanup) ----- */
    useEffect(() => {
        if (animRef.current) {
            try { animRef.current.cancel?.(); } catch { /* no-op */ }
            animRef.current = null;
        }
        if (iconElRef.current) {
            try { iconElRef.current.style.transform = ''; } catch { /* no-op */ }
            iconElRef.current = null;
        }

        if (hoveredId != null) {
            const marker = markerRefs.current[`b${hoveredId}`];
            const img = marker?.getElement()?.querySelector('.marker-icon');
            if (img) {
                iconElRef.current = img;
                img.style.transformOrigin = '50% 100%';
                animRef.current = img.animate(
                    [{ transform: 'translateY(0)' }, { transform: 'translateY(-15px)' }],
                    { duration: 600, iterations: Infinity, easing: 'ease-in-out', direction: 'alternate' }
                );
            }
        }

        return () => {
            // SAFE cleanup
            if (animRef.current) {
                try { animRef.current.cancel?.(); } catch { /* no-op */ }
                animRef.current = null;
            }
            if (iconElRef.current) {
                try { iconElRef.current.style.transform = ''; } catch { /* no-op */ }
                iconElRef.current = null;
            }
        };
    }, [hoveredId]);

    /* ----- open popup when openedPopupId changes ----- */
    useEffect(() => {
        if (!openedPopupId) return;
        const ref = markerRefs.current[openedPopupId];
        if (ref?.openPopup) {
            // delaying slightly can help if map just panned
            setTimeout(() => ref.openPopup?.(), 0);
        }
    }, [openedPopupId]);

    /* ----- close popup when clicking outside map (SAFE cleanup) ----- */
    useEffect(() => {
        const handler = (e) => {
            if (!openedPopupId) return;
            if (e.target?.closest?.('.leaflet-container')) return;
            onPopupClose?.();
        };
        document.addEventListener('click', handler, false);
        return () => {
            document.removeEventListener('click', handler, false);
        };
    }, [openedPopupId, onPopupClose]);

    /* ----- close popup on zoom start/zoom (SAFE cleanup) ----- */
    useEffect(() => {
        const map = mapRef?.current;
        if (!map) return;
        const close = () => onPopupClose?.();
        map.on('zoomstart', close).on('zoom', close);
        return () => {
            if (typeof map.off === 'function') {
                map.off('zoomstart', close);
                map.off('zoom', close);
            }
        };
    }, [mapRef, onPopupClose]);

    /* ---------- group features by coord, then by category ---------- */
    const coordCat = useMemo(() => {
        const m = {};
        (data.features || []).forEach((f) => {
            const [lng, lat] = f.geometry.coordinates;
            const coordKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
            const cat = (f.properties.category || 'business').toLowerCase();
            ((m[coordKey] ||= {})[cat] ||= []).push(f.properties.id);
        });
        return m;
    }, [data]);

    /* ---------- flatten to marker entries with de-stacking ---------- */
    const markerEntries = useMemo(() => {
        const list = [];
        Object.entries(coordCat).forEach(([coordKey, catMap]) => {
            const catKeys = Object.keys(catMap);
            catKeys.forEach((cat, i) => {
                const ids = catMap[cat];
                const feature = data.features.find((f) => f.properties.id === ids[0]);
                if (!feature) return;
                const [lng, lat] = feature.geometry.coordinates;
                const currentZoom = mapRef.current?.getZoom?.() ?? DEFAULT_ZOOM;
                const position = offsetCoords([lat, lng], i, catKeys.length, currentZoom);
                list.push({ groupKey: `${coordKey}|${cat}`, position, cat, ids });
            });
        });
        return list;
    }, [coordCat, data, mapRef]);

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
                    <BoundsControl />
                    <MaskController />
                    <Recenter center={center} zoomLevel={zoomLevel} />

                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="© OpenStreetMap contributors"
                        noWrap
                    />
                    <GeoJSON data={alabama} interactive={false} style={{ color: '#000', weight: 2, fillOpacity: 0 }} />

                    {markerEntries.map(({ groupKey, position, ids }) => {
                        const idx = activeIdxByGroup[groupKey] ?? 0;
                        const activeId = ids[idx];
                        const feature = data.features.find((f) => f.properties.id === activeId);
                        const logoUrl = feature?.properties?.logoUrl || '';
                        const icon = getLogoDivIcon(logoUrl);
                        const multiple = ids.length > 1;

                        return (
                            <Marker
                                key={groupKey}
                                position={position}
                                icon={icon}
                                ref={(m) => m && ids.forEach((id) => (markerRefs.current[id] = m))}
                                eventHandlers={{
                                    click: () => {
                                        onMarkerClick?.(activeId);
                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: idx }));
                                    },
                                }}
                            >
                                {openedPopupId === activeId && (
                                    <Popup closeButton closeOnClick={false} onClose={() => onPopupClose?.()} maxWidth={420}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
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
                                            <Box sx={{ flex: 1 }}>{popupContentById?.[activeId]}</Box>
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
