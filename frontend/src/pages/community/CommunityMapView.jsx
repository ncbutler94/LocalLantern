// src/pages/community/CommunityMapView.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../components/MapView.css';

import alabama from '../../data/alabama.json';

/* ───────────────────────────────────────────
   Marker PNG imports (kept from your original)
   ─────────────────────────────────────────── */
import communityMarkerPng from '../../assets/mapMarkers/community/community-marker.png';
import announcementMarkerPng from '../../assets/mapMarkers/community/announcement-marker.png';
import discussionMarkerPng from '../../assets/mapMarkers/community/discussion-marker.png';
import lostAndFoundMarkerPng from '../../assets/mapMarkers/community/lost-and-found-marker.png';
import publicSafetyAlertMarkerPng from '../../assets/mapMarkers/community/public-safety-alert-marker.png';
import recommendationAndTipsMarkerPng from '../../assets/mapMarkers/community/recommendation-and-tips-marker.png';
import volunteerHelpRequestsMarkerPng from '../../assets/mapMarkers/community/volunteer-help-requests-marker.png';

/* ───────────────────────────────────────────
   Build DivIcons (same visual as before)
   ─────────────────────────────────────────── */
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

const communityDivIcon = makeDivIcon(communityMarkerPng);
const announcementDivIcon = makeDivIcon(announcementMarkerPng);
const discussionDivIcon = makeDivIcon(discussionMarkerPng);
const lostAndFoundDivIcon = makeDivIcon(lostAndFoundMarkerPng);
const publicSafetyAlertDivIcon = makeDivIcon(publicSafetyAlertMarkerPng);
const recommendationDivIcon = makeDivIcon(recommendationAndTipsMarkerPng);
const volunteerHelpDivIcon = makeDivIcon(volunteerHelpRequestsMarkerPng);

/* Category → icon map (matches your original coverage) */
const CATEGORY_ICON_MAP = {
    event: communityDivIcon,
    events: communityDivIcon,
    announcement: announcementDivIcon,
    announcements: announcementDivIcon,
    'general-discussion': discussionDivIcon,
    discussion: discussionDivIcon,
    'lost-and-found': lostAndFoundDivIcon,
    'lost-found': lostAndFoundDivIcon,
    'public-safety-alerts': publicSafetyAlertDivIcon,
    recommendation: recommendationDivIcon,
    recommendations: recommendationDivIcon,
    tips: recommendationDivIcon,
    'recommendations-tips': recommendationDivIcon,
    'volunteer-requests': volunteerHelpDivIcon,
    volunteers: volunteerHelpDivIcon,
    'help-requests': volunteerHelpDivIcon,
    'volunteer-and-help-requests': volunteerHelpDivIcon,
    'volunteer-help': volunteerHelpDivIcon,
    'volunteer-help-requests': volunteerHelpDivIcon,
};

/* ───────────────────────────────────────────
   De-stack helpers (same behavior)
   ─────────────────────────────────────────── */
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

/* ───────────────────────────────────────────
   Map constants & wrapper
   ─────────────────────────────────────────── */
const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM = 7.5;

const RAW_BOUNDS = L.geoJSON(alabama.features[0]).getBounds();

const MapWrapper = styled(Box)(() => ({
    position: 'relative',
    width: '100%',
    height: '100%',
    '& .leaflet-container': { width: '100%', height: '100%' },
    '& .leaflet-control-attribution': {
        bottom: '32px !important',
        left: '50% !important',
        transform: 'translateX(-50%)',
        textAlign: 'center',
    },
}));

/* ───────────────────────────────────────────
   Helper overlays (same as your original)
   ─────────────────────────────────────────── */
const RemovePrefix = () => {
    const map = useMap();
    useEffect(() => {
        try {
            map?.attributionControl?.setPrefix?.('');
        } catch {}
    }, [map]);
    return null;
};

/** Create a “hole” for Alabama; keep it themed. */
const MaskController = () => {
    const theme = useTheme();
    const map = useMap();

    useEffect(() => {
        const outer = [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, 90],
            [-180, -90],
        ];
        const hole = alabama.features[0].geometry.coordinates[0];

        const pane = map.createPane('maskPane');
        if (pane) {
            // Keep the mask below markers and ensure it never blocks marker clicks
            pane.style.zIndex = 450;
            pane.style.pointerEvents = 'none';
        }

        const mask = L.geoJSON(
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, hole] } },
            {
                pane: 'maskPane',
                interactive: false,
                style: {
                    fillColor: theme.palette.background.default,
                    fillOpacity: 0.7,
                    color: theme.palette.divider,
                    weight: 2,
                },
            }
        ).addTo(map);

        return () => {
            try {
                map?.removeLayer?.(mask);
            } catch {}
        };
    }, [map, theme]);

    return null;
};

/** Compute custom bounds that can pad horizontally/vertically differently. */
function computeBoundsWithPad(bounds, { padH = 0.12, padV = 0.12 }) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const width = Math.abs(ne.lng - sw.lng);
    const height = Math.abs(ne.lat - sw.lat);

    const extraLng = width * padH;
    const extraLat = height * padV;

    const newSw = L.latLng(sw.lat - extraLat, sw.lng - extraLng);
    const newNe = L.latLng(ne.lat + extraLat, ne.lng + extraLng);
    return L.latLngBounds(newSw, newNe);
}

/** Keep the map’s max bounds in sync (changes with expanded mode). */
const BoundsController = ({ bounds }) => {
    const map = useMap();
    useEffect(() => {
        try {
            map?.setMaxBounds?.(bounds);
        } catch {}
    }, [map, bounds]);
    return null;
};

/** Keep the view steady at center/zoom that we control from parent. */
const Recenter = ({ center, zoomLevel }) => {
    const map = useMap();
    useEffect(() => {
        if (center?.length === 2) {
            try {
                map.setView(center, zoomLevel ?? DEFAULT_ZOOM);
            } catch {}
        }
    }, [map, center, zoomLevel]);
    return null;
};

function normalizePostId(value) {
    if (value === null || typeof value === 'undefined') return null;
    const s = String(value).trim();
    if (!s) return null;
    const m = s.match(/(\d+)(?!.*\d)/);
    return m?.[1] ? m[1] : s;
}

function getFeaturePostId(feature) {
    const p = feature?.properties || {};
    return normalizePostId(p.id ?? p.post_id ?? p.postId ?? p.postID ?? feature?.id);
}

function resolvePopupNode(source, id) {
    if (!source) return null;

    const raw = id;
    const s = String(id);
    const norm = normalizePostId(id);

    // Map keys are strict: string "123" !== number 123.
    const candidates = [raw, s];

    if (norm && norm !== s) candidates.push(norm);
    const n1 = Number(s);
    if (Number.isFinite(n1)) candidates.push(n1);
    if (norm) {
        const n2 = Number(norm);
        if (Number.isFinite(n2)) candidates.push(n2);
    }

    // legacy keys (keep backwards compatibility)
    candidates.push(`c${s}`, `post-${s}`, `p${s}`);
    if (norm) candidates.push(`c${norm}`, `post-${norm}`, `p${norm}`);

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

/* ════════════════════════════════════════════
   MapView component
   ════════════════════════════════════════════ */
export default function CommunityMap({
                                         data = { features: [] },
                                         center = DEFAULT_CENTER,
                                         zoomLevel,
                                         hoveredId,
                                         mapRef,
                                         onMarkerClick,
                                         onPopupClose,
                                         openedPopupId,
                                         popupContentById,
                                         expanded = false,
                                         expandedPadH = 0.38,
                                         expandedPadV = 0.18,
                                         defaultPadH = 0.16,
                                         defaultPadV = 0.16,
                                     }) {
    const theme = useTheme();

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

    const markerRefs = useRef({});
    const [activeIdxByGroup, setActiveIdxByGroup] = useState({});
    const animRef = useRef(null);
    const iconElRef = useRef(null);
    const lastOpenedKeyRef = useRef(null);

    // cleanup any previous hover animation, then apply for hovered marker
    useEffect(() => {
        if (animRef.current) {
            try {
                animRef.current.cancel?.();
            } catch {}
            animRef.current = null;
        }
        if (iconElRef.current) {
            try {
                iconElRef.current.style.transform = '';
            } catch {}
            iconElRef.current = null;
        }

        if (hoveredId != null) {
            const hid = normalizePostId(hoveredId) || String(hoveredId);
            const marker = markerRefs.current[`c${hid}`];
            const img = marker?.getElement()?.querySelector('.marker-icon');
            if (img) {
                iconElRef.current = img;
                img.style.transformOrigin = '50% 100%';
                animRef.current = img.animate(
                    [{ transform: 'translateY(0)' }, { transform: 'translateY(-15px)' }],
                    {
                        duration: 600,
                        iterations: Infinity,
                        easing: 'ease-in-out',
                        direction: 'alternate',
                    }
                );
            }
        }

        return () => {
            if (animRef.current) {
                try {
                    animRef.current.cancel?.();
                } catch {}
                animRef.current = null;
            }
            if (iconElRef.current) {
                try {
                    iconElRef.current.style.transform = '';
                } catch {}
                iconElRef.current = null;
            }
        };
    }, [hoveredId]);

    // Group by coord then by category using a normalized post id
    const coordCat = useMemo(() => {
        const out = {};
        (normalizedData.features || []).forEach((f) => {
            const coords = f?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return;
            const [lng, lat] = coords;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const coordKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
            const cat = String(f?.properties?.category || 'event').toLowerCase();
            const id = getFeaturePostId(f);
            if (id == null) return;

            ((out[coordKey] ||= {})[cat] ||= []).push(id);
        });
        return out;
    }, [normalizedData]);

    const markerEntries = useMemo(() => {
        const entries = [];
        const currentZoom = mapRef?.current?.getZoom?.() ?? DEFAULT_ZOOM;

        Object.entries(coordCat).forEach(([coordKey, catMap]) => {
            const catKeys = Object.keys(catMap).sort();
            catKeys.forEach((cat, i) => {
                const ids = catMap[cat];
                const firstId = ids?.[0];
                if (firstId == null) return;

                const feature = (normalizedData.features || []).find(
                    (ff) => String(getFeaturePostId(ff)) === String(firstId)
                );
                if (!feature) return;

                const coords = feature?.geometry?.coordinates;
                if (!Array.isArray(coords) || coords.length < 2) return;

                const [lng, lat] = coords;
                const position = offsetCoords([lat, lng], i, catKeys.length, currentZoom);
                entries.push({ groupKey: `${coordKey}|${cat}`, position, cat, ids });
            });
        });

        return entries;
    }, [coordCat, normalizedData, mapRef]);

    // Map of id -> group index (for stacked marker navigation)
    const idToGroupIndex = useMemo(() => {
        const map = new Map();
        markerEntries.forEach(({ groupKey, ids }) => {
            (ids || []).forEach((id, idx) => {
                const key = normalizePostId(id) || String(id);
                map.set(key, { groupKey, idx });
            });
        });
        return map;
    }, [markerEntries]);

    // Keep active index synced to openedPopupId (so stacked markers open the correct post)
    useEffect(() => {
        const openedKey = normalizePostId(openedPopupId);
        if (!openedKey) return;

        const info = idToGroupIndex.get(openedKey);
        if (!info) return;

        setActiveIdxByGroup((prev) => {
            const current = prev?.[info.groupKey];
            if (current === info.idx) return prev;
            return { ...prev, [info.groupKey]: info.idx };
        });
    }, [openedPopupId, idToGroupIndex]);

    // Only open the popup once it is actually rendered for the currently selected id.
    const openReady = useMemo(() => {
        const openedKey = normalizePostId(openedPopupId);
        if (!openedKey) return null;
        for (const { groupKey, ids } of markerEntries) {
            const idx = activeIdxByGroup[groupKey] ?? 0;
            const active = ids?.[idx];
            const activeKey = normalizePostId(active);
            if (activeKey && String(activeKey) === String(openedKey)) {
                return { key: String(openedKey), groupKey };
            }
        }
        return null;
    }, [openedPopupId, markerEntries, activeIdxByGroup]);

    useEffect(() => {
        if (!openReady) {
            if (openedPopupId == null) lastOpenedKeyRef.current = null;
            return;
        }

        if (lastOpenedKeyRef.current === openReady.key) return;
        const marker = markerRefs.current[openReady.key];
        if (!marker) return;
        try {
            marker.openPopup();
            lastOpenedKeyRef.current = openReady.key;
        } catch {}
    }, [openReady, openedPopupId]);

    const maxBounds = useMemo(() => {
        const h = expanded ? expandedPadH : defaultPadH;
        const v = expanded ? expandedPadV : defaultPadV;
        return computeBoundsWithPad(RAW_BOUNDS, { padH: h, padV: v });
    }, [expanded, expandedPadH, expandedPadV, defaultPadH, defaultPadV]);

    return (
        <MapWrapper>
            <div style={{ width: '100%', height: '100%' }}>
                <MapContainer
                    center={center}
                    zoom={zoomLevel ?? DEFAULT_ZOOM}
                    whenCreated={(m) => (mapRef.current = m)}
                    scrollWheelZoom
                    minZoom={DEFAULT_ZOOM}
                    maxZoom={18}
                    maxBounds={maxBounds}
                    maxBoundsViscosity={1}
                    zoomSnap={0.5}
                    zoomDelta={0.5}
                    doubleClickZoom={false}
                    touchZoom={false}
                    keyboard={false}
                    zoomControl={false}
                    closePopupOnClick={false}
                    attributionControl
                    style={{ width: '100%', height: '100%' }}
                >
                    <RemovePrefix />
                    <BoundsController bounds={maxBounds} />
                    <MaskController />
                    <Recenter center={center} zoomLevel={zoomLevel} />

                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="© OpenStreetMap contributors"
                        noWrap
                    />

                    <GeoJSON
                        data={alabama}
                        style={{
                            color: theme.palette.divider,
                            weight: 2,
                            fillOpacity: 0,
                        }}
                    />

                    {/* markers */}
                    {markerEntries.map(({ groupKey, position, cat, ids }) => {
                        const icon = CATEGORY_ICON_MAP[cat] || communityDivIcon;
                        const idx = activeIdxByGroup[groupKey] ?? 0;
                        const activeId = ids?.[idx];
                        const activeKey = normalizePostId(activeId) || (activeId != null ? String(activeId) : null);
                        const openedKey = normalizePostId(openedPopupId) || (openedPopupId != null ? String(openedPopupId) : null);
                        const isOpen = !!openedKey && !!activeKey && String(openedKey) === String(activeKey);
                        const resolvedContent = resolvePopupNode(popupContentById, activeKey ?? activeId);
                        const popupKey = `popup-${String(activeKey ?? activeId)}-${resolvedContent ? 'ready' : 'loading'}`;

                        return (
                            <Marker
                                key={`marker-${groupKey}`}
                                position={position}
                                icon={icon}
                                ref={(m) => {
                                    if (!m) return;
                                    (ids || []).forEach((id) => {
                                        const raw = id != null ? String(id) : null;
                                        const norm = normalizePostId(id);
                                        if (raw) {
                                            markerRefs.current[raw] = m;
                                            markerRefs.current[`c${raw}`] = m;
                                        }
                                        if (norm) {
                                            markerRefs.current[norm] = m;
                                            markerRefs.current[`c${norm}`] = m;
                                        }
                                    });
                                }}
                                eventHandlers={{
                                    click: (e) => {
                                        if (activeId == null) return;
                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: idx }));
                                        const ll = e?.latlng;
                                        const clickId = activeKey ?? activeId;
                                        if (ll && typeof ll.lat === 'number' && typeof ll.lng === 'number') {
                                            onMarkerClick?.(clickId, { lat: ll.lat, lng: ll.lng });
                                        } else {
                                            onMarkerClick?.(clickId);
                                        }
                                    },
                                }}
                            >
                                {isOpen && (
                                    <Popup
                                        key={popupKey}
                                        closeButton
                                        closeOnClick={false}
                                        autoPan={false}
                                        onClose={() => onPopupClose?.(activeKey ?? activeId)}
                                        maxWidth={420}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                                            {Array.isArray(ids) && ids.length > 1 && (
                                                <IconButton
                                                    size="large"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newIdx = Math.max(idx - 1, 0);
                                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: newIdx }));
                                                        const nextId = ids[newIdx];
                                                        const nextKey = normalizePostId(nextId) || nextId;
                                                        onMarkerClick?.(nextKey, { lat: position[0], lng: position[1] });
                                                    }}
                                                >
                                                    ‹
                                                </IconButton>
                                            )}

                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                {resolvedContent ? (
                                                    typeof resolvedContent === 'string' ? (
                                                        <div dangerouslySetInnerHTML={{ __html: resolvedContent }} />
                                                    ) : (
                                                        resolvedContent
                                                    )
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Loading post…
                                                    </Typography>
                                                )}
                                            </Box>

                                            {Array.isArray(ids) && ids.length > 1 && (
                                                <IconButton
                                                    size="large"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newIdx = Math.min(idx + 1, ids.length - 1);
                                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: newIdx }));
                                                        const nextId = ids[newIdx];
                                                        const nextKey = normalizePostId(nextId) || nextId;
                                                        onMarkerClick?.(nextKey, { lat: position[0], lng: position[1] });
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
