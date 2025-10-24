// src/components/SidePanel/Marketplace/MarketplaceList.jsx
import React from 'react';

export default function MarketplaceList({
                                          items = []        // default to empty array
                                        }) {
  if (!items.length) {
    return <p>No marketplace listings.</p>;
  }

  return (
      <ul className="marketplace-list">
        {items.map(item => (
            <li key={item.id} className="market-item">
              <h5>{item.title}</h5>
              <p>Price: {item.price}</p>
            </li>
        ))}
      </ul>
  );
}