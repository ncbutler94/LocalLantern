// backend/src/utils/mailer.js
import nodemailer from 'nodemailer';
import twilio from 'twilio';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,               // e.g., "smtp.office365.com"
  port: Number(process.env.SMTP_PORT),       // e.g., 587
  secure: process.env.SMTP_SECURE === 'true', // false for port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Sends a verification email with the given token.
 */
export async function sendVerificationEmail(email, firstName, verificationToken) {
  const verificationLink = `${process.env.APP_URL || 'http://localhost:4001'}/auth/verify/${verificationToken}`;
  const mailOptions = {
    from:    `"The Local Lantern" <${process.env.SMTP_USER}>`,
    to:      email,
    subject: 'Verify Your Email',
    messageId: `verify-${verificationToken}@thelocallantern`,
    html: `
      <p>Hello ${firstName},</p>
      <p>Please verify your email by clicking the link below:</p>
      <a href="${verificationLink}">${verificationLink}</a>
      <p>If you did not request this, please ignore this email.</p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.response);
    return info;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
}

/**
 * Sends a 2FA verification code via email.
 */
export async function sendTwoFactorCode(email, firstName, code) {
  const mailOptions = {
    from: `"The Local Lantern" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Login Verification Code',
    messageId: `2fa-${code}@thelocallantern`,
    html: `
      <p>Hello ${firstName},</p>
      <p>You have exceeded the maximum number of login attempts. Please use the following code to complete your login:</p>
      <h2>${code}</h2>
      <p>This code will expire in 10 minutes.</p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('2FA email sent:', info.response);
    return info;
  } catch (error) {
    console.error('Error sending 2FA email:', error);
    throw error;
  }
}

/**
 * Sends a 2FA verification code via SMS using Twilio.
 */
export async function sendSmsTwoFactorCode(phoneNumber, firstName, code) {
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    const message = await client.messages.create({
      body: `Hello ${firstName}, your verification code is: ${code}. It expires in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    console.log('SMS 2FA sent, SID:', message.sid);
    return message;
  } catch (error) {
    console.error('Error sending SMS 2FA:', error);
    throw error;
  }
}

/**
 * Sends a password reset email with the given reset link.
 */
export async function sendResetPasswordEmail(email, firstName, resetLink) {
  console.log('Forgot Password Request for email:', email);
  const mailOptions = {
    from: `"The Local Lantern" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    messageId: `reset-${resetLink}@thelocallantern`,
    html: `
      <p>Hello ${firstName},</p>
      <p>You requested a password reset. Please click the link below to reset your password:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>If you did not request this, please ignore this email.</p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Reset password email sent:', info.response);
    return info;
  } catch (error) {
    console.error('Error sending reset password email:', error);
    throw error;
  }
}