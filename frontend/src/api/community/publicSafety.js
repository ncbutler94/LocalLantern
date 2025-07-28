import axios from 'axios';
axios.defaults.withCredentials = true;

/**
 * POST /api/public-safety
 *
 * @param {FormData} formData – includes title, severity, alert_type, etc.
 * @returns {Promise<Object>} – server JSON { id, photos: [] }
 */
export async function createPublicSafetyAlert(formData) {
    const { data } = await axios.post('/api/public-safety', formData);
    return data;
}
