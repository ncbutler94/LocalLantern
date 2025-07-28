// src/components/SidePanel/RealEstate/RealEstateFilter.jsx
import React from 'react';

export default function RealEstateFilter({
                                           subtypes = []      // e.g. ['Rent', 'Sale'], default empty
                                         }) {
  return (
      <div className="realestate-filter">
        <h4>Listing Type</h4>
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
