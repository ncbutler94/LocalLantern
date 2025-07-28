// src/components/SidePanel/Jobs/JobsList.jsx
import React from 'react';

export default function JobsList({
                                   jobs = [],
                                   onCreateJob = () => {}
                                 }) {
  return (
      <div className="jobs-list-container">
        <button className="create-job-btn" onClick={onCreateJob}>
          Create A Job
        </button>
        {jobs.length === 0 ? (
            <p>No jobs currently listed.</p>
        ) : (
            <ul className="jobs-list">
              {jobs.map(job => (
                  <li key={job.id} className="job-item">
                    <h5>{job.title}</h5>
                    <p>{job.locationName}</p>
                  </li>
              ))}
            </ul>
        )}
      </div>
  );
}