// src/components/SidePanel/Deals/DealsList.jsx
import React from 'react';

export default function DealsList({
                                    deals = []        // default to empty array
                                  }) {
  if (!deals.length) {
    return <p>No deals available.</p>;
  }

  return (
      <ul className="deals-list">
        {deals.map(deal => (
            <li key={deal.id} className="deal-item">
              <h5>{deal.title}</h5>
              <p>Expires: {new Date(deal.expiresAt).toLocaleDateString()}</p>
            </li>
        ))}
      </ul>
  );
}