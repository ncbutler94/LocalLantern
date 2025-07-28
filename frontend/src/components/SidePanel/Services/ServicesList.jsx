// src/components/SidePanel/Services/ServicesList.jsx
import React from 'react';

export default function ServicesList({
                                       services = []    // default to empty array
                                     }) {
  if (!services.length) {
    return <p>No services to display.</p>;
  }

  return (
      <ul className="services-list">
        {services.map(svc => (
            <li key={svc.id} className="service-item">
              <h5>{svc.name}</h5>
              <p>Rate: {svc.rate}</p>
            </li>
        ))}
      </ul>
  );
}