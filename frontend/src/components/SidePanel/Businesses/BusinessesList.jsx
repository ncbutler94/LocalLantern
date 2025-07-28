// src/components/SidePanel/Businesses/BusinessesList.jsx
import React from 'react';

export default function BusinessesList({
                                         items = []    // default to empty array to avoid undefined.length
                                       }) {
  if (!items.length) {
    return <p>No businesses to display.</p>;
  }

  return (
      <ul className="businesses-list">
        {items.map(business => (
            <li key={business.id} className="business-item">
              <h5>{business.name}</h5>
              <p>{business.address}</p>
            </li>
        ))}
      </ul>
  );
}