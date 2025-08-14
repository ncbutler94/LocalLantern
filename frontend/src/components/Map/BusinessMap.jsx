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
import './MapView.css';
import alabama from '../../data/alabama.json';

const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

const RAW_BOUNDS = L.geoJSON(alabama.features[0]).getBounds();
const PADDED_BOUNDS = RAW_BOUNDS.pad(0.12);

const DEG = Math.PI / 180;
const mToLat = (m) => m / 111_320;
const mToLng = (m, lat) => m / (111_320 * Math.cos(lat * DEG));

/** small radial offset to de‑stack categories at the exact same coordinate */
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

/* helpers with safe cleanup */
const RemovePrefix = () => {
    const map = useMap();
    useEffect(() => { map?.attributionControl?.setPrefix(''); }, [map]);
    return null;
};

const BoundsControl = () => {
    const map = useMap();
    useEffect(() => { map.setMaxBounds(PADDED_BOUNDS); }, [map]);
    return null;
};

const MaskController = () => {
    const map = useMap();
    useEffect(() => {
        const outer = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
        const hole = alabama.features[0].geometry.coordinates[0];
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
        return () => { if (mask) map.removeLayer(mask); };
    }, [map]);
    return null;
};

const Recenter = ({ center, zoomLevel }) => {
    const map = useMap();
    useEffect(() => {
        if (center?.length === 2) map.setView(center, zoomLevel ?? DEFAULT_ZOOM);
    }, [map, center, zoomLevel]);
    return null;
};

/* Keep pins small most of the time, bigger when you’re close-in */
function scaleForZoom(z) {
    if (z >= 17) return 2.0;   // max zoom
    if (z >= 16) return 1.6;   // street level
    return 0.48;               // same small size for everything else
}

/** DivIcon builder with cache — now WITHOUT the white circular ring */
const iconCache = new Map();
function getLogoDivIcon(logoUrl, scale) {
    const key = `${logoUrl || '__default__'}@${scale}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const html = `
    <div style="transform: scale(${scale}); transform-origin: 50% 100%;">
      <div style="position:relative;width:48px;height:64px;">
        <div style="position:absolute;bottom:8px;left:0;width:48px;height:48px;
                    display:flex;align-items:center;justify-content:center;">
          ${
        logoUrl
            ? `<img src="${logoUrl}" alt="" class="marker-icon"
                     style="width:48px;height:48px;border-radius:50%;
                            object-fit:cover;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25));" />`
            : `<div class="marker-icon"
                     style="width:48px;height:48px;border-radius:50%;
                            background:#0f172a;color:#fff;
                            font:700 14px/48px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
                            text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25));">
                   LL
                 </div>`
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

export default function BusinessMap({
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
    const [zoom, setZoom] = useState(zoomLevel ?? DEFAULT_ZOOM);

    useEffect(() => {
        const map = mapRef?.current;
        if (!map) return;
        const update = () => setZoom(map.getZoom());
        map.on('zoomend', update).on('moveend', update);
        update();
        return () => { if (map.off) { map.off('zoomend', update); map.off('moveend', update); } };
    }, [mapRef]);

    /* Bounce the image ONLY when a card is hovered */
    const animRef = useRef(null);
    const iconElRef = useRef(null);
    useEffect(() => {
        // cleanup any previous
        try { animRef.current?.cancel?.(); } catch {}
        animRef.current = null;
        if (iconElRef.current) {
            try { iconElRef.current.style.transform = ''; } catch {}
            iconElRef.current = null;
        }

        if (hoveredId != null) {
            const ref =
                markerRefs.current[`b${hoveredId}`] ||  // tolerate either key shape
                markerRefs.current[hoveredId];
            const root = ref?.getElement?.();
            const img = root?.querySelector('.marker-icon');
            if (img) {
                iconElRef.current = img;
                img.style.transformOrigin = '50% 100%';
                animRef.current = img.animate(
                    [{ transform: 'translateY(0)' }, { transform: 'translateY(-12px)' }],
                    { duration: 600, iterations: Infinity, easing: 'ease-in-out', direction: 'alternate' }
                );
            }
        }

        return () => {
            try { animRef.current?.cancel?.(); } catch {}
            if (iconElRef.current) {
                try { iconElRef.current.style.transform = ''; } catch {}
            }
            animRef.current = null;
            iconElRef.current = null;
        };
    }, [hoveredId]);

    /* open popup programmatically when id changes */
    useEffect(() => {
        if (!openedPopupId) return;
        const ref = markerRefs.current[openedPopupId] || markerRefs.current[`b${openedPopupId}`];
        ref?.openPopup?.();
    }, [openedPopupId]);

    /* close popup when clicking outside map */
    useEffect(() => {
        const handler = (e) => {
            if (!openedPopupId) return;
            if (e.target?.closest?.('.leaflet-container')) return;
            onPopupClose?.();
        };
        document.addEventListener('click', handler, false);
        return () => document.removeEventListener('click', handler, false);
    }, [openedPopupId, onPopupClose]);

    /* group by coordinate + category (slight de‑stack fan) */
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

    const markerEntries = useMemo(() => {
        const list = [];
        Object.entries(coordCat).forEach(([coordKey, catMap]) => {
            const catKeys = Object.keys(catMap);
            catKeys.forEach((cat, i) => {
                const ids = catMap[cat];
                const feature = data.features.find((f) => f.properties.id === ids[0]);
                if (!feature) return;
                const [lng, lat] = feature.geometry.coordinates;
                const position = offsetCoords([lat, lng], i, catKeys.length, zoom);
                list.push({ groupKey: `${coordKey}|${cat}`, position, ids });
            });
        });
        return list;
    }, [coordCat, zoom, data]);

    const markerScale = scaleForZoom(zoom);

    return (
        <MapWrapper>
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
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap />
                <GeoJSON data={alabama} interactive={false} style={{ color: '#000', weight: 2, fillOpacity: 0 }} />

                {markerEntries.map(({ groupKey, position, ids }) => {
                    const idx = (activeIdxByGroup[groupKey] ?? 0);
                    const activeId = ids[idx];
                    const feature = data.features.find((f) => f.properties.id === activeId);
                    const logoUrl = feature?.properties?.logoUrl || '';
                    const icon = getLogoDivIcon(logoUrl, markerScale);
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
        </MapWrapper>
    );
}
