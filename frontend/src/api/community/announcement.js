// frontend/src/api/community/announcement.js
import axios from 'axios';

// Send cookies (JWT / session) by default in every axios call
axios.defaults.withCredentials = true;

/**
 * Create a new Announcement post.
 *
 * @param {FormData} formData – title, description, photos, city, county, etc.
 * @returns {Promise<Object>} – server response ({ id, ... })
 */
export async function createAnnouncement(formData) {
    const { data } = await axios.post(
        '/api/announcements',
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
            withCredentials: true,          // ← ensure cookie is included
        }
    );
    return data;
}
