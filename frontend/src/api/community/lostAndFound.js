// frontend/src/api/community/lostAndFound.js
import axios from 'axios';

// ensure cookies (your JWT) go along for the ride:
axios.defaults.withCredentials = true;

/**
 * @param {FormData} formData — title, description, files…
 * Sends it to your Express POST /api/lost-and-found route.
 */
export async function createLostAndFound(formData) {
    const { data } = await axios.post(
        '/api/lost-and-found',
        formData
    );
    return data; // { id, photos }
}
