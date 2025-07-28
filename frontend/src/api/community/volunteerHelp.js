// src/api/volunteerHelp.js
// -----------------------------------------------------------------------------
// POST a new Volunteer Help Request
// -----------------------------------------------------------------------------

import axios from 'axios';

/**
 * Create a new volunteer‑help request.
 * @param {FormData} formData – fields + up to 4 image files
 * @returns {{ id:number, photos:string[] }}
 */
export async function createVolunteerRequest(formData) {
    const { data } = await axios.post(
        '/api/volunteer-help',        // ↔ route we built in Step 1
        formData,
        {
            withCredentials: true,
            headers: { 'Content-Type': 'multipart/form-data' }
        },
    );
    return data;                      // { id, photos }
}
