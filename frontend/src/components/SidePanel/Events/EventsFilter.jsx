// src/components/SidePanel/Events/EventsFilter.jsx
import React from 'react';

export default function EventsFilter({
                                       subtypes = [],      // e.g. ['Festival', 'Market', 'Class']
                                       selectedSubtype,
                                       onSubtypeChange = () => {}
                                     }) {
  return (
      <div className="events-filter">
        <h4>Type</h4>
        <select
            value={selectedSubtype || ''}
            onChange={e => onSubtypeChange(e.target.value)}
        >
          <option value="">— all —</option>
          {subtypes.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
          ))}
        </select>
      </div>
  );
}