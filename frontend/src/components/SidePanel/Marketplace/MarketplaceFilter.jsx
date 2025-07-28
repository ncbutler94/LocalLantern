// src/components/SidePanel/Marketplace/MarketplaceFilter.jsx
import React from 'react';

export default function MarketplaceFilter({
                                            subtypes = []      // e.g. ['For Sale', 'Barter'], default empty
                                          }) {
  return (
      <div className="marketplace-filter">
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