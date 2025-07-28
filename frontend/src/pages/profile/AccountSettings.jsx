// src/pages/profile/AccountSettings.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function AccountSettings({ onLogout, onLogin }) {
  const navigate = useNavigate();
  // CSRF token
  const [csrf, setCsrf] = useState('');

  // Email change state
  const [newEmail, setNewEmail]       = useState('');
  const [emailMsg, setEmailMsg]       = useState('');

  // Password change state
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');

  // Deletion state
  const [confirmText, setConfirmText] = useState('');
  const [deleteMsg, setDeleteMsg]     = useState('');

  // Fetch CSRF token once on mount
  useEffect(() => {
    axios
        .get('https://localhost:4001/auth/csrf-token', { withCredentials: true })
        .then(res => setCsrf(res.data.csrfToken))
        .catch(() => {
          console.error('Failed to fetch CSRF token');
          // optionally redirect to login
        });
  }, []);

  // 1) Send email-change verification
  const handleEmailChange = async e => {
    e.preventDefault();
    try {
      const res = await axios.post(
          'https://localhost:4001/auth/change-email',
          { new_email: newEmail },
          {
            headers:        { 'X-CSRF-Token': csrf },
            withCredentials: true
          }
      );
      setEmailMsg(res.data.message);
    } catch (err) {
      setEmailMsg(err.response?.data?.message || 'Failed to send verification');
    }
  };

  // 2) Change password
  const handlePasswordChange = async e => {
    e.preventDefault();
    try {
      const res = await axios.post(
          'https://localhost:4001/auth/change-password',
          {
            current_password: currentPassword,
            new_password:     newPassword
          },
          {
            headers:        { 'X-CSRF-Token': csrf },
            withCredentials: true
          }
      );

      // Success – show message and clear inputs
      setPasswordMsg(res.data.message);
      setCurrent('');
      setNewPassword('');
    } catch (err) {
           // If express-validator returned an errors array, join them
               const data = err.response?.data;
           if (Array.isArray(data?.errors)) {
               setPasswordMsg(data.errors.map(e => e.msg).join(' • '));
             } else {
               setPasswordMsg(data?.message || 'Password update failed');
             }
    }
  };

  // 3) Delete account
  const handleAccountDelete = async () => {
    try {
      await axios.delete(
          'https://localhost:4001/users',
          {
            headers:        { 'X-CSRF-Token': csrf },
            withCredentials: true
          }
      );
      onLogout();
      navigate('/');
    } catch (err) {
      setDeleteMsg(err.response?.data?.message || 'Account deletion failed');
    }
  };

  return (
      <div className="account-settings-page">
        <h2>Account Settings</h2>

        {/* Change Email */}
        <form onSubmit={handleEmailChange} className="settings-form">
          <h3>Change Email</h3>
          <label>
            New Email
            <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
            />
          </label>
          <button type="submit">Send Verification Link</button>
          {emailMsg && <p className="info-msg">{emailMsg}</p>}
        </form>

        {/* Change Password */}
        <form onSubmit={handlePasswordChange} className="settings-form">
          <h3>Change Password</h3>
          <label>
            Current Password
            <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrent(e.target.value)}
                required
            />
          </label>
          <label>
            New Password
            <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
            />
          </label>
          <button type="submit">Update Password</button>
          {passwordMsg && <p className="info-msg">{passwordMsg}</p>}
        </form>

        {/* Delete Account */}
        <div className="settings-form">
          <h3>Delete Account</h3>
          <p>Type <strong>DELETE</strong> to confirm:</p>
          <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
          />
          <button
              disabled={confirmText !== 'DELETE'}
              onClick={handleAccountDelete}
          >
            Delete My Account
          </button>
          {deleteMsg && <p className="info-msg">{deleteMsg}</p>}
        </div>
      </div>
  );
}
