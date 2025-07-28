// src/components/SidePanel/Services/ServicesFilter.jsx
import React from 'react';

export default function ServicesFilter({
                                         subtypes = [],      // e.g. ['Home', 'Auto', 'Education']
                                         selectedSubtype,
                                         onSubtypeChange = () => {}
                                       }) {
  return (
      <div className="services-filter">
        <h4>Category</h4>
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