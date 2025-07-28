// src/components/Map/MapView.jsx
import React, { useEffect, useRef, useState } from 'react';
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

/* ───────────────────────────────────────────
   Marker PNG imports (no shadow layer)
   ─────────────────────────────────────────── */
import communityMarkerPng from '../../assets/mapMarkers/community/community-marker.png';
import announcementMarkerPng from '../../assets/mapMarkers/community/announcement-marker.png';
import discussionMarkerPng from '../../assets/mapMarkers/community/discussion-marker.png';
import lostAndFoundMarkerPng from '../../assets/mapMarkers/community/lost-and-found-marker.png';
import publicSafetyAlertMarkerPng from '../../assets/mapMarkers/community/public-safety-alert-marker.png';
import recommendationAndTipsMarkerPng from '../../assets/mapMarkers/community/recommendation-and-tips-marker.png';
import volunteerHelpRequestsMarkerPng from '../../assets/mapMarkers/community/volunteer-help-requests-marker.png';

/* ───────────────────────────────────────────
   Build DivIcons
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

const communityDivIcon         = makeDivIcon(communityMarkerPng);
const announcementDivIcon      = makeDivIcon(announcementMarkerPng);
const discussionDivIcon        = makeDivIcon(discussionMarkerPng);
const lostAndFoundDivIcon      = makeDivIcon(lostAndFoundMarkerPng);
const publicSafetyAlertDivIcon = makeDivIcon(publicSafetyAlertMarkerPng);
const recommendationDivIcon    = makeDivIcon(recommendationAndTipsMarkerPng);
const volunteerHelpDivIcon     = makeDivIcon(volunteerHelpRequestsMarkerPng);

const CATEGORY_ICON_MAP = {
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

/* ───────────────────────────────────────────
   De-stack helpers
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
    return [
        lat + mToLat(r) * Math.sin(angle),
        lng + mToLng(r, lat) * Math.cos(angle),
    ];
};

/* ───────────────────────────────────────────
   Map constants & wrapper
   ─────────────────────────────────────────── */
const DEFAULT_CENTER = [32.806671, -86.79113];
const DEFAULT_ZOOM   = 7.5;

/* → NEW: pad Alabama’s bounds by 12 % for leeway */
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

/* ───────────────────────────────────────────
   Tiny helpers
   ─────────────────────────────────────────── */
const RemovePrefix = () => { const m=useMap(); useEffect(()=>m.attributionControl.setPrefix(''),[m]); return null; };
const MaskController = () => {
    const map = useMap();
    useEffect(() => {
        const outer = [[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]];
        const hole  = alabama.features[0].geometry.coordinates[0];
        map.createPane('maskPane').style.zIndex = 650;
        const mask = L.geoJSON(
            { type:'Feature', geometry:{ type:'Polygon', coordinates:[outer,hole]} },
            { pane:'maskPane', interactive:false, style:{ fillColor:'white',fillOpacity:0.7,color:'#000',weight:2 } }
        ).addTo(map);
        return () => map.removeLayer(mask);
    }, [map]);
    return null;
};
const BoundsController = () => { useMap().setMaxBounds(PADDED_BOUNDS); return null; };
const Recenter = ({ center, zoomLevel }) => {
    const map=useMap();
    useEffect(()=>{ if(center?.length===2) map.setView(center, zoomLevel ?? DEFAULT_ZOOM); },[map,center,zoomLevel]);
    return null;
};

/* ════════════════════════════════════════════
   MapView component
   ════════════════════════════════════════════ */
export default function MapView({
                                    data             = { features: [] },
                                    center           = DEFAULT_CENTER,
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
    const animRef   = useRef(null);
    const iconElRef = useRef(null);

    /* ----- hover bounce animation ----- */
    useEffect(() => {
        animRef.current?.cancel(); animRef.current=null;
        if(iconElRef.current) iconElRef.current.style.transform='';
        if(hoveredId!=null){
            const marker=markerRefs.current[`c${hoveredId}`];
            const img=marker?.getElement()?.querySelector('.marker-icon');
            if(img){
                iconElRef.current=img;
                img.style.transformOrigin='50% 100%';
                animRef.current=img.animate(
                    [{transform:'translateY(0)'},{transform:'translateY(-15px)'}],
                    {duration:600,iterations:Infinity,easing:'ease-in-out',direction:'alternate'}
                );
            }
        }
        return ()=>animRef.current?.cancel();
    },[hoveredId]);

    /* ----- popup open / close wiring ----- */
    useEffect(()=>{ if(openedPopupId) markerRefs.current[openedPopupId]?.openPopup(); },[openedPopupId]);
    useEffect(()=>{
        const handler=e=>{
            if(!openedPopupId) return;
            if(e.target.closest('.leaflet-container')) return;
            onPopupClose?.();
        };
        document.addEventListener('click',handler,false);
        return()=>document.removeEventListener('click',handler,false);
    },[openedPopupId,onPopupClose]);
    useEffect(()=>{
        const map=mapRef?.current;
        if(!map) return;
        const close=()=>onPopupClose?.();
        map.on('zoomstart',close).on('zoom',close);
        return()=>{map.off('zoomstart',close);map.off('zoom',close);};
    },[mapRef,onPopupClose]);

    /* ---------- group by coord then by category ---------- */
    const coordCat = {};
    data.features.forEach(f=>{
        const [lng,lat]=f.geometry.coordinates;
        const coordKey=`${lat.toFixed(6)}_${lng.toFixed(6)}`;
        const cat=(f.properties.category||'').toLowerCase();
        ((coordCat[coordKey] ||= {})[cat] ||= []).push(f.properties.id);
    });

    /* ---------- flatten to marker entries ---------- */
    const markerEntries = [];
    Object.entries(coordCat).forEach(([coordKey,catMap])=>{
        const catKeys=Object.keys(catMap);
        catKeys.forEach((cat,i)=>{
            const ids=catMap[cat];
            const [lng,lat] = data.features.find(f=>f.properties.id===ids[0]).geometry.coordinates;
            const currentZoom = mapRef.current?.getZoom() ?? DEFAULT_ZOOM;
            const position = offsetCoords([lat,lng],i,catKeys.length,currentZoom);
            markerEntries.push({groupKey:`${coordKey}|${cat}`,position,cat,ids});
        });
    });

    return (
        <MapWrapper>
            <div style={{width:'100%',height:'100%'}} onWheelCapture={()=>onPopupClose?.()}>
                <MapContainer
                    center={center}
                    zoom={zoomLevel ?? DEFAULT_ZOOM}
                    whenCreated={m=>mapRef.current = m}
                    scrollWheelZoom
                    minZoom={DEFAULT_ZOOM}
                    maxZoom={18}
                    maxBounds={PADDED_BOUNDS}        /* ← uses padded bounds */
                    maxBoundsViscosity={1}
                    zoomSnap={0.5}
                    zoomDelta={0.5}
                    doubleClickZoom={false}
                    touchZoom={false}
                    keyboard={false}
                    zoomControl={false}
                    closeOnClick={false}
                    attributionControl
                    style={{width:'100%',height:'100%'}}
                >
                    <RemovePrefix />
                    <BoundsController />
                    <MaskController />
                    <Recenter center={center} zoomLevel={zoomLevel} />

                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" noWrap />
                    <GeoJSON data={alabama} interactive={false} style={{color:'#000',weight:2,fillOpacity:0}}/>

                    {markerEntries.map(({groupKey,position,cat,ids})=>{
                        const idx=activeIdxByGroup[groupKey]??0;
                        const activeId=ids[idx];
                        const multiple = ids.length>1;
                        const icon = CATEGORY_ICON_MAP[cat] || communityDivIcon;

                        return (
                            <Marker
                                key={groupKey}
                                position={position}
                                icon={icon}
                                ref={m=>m&&ids.forEach(id=>markerRefs.current[id]=m)}
                                eventHandlers={{ click: () => {
                                        onMarkerClick(activeId);
                                        setActiveIdxByGroup(p=>({...p,[groupKey]:idx}));
                                    }}}
                            >
                                {openedPopupId===activeId&&(
                                    <Popup closeButton closeOnClick={false} onClose={()=>onPopupClose?.()} maxWidth={420}>
                                        <Box sx={{display:'flex',alignItems:'center',mb:1}}>
                                            {multiple&&(
                                                <IconButton size="large" onClick={e=>{
                                                    e.stopPropagation();
                                                    const newIdx=Math.max(idx-1,0);
                                                    setActiveIdxByGroup(p=>({...p,[groupKey]:newIdx}));
                                                    onMarkerClick(ids[newIdx]);
                                                }}>‹</IconButton>
                                            )}
                                            <Box sx={{flex:1}}>{popupContentById[activeId]}</Box>
                                            {multiple&&(
                                                <IconButton size="large" onClick={e=>{
                                                    e.stopPropagation();
                                                    const newIdx=Math.min(idx+1,ids.length-1);
                                                    setActiveIdxByGroup(p=>({...p,[groupKey]:newIdx}));
                                                    onMarkerClick(ids[newIdx]);
                                                }}>›</IconButton>
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
