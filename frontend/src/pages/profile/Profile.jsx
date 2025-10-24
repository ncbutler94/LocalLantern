// src/pages/profile/Profile.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function Profile({ onLogin }) {
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [csrf, setCsrf] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // 1) Fetch CSRF token
    axios
        .get('https://localhost:4001/auth/csrf-token', { withCredentials: true })
        .then(res => setCsrf(res.data.csrfToken))
        .catch(() => navigate('/login'));

    // 2) Fetch current user profile
    axios
        .get('https://localhost:4001/users/profile', { withCredentials: true })
        .then(res => setForm(res.data.user))
        .catch(() => navigate('/login'));
  }, [navigate]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleFileChange = e => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async e => {
    e.preventDefault();

    const data = new FormData();
    data.append('first_name', form.first_name);
    data.append('last_name', form.last_name);
    if (form.phone_number) {
           data.append('phone_number', form.phone_number);
          }
    if (file) data.append('profile_picture', file);

    try {
      const res = await axios.put(
          'https://localhost:4001/users/profile',
          data,
          {
            headers: {
              'X-CSRF-Token': csrf,
              'Content-Type': 'multipart/form-data'
            },
            withCredentials: true
          }
      );
      onLogin(res.data.user);
      setForm(res.data.user);
      setFile(null);
      alert('Profile updated successfully!');
    } catch (err) {
      console.error('Profile update failed', err.response?.data || err);
      alert('Failed to update profile.');
    }
  };

  if (!form) return <div>Loading…</div>;

  // Determine image URL: use absolute if provided, else prefix localhost
  let profilePicUrl = null;
  if (form.profile_picture) {
    profilePicUrl = form.profile_picture.startsWith('http')
        ? form.profile_picture
        : `https://localhost:4001${form.profile_picture}`;
  }

  return (
      <div className="profile-page">
        <h2>Edit Your Profile</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label>
              Profile Picture
              <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
              />
            </label>
          </div>

          {profilePicUrl && (
              <div style={{ marginTop: 10 }}>
                <img
                    src={profilePicUrl}
                    alt="Current profile"
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: '50%'
                    }}
                />
              </div>
          )}

          <div style={{ marginTop: 20 }}>
            <label>
              First Name
              <input
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  required
              />
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>
              Last Name
              <input
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  required
              />
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>
              Phone Number
              <input
                  name="phone_number"
                  value={form.phone_number || ''}
                  onChange={handleChange}
                  placeholder="(optional)"
              />
            </label>
          </div>

          <button type="submit" style={{ marginTop: 20 }}>
            Save Changes
          </button>
        </form>
      </div>
  );
}
