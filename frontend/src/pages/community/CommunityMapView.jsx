// src/pages/community/CommunityMapView.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, IconButton, Typography } from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../components/MapView.css';

import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';

import alabama from '../../data/alabama.json';

/* ───────────────────────────────────────────
   Marker PNG imports (kept from your original)
   ─────────────────────────────────────────── */
import communityMarkerPng from '../../assets/mapMarkers/community/community-marker.png';
import communityMarkerGoldPng from '../../assets/mapMarkers/community/community-marker-gold.png';

import announcementMarkerPng from '../../assets/mapMarkers/community/announcement-marker.png';
import announcementMarkerGoldPng from '../../assets/mapMarkers/community/announcement-marker-gold.png';

import discussionMarkerPng from '../../assets/mapMarkers/community/discussion-marker.png';
import discussionMarkerGoldPng from '../../assets/mapMarkers/community/discussion-marker-gold.png';

import lostAndFoundMarkerPng from '../../assets/mapMarkers/community/lost-and-found-marker.png';
import lostAndFoundMarkerGoldPng from '../../assets/mapMarkers/community/lost-and-found-marker-gold.png';

import publicSafetyAlertMarkerPng from '../../assets/mapMarkers/community/public-safety-alert-marker.png';
import publicSafetyAlertMarkerGoldPng from '../../assets/mapMarkers/community/public-safety-alert-marker-gold.png';

import recommendationsMarkerPng from '../../assets/mapMarkers/community/recommendations-marker.png';
import recommendationsMarkerGoldPng from '../../assets/mapMarkers/community/recommendations-marker-gold.png';

import volunteerHelpRequestsMarkerPng from '../../assets/mapMarkers/community/volunteer-help-requests-marker.png';
import volunteerHelpRequestsMarkerGoldPng from '../../assets/mapMarkers/community/volunteer-help-requests-marker-gold.png';

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
const recommendationDivIcon = makeDivIcon(recommendationsMarkerPng);
const volunteerHelpDivIcon = makeDivIcon(volunteerHelpRequestsMarkerPng);

/* Gold (hover/active) variants */
const communityDivIconGold = makeDivIcon(communityMarkerGoldPng);
const announcementDivIconGold = makeDivIcon(announcementMarkerGoldPng);
const discussionDivIconGold = makeDivIcon(discussionMarkerGoldPng);
const lostAndFoundDivIconGold = makeDivIcon(lostAndFoundMarkerGoldPng);
const publicSafetyAlertDivIconGold = makeDivIcon(publicSafetyAlertMarkerGoldPng);
const recommendationDivIconGold = makeDivIcon(recommendationsMarkerGoldPng);
const volunteerHelpDivIconGold = makeDivIcon(volunteerHelpRequestsMarkerGoldPng);

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


/* Category → GOLD icon map (hover/selected) */
const CATEGORY_ICON_MAP_GOLD = {
    event: communityDivIconGold,
    events: communityDivIconGold,
    announcement: announcementDivIconGold,
    announcements: announcementDivIconGold,
    'general-discussion': discussionDivIconGold,
    discussion: discussionDivIconGold,
    'lost-and-found': lostAndFoundDivIconGold,
    'lost-found': lostAndFoundDivIconGold,
    'public-safety-alerts': publicSafetyAlertDivIconGold,
    recommendation: recommendationDivIconGold,
    recommendations: recommendationDivIconGold,
    tips: recommendationDivIconGold,
    'recommendations-tips': recommendationDivIconGold,
    'volunteer-requests': volunteerHelpDivIconGold,
    volunteers: volunteerHelpDivIconGold,
    'help-requests': volunteerHelpDivIconGold,
    'volunteer-and-help-requests': volunteerHelpDivIconGold,
    'volunteer-help': volunteerHelpDivIconGold,
    'volunteer-help-requests': volunteerHelpDivIconGold,
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

/** Pan target slightly north of the marker so the popup has breathing room (prevents crowding near the close "X"). */
function getNorthPanTarget(map, latlng, offsetPx = 190) {
    if (!map || !latlng) return latlng;
    try {
        const z = map.getZoom?.();
        if (typeof z !== 'number') return latlng;
        const p = map.project(latlng, z);
        // Y grows downward in screen/pixel space. Subtracting moves the center north,
        // which makes the marker appear lower (more room for popup chrome).
        const targetPoint = L.point(p.x, p.y - offsetPx);
        return map.unproject(targetPoint, z);
    } catch {
        return latlng;
    }
}

/* ───────────────────────────────────────────
   Map constants & wrapper
   ─────────────────────────────────────────── */
const DEFAULT_CENTER = [32.69, -86.79113];
const DEFAULT_ZOOM = 7.5;

const RAW_BOUNDS = L.geoJSON(alabama.features[0]).getBounds();

const MapWrapper = styled(Box)(({ theme }) => ({
    position: 'relative',
    width: '100%',
    height: '100%',
    '& .leaflet-container': { width: '100%', height: '100%' },

    // Center attribution just above the bottom of the panel
    '& .leaflet-control-attribution': {
        bottom: '32px !important',
        left: '50% !important',
        transform: 'translateX(-50%)',
        textAlign: 'center',
    },

    // ───────────────────────────────────────────
    // Polished popup styling (UI only)
    // ───────────────────────────────────────────
    '& .leaflet-popup': {
        marginBottom: 6,
    },
    '& .leaflet-popup-content-wrapper': {
        background: theme.palette.background.paper,
        borderRadius: 18,
        padding: 0,
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
    },
    '& .leaflet-popup-content': {
        margin: 0,
        width: 'auto',
        lineHeight: 1.2,
    },
    '& .leaflet-popup-tip': {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: '0 10px 28px rgba(0,0,0,0.12)',
    },
    '& .leaflet-popup-close-button': {
        width: 28,
        height: 28,
        top: 10,
        right: 10,
        borderRadius: 999,
        color: theme.palette.text.secondary,
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: '0 8px 18px rgba(0,0,0,0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    '& .leaflet-popup-close-button:hover': {
        color: theme.palette.text.primary,
        background: theme.palette.action.hover,
    },

    // In the map marker popup, we want owner Edit/Delete actions to be icon-only
    '& .ll-map-popup-content .ll-owner-action-label': {
        display: 'none',
    },
    '& .ll-map-popup-content .ll-owner-actions': {
        gap: 1,
    },
    '& .ll-map-popup-content .ll-owner-action-btn': {
        minWidth: 0,
        paddingLeft: 10,
        paddingRight: 10,
    },
    '& .ll-map-popup-content .ll-owner-action-btn .MuiButton-startIcon': {
        marginRight: 0,
        marginLeft: 0,
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


/** Close the active post popup after the user zooms out more than 2 scroll-zoom steps. */
const ZoomDismissOnZoomOut = ({ openedPopupId, onPopupClose, maxZoomOutSteps = 2 }) => {
    const map = useMap();

    const openedIdRef = useRef(null);
    const lastZoomRef = useRef(null);
    const zoomOutStepsRef = useRef(0);
    const onCloseRef = useRef(onPopupClose);

    useEffect(() => {
        onCloseRef.current = onPopupClose;
    }, [onPopupClose]);

    useEffect(() => {
        const opened = openedPopupId != null ? String(openedPopupId) : null;
        openedIdRef.current = opened;
        zoomOutStepsRef.current = 0;
        try {
            lastZoomRef.current = map?.getZoom?.();
        } catch {
            lastZoomRef.current = null;
        }
    }, [openedPopupId, map]);

    useEffect(() => {
        if (!map) return undefined;

        const handleZoomEnd = () => {
            const opened = openedIdRef.current;
            let newZoom = null;
            try {
                newZoom = map.getZoom();
            } catch {
                newZoom = null;
            }

            const lastZoom = lastZoomRef.current;

            if (!opened) {
                lastZoomRef.current = newZoom;
                return;
            }

            if (typeof newZoom === 'number' && typeof lastZoom === 'number' && newZoom < lastZoom) {
                zoomOutStepsRef.current += 1;

                if (zoomOutStepsRef.current > maxZoomOutSteps) {
                    zoomOutStepsRef.current = 0;
                    openedIdRef.current = null;

                    try {
                        map.closePopup();
                    } catch {}

                    const fn = onCloseRef.current;
                    if (typeof fn === 'function') fn(opened);
                }
            } else if (typeof newZoom === 'number' && typeof lastZoom === 'number' && newZoom > lastZoom) {
                // If they zoom in again, reset the "zoom out" counter.
                zoomOutStepsRef.current = 0;
            }

            lastZoomRef.current = newZoom;
        };

        map.on('zoomend', handleZoomEnd);
        return () => {
            map.off('zoomend', handleZoomEnd);
        };
    }, [map, maxZoomOutSteps]);

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

    // Local hover/selection for marker icon swapping (green ↔ gold)
    const [hoveredMarkerIdLocal, setHoveredMarkerIdLocal] = useState(null);
    const [selectedMarkerIdLocal, setSelectedMarkerIdLocal] = useState(null);

    const hoveredKeyExternal = useMemo(() => {
        const k = normalizePostId(hoveredId);
        return k || (hoveredId != null ? String(hoveredId) : null);
    }, [hoveredId]);

    // Keep our local 'selected' marker in sync with the opened popup id
    useEffect(() => {
        const k = normalizePostId(openedPopupId);
        if (k) {
            setSelectedMarkerIdLocal(String(k));
        } else if (openedPopupId != null && String(openedPopupId).trim()) {
            setSelectedMarkerIdLocal(String(openedPopupId));
        } else {
            setSelectedMarkerIdLocal(null);
        }
    }, [openedPopupId]);


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

                    <ZoomDismissOnZoomOut openedPopupId={openedPopupId} onPopupClose={onPopupClose} />

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
                        const idx = activeIdxByGroup[groupKey] ?? 0;
                        const activeId = ids?.[idx];
                        const activeKey = normalizePostId(activeId) || (activeId != null ? String(activeId) : null);

                        const openedKey =
                            normalizePostId(openedPopupId) || (openedPopupId != null ? String(openedPopupId) : null);

                        const isOpen = !!openedKey && !!activeKey && String(openedKey) === String(activeKey);

                        const baseIcon = CATEGORY_ICON_MAP[cat] || communityDivIcon;
                        const goldIcon = CATEGORY_ICON_MAP_GOLD[cat] || communityDivIconGold;

                        const isHovered =
                            !!activeKey &&
                            ((hoveredMarkerIdLocal != null && String(hoveredMarkerIdLocal) === String(activeKey)) ||
                                (hoveredKeyExternal != null && String(hoveredKeyExternal) === String(activeKey)));

                        const isSelected =
                            !!activeKey &&
                            (isOpen ||
                                (selectedMarkerIdLocal != null && String(selectedMarkerIdLocal) === String(activeKey)));

                        const icon = isHovered || isSelected ? goldIcon : baseIcon;

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
                                    mouseover: () => {
                                        const k = activeKey ?? activeId;
                                        const kk = normalizePostId(k) || (k != null ? String(k) : null);
                                        if (kk) setHoveredMarkerIdLocal(String(kk));
                                    },
                                    mouseout: () => {
                                        setHoveredMarkerIdLocal(null);
                                    },
                                    click: (e) => {
                                        if (activeId == null) return;
                                        setActiveIdxByGroup((p) => ({ ...p, [groupKey]: idx }));
                                        const ll = e?.latlng;
                                        const clickId = activeKey ?? activeId;
                                        const sel = normalizePostId(clickId) || (clickId != null ? String(clickId) : null);
                                        if (sel) setSelectedMarkerIdLocal(String(sel));

                                        if (ll && typeof ll.lat === 'number' && typeof ll.lng === 'number') {
                                            const map = mapRef?.current;
                                            const panTarget = getNorthPanTarget(map, ll, 190);
                                            onMarkerClick?.(clickId, {
                                                lat: panTarget?.lat ?? ll.lat,
                                                lng: panTarget?.lng ?? ll.lng,
                                                markerLat: ll.lat,
                                                markerLng: ll.lng,
                                            });
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
                                        onClose={() => {
                                            const k = normalizePostId(activeKey ?? activeId) ||
                                                ((activeKey ?? activeId) != null ? String(activeKey ?? activeId) : null);
                                            if (k && selectedMarkerIdLocal != null && String(selectedMarkerIdLocal) === String(k)) {
                                                setSelectedMarkerIdLocal(null);
                                            }
                                            onPopupClose?.(activeKey ?? activeId);
                                        }}
                                        maxWidth={420}
                                    >
                                        {(() => {
                                            const hasStack = Array.isArray(ids) && ids.length > 1;

                                            const goPrev = (e) => {
                                                e.stopPropagation();
                                                const newIdx = Math.max(idx - 1, 0);
                                                setActiveIdxByGroup((p) => ({ ...p, [groupKey]: newIdx }));
                                                const nextId = ids[newIdx];
                                                const nextKey = normalizePostId(nextId) || nextId;
                                                const map = mapRef?.current;
                                                const ll = L.latLng(position[0], position[1]);
                                                const panTarget = getNorthPanTarget(map, ll, 190);
                                                onMarkerClick?.(nextKey, {
                                                    lat: panTarget?.lat ?? position[0],
                                                    lng: panTarget?.lng ?? position[1],
                                                    markerLat: position[0],
                                                    markerLng: position[1],
                                                });
                                            };

                                            const goNext = (e) => {
                                                e.stopPropagation();
                                                const newIdx = Math.min(idx + 1, ids.length - 1);
                                                setActiveIdxByGroup((p) => ({ ...p, [groupKey]: newIdx }));
                                                const nextId = ids[newIdx];
                                                const nextKey = normalizePostId(nextId) || nextId;
                                                const map = mapRef?.current;
                                                const ll = L.latLng(position[0], position[1]);
                                                const panTarget = getNorthPanTarget(map, ll, 190);
                                                onMarkerClick?.(nextKey, {
                                                    lat: panTarget?.lat ?? position[0],
                                                    lng: panTarget?.lng ?? position[1],
                                                    markerLat: position[0],
                                                    markerLng: position[1],
                                                });
                                            };

                                            return (
                                                <Box
                                                    sx={{
                                                        width: 'min(420px, 86vw)',
                                                        maxWidth: '100%',
                                                    }}
                                                >                                                    <Box className="ll-map-popup-content" sx={{ p: resolvedContent ? 0 : 1.25 }}>
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

                                                    {hasStack && (
                                                        <Box
                                                            sx={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 1,
                                                                px: 1.25,
                                                                py: 1,
                                                                borderTop: '1px solid',
                                                                borderColor: 'divider',
                                                                bgcolor: 'background.paper',
                                                            }}
                                                        >
                                                            <IconButton
                                                                size="small"
                                                                onClick={goPrev}
                                                                disabled={idx <= 0}
                                                                sx={{
                                                                    width: 32,
                                                                    height: 32,
                                                                    borderRadius: 999,
                                                                    border: '1px solid',
                                                                    borderColor: 'divider',
                                                                    bgcolor: 'background.paper',
                                                                    boxShadow: '0 6px 14px rgba(0,0,0,0.10)',
                                                                }}
                                                            >
                                                                <ChevronLeftRoundedIcon fontSize="small" />
                                                            </IconButton>

                                                            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                                                <Chip
                                                                    size="small"
                                                                    label={`${idx + 1}/${ids.length}`}
                                                                    sx={{
                                                                        fontWeight: 800,
                                                                        borderRadius: 999,
                                                                        bgcolor: 'rgba(25, 118, 210, 0.10)',
                                                                        border: '1px solid',
                                                                        borderColor: 'rgba(25, 118, 210, 0.25)',
                                                                    }}
                                                                />
                                                            </Box>

                                                            <IconButton
                                                                size="small"
                                                                onClick={goNext}
                                                                disabled={idx >= ids.length - 1}
                                                                sx={{
                                                                    width: 32,
                                                                    height: 32,
                                                                    borderRadius: 999,
                                                                    border: '1px solid',
                                                                    borderColor: 'divider',
                                                                    bgcolor: 'background.paper',
                                                                    boxShadow: '0 6px 14px rgba(0,0,0,0.10)',
                                                                }}
                                                            >
                                                                <ChevronRightRoundedIcon fontSize="small" />
                                                            </IconButton>
                                                        </Box>
                                                    )}
                                                </Box>
                                            );
                                        })()}
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
