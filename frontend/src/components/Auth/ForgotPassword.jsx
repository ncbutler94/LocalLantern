import React, { useState } from 'react';
import axios from 'axios';
import './Auth.css';

export default function ForgotPassword({ onSuccess, onCancel }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg]     = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      const res = await axios.post(
          '/auth/forgot-password',
          { email },
          { withCredentials: true }
      );
      setMsg(res.data.message);
      onSuccess(res.data.message);
    } catch {
      setMsg('Error sending reset link.');
    }
  };

  return (
      <div>
        <h2>Forgot Password</h2>
        <form onSubmit={handleSubmit}>
          <label>Email Address</label>
          <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
          />
          <button type="submit">Send Reset Link</button>
        </form>
        {msg && <p className="error">{msg}</p>}
        <button className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
  );
}
