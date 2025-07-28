// src/components/SidePanel/RealEstate/RealEstateList.jsx
import React from 'react';

export default function RealEstateList({
                                         items = []        // default to empty array
                                       }) {
  if (!items.length) {
    return <p>No real estate listings.</p>;
  }

  return (
      <ul className="realestate-list">
        {items.map(prop => (
            <li key={prop.id} className="realestate-item">
              <h5>{prop.title}</h5>
              <p>Price: {prop.price}</p>
            </li>
        ))}
      </ul>
  );
}
