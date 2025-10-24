// frontend/src/api/community/generalDiscussion.js
import axios from 'axios';
axios.defaults.withCredentials = true;

export async function createGeneralDiscussion(formData) {
    const { data } = await axios.post('/api/general-discussion', formData);
    return data;             // { id, photos }
}
