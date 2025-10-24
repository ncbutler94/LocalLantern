// src/components/SidePanel/Events/EventsList.jsx
import React from 'react';

export default function EventsList({
                                     events = []       // default to empty array
                                   }) {
  if (!events.length) {
    return <p>No events to display.</p>;
  }

  return (
      <ul className="events-list">
        {events.map(ev => (
            <li key={ev.id} className="event-item">
              <h5>{ev.title}</h5>
              <p>{ev.locationName} — {new Date(ev.date).toLocaleDateString()}</p>
            </li>
        ))}
      </ul>
  );
}