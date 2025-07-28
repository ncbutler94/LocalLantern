// src/components/SidePanel/Businesses/BusinessesFilter.jsx
import React from 'react';

export default function BusinessesFilter({
                                           subtypes = [],           // default to empty array
                                           selectedSubtype,
                                           onSubtypeChange
                                         }) {
  return (
      <div className="businesses-filter">
        <h4>Category</h4>
        <select
            value={selectedSubtype}
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
