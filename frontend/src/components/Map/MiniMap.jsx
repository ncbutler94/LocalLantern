// src/components/Map/MiniMap.jsx
import React, { useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Alabama (approx) bounds */
const AL_BOUNDS = L.latLngBounds(
    [30.138, -88.473], // south-west
    [35.008, -84.889]  // north-east
);

/** Create a circular logo icon */
function makeLogoIcon(logoUrl) {
    const safe = logoUrl || '';
    const html = `
    <div style="
      width:36px;height:36px;border-radius:50%;
      box-shadow:0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.3);
      overflow:hidden; background:#fff; display:flex; align-items:center; justify-content:center;
    ">
      ${safe
        ? `<img src="${safe}" style="width:100%;height:100%;object-fit:cover;" alt="pin" />`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font:700 16px/1 sans-serif;color:#555;">LL</div>`
    }
    </div>`;
    return L.divIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });
}

/** Fit bounds on mount/markers change */
function FitToMarkers({ markers }) {
    const map = useMap();
    useEffect(() => {
        if (!map || !markers?.length) return;
        if (markers.length === 1) {
            const m = markers[0];
            if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
                map.setView([m.lat, m.lng], 12, { animate: true });
            }
        } else {
            const b = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
            map.fitBounds(b, { padding: [30, 30] });
        }
    }, [map, markers]);
    return null;
}

/** Mask outside Alabama using a polygon with a hole */
function AlabamaMask() {
    // Outer “world” ring
    const outer = [
        [-90, -180], [90, -180], [90, 180], [-90, 180]
    ];
    // Inner “hole” ring = Alabama bounding box
    const sw = AL_BOUNDS.getSouthWest();
    const ne = AL_BOUNDS.getNorthEast();
    const hole = [
        [sw.lat, sw.lng], [sw.lat, ne.lng], [ne.lat, ne.lng], [ne.lat, sw.lng]
    ];
    return (
        <Polygon
            positions={[outer, hole]}
            pathOptions={{ color: 'transparent', fillColor: '#f0f0f0', fillOpacity: 0.65, interactive: false }}
        />
    );
}

export default function MiniMap({
                                    markers = [],         // [{lat, lng, title?, street_address?}]
                                    logoUrl = '',
                                    height = 220,
                                    activeIndex = 0,      // optional focus index
                                    scrollWheelZoom = false,
                                }) {
    const logoIcon = useMemo(() => makeLogoIcon(logoUrl), [logoUrl]);

    // re-focus when activeIndex changes
    const lastIdxRef = useRef(activeIndex);
    function JumpToActive() {
        const map = useMap();
        useEffect(() => {
            if (activeIndex === lastIdxRef.current) return;
            lastIdxRef.current = activeIndex;
            const m = markers?.[activeIndex];
            if (!m) return;
            if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
                map.flyTo([m.lat, m.lng], 13, { duration: 0.6 });
            }
        }, [map, activeIndex]);
        return null;
    }

    // safe center fallback
    const center = useMemo(() => {
        if (markers?.length) {
            const m = markers[Math.min(activeIndex, markers.length - 1)];
            if (Number.isFinite(m?.lat) && Number.isFinite(m?.lng)) return [m.lat, m.lng];
        }
        return [32.806671, -86.79113]; // Alabama centroid
    }, [markers, activeIndex]);

    return (
        <div style={{ width: '100%', height }}>
            <MapContainer
                center={center}
                zoom={7}
                minZoom={6}
                maxZoom={18}
                maxBounds={AL_BOUNDS.pad(0.15)}
                maxBoundsViscosity={1}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={scrollWheelZoom}
                zoomControl={false}
                attributionControl={false}
            >
                <TileLayer
                    // OSM – switch if you have a tile key
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <AlabamaMask />
                {markers.map((m, i) => (
                    Number.isFinite(m.lat) && Number.isFinite(m.lng) ? (
                        <Marker key={i} position={[m.lat, m.lng]} icon={logoIcon}>
                            {(m.title || m.street_address) && (
                                <Popup>
                                    <div style={{ fontWeight: 600 }}>{m.title || ''}</div>
                                    {m.street_address ? <div style={{ fontSize: 12 }}>{m.street_address}</div> : null}
                                </Popup>
                            )}
                        </Marker>
                    ) : null
                ))}
                <FitToMarkers markers={markers} />
                <JumpToActive />
            </MapContainer>
        </div>
    );
}

MiniMap.propTypes = {
    markers: PropTypes.array,
    logoUrl: PropTypes.string,
    height: PropTypes.number,
    activeIndex: PropTypes.number,
    scrollWheelZoom: PropTypes.bool,
};
