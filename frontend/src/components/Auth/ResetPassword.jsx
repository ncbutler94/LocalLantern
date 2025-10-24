import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import './Auth.css';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function ResetPassword({ onSuccess, onCancel }) {
  const query = useQuery();
  const token = query.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [msg, setMsg]           = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    if (password !== confirm) {
      setMsg('Passwords do not match.');
      return;
    }
    try {
      const res = await axios.post(
          '/auth/reset-password',
          { token, newPassword: password },
          { withCredentials: true }
      );
      setMsg(res.data.message);
      onSuccess(res.data.message);
    } catch {
      setMsg('Error resetting password.');
    }
  };

  return (
      <div>
        <h2>Reset Password</h2>
        <form onSubmit={handleSubmit}>
          <label>New Password</label>
          <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
          />

          <label>Confirm New Password</label>
          <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
          />

          <button type="submit">Reset Password</button>
        </form>
        {msg && <p className="error">{msg}</p>}
        <button className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
  );
}
