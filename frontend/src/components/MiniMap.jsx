// src/components/Map/MiniMap.jsx
import React, { useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, Marker, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const AL_BOUNDS = L.latLngBounds([30.138, -88.473], [35.008, -84.889]);

function FitToMarkers({ markers }) {
    const map = useMap();
    useEffect(() => {
        if (!map || !markers?.length) return;
        if (markers.length === 1) {
            const m = markers[0];
            if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) map.setView([m.lat, m.lng], 12, { animate: true });
        } else {
            const b = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
            map.fitBounds(b, { padding: [30, 30] });
        }
    }, [map, markers]);
    return null;
}

function CleanAttributionPrefix() {
    const map = useMap();
    useEffect(() => {
        if (!map?.attributionControl?.setPrefix) return;
        map.attributionControl.setPrefix('');
        // Extra guard: hide any Leaflet link if present
        const el = map.getContainer().querySelector('.leaflet-control-attribution a[href^="https://leafletjs.com"]');
        if (el) el.style.display = 'none';
    }, [map]);
    return null;
}

function AlabamaMask() {
    const outer = [[-90, -180], [90, -180], [90, 180], [-90, 180]];
    const sw = AL_BOUNDS.getSouthWest();
    const ne = AL_BOUNDS.getNorthEast();
    const hole = [[sw.lat, sw.lng], [sw.lat, ne.lng], [ne.lat, ne.lng], [ne.lat, sw.lng]];
    return (
        <Polygon positions={[outer, hole]} pathOptions={{ color: 'transparent', fillColor: '#f0f0f0', fillOpacity: 0.65, interactive: false }} />
    );
}

export default function MiniMap({ markers = [], height = 220, scrollWheelZoom = false }) {
    const hasMarkers = Array.isArray(markers) && markers.length > 0;

    // Hook must run unconditionally (fixes eslint react-hooks/rules-of-hooks)
    const center = useMemo(() => {
        const m = hasMarkers ? markers[0] : null;
        if (Number.isFinite(m?.lat) && Number.isFinite(m?.lng)) return [m.lat, m.lng];
        return [32.806671, -86.79113];
    }, [markers, hasMarkers]);

    if (!hasMarkers) return null;

    return (
        <div style={{ width: '100%', height }}>
            <MapContainer
                center={center}
                zoom={8}
                minZoom={6}
                maxZoom={18}
                maxBounds={AL_BOUNDS.pad(0.15)}
                maxBoundsViscosity={1}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={scrollWheelZoom}
                zoomControl
                attributionControl
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
                <CleanAttributionPrefix />
                <AlabamaMask />
                {markers.map((m, i) => Number.isFinite(m.lat) && Number.isFinite(m.lng) ? <Marker key={i} position={[m.lat, m.lng]} /> : null)}
                <FitToMarkers markers={markers} />
            </MapContainer>
        </div>
    );
}
MiniMap.propTypes = {
    markers: PropTypes.array,
    height: PropTypes.number,
    scrollWheelZoom: PropTypes.bool,
};
