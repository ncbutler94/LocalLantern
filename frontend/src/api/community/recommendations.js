// POST a new Recommendation / Tip
import axios from 'axios';

export async function createRecommendation(formData) {
    const { data } = await axios.post(
        '/api/recommendations',        // ↔ route we built in Step 2
        formData,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;                     // { id, photos }
}
