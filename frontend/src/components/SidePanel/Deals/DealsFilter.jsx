// src/components/SidePanel/Deals/DealsFilter.jsx
import React from 'react';

export default function DealsFilter({
                                      subtypes = []      // e.g. ['Food', 'Retail', 'Services'], default empty
                                    }) {
  return (
      <div className="deals-filter">
        <h4>Deal Category</h4>
        <select>
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