// backend/src/utils/mailer.js
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const isProd = process.env.NODE_ENV === 'production';

function resolveLogoPath() {
    const candidates = [
        path.resolve(process.cwd(), 'src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../../src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), 'frontend/src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../frontend/src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), 'client/src/assets/LocalLanternLogo.png'),
        path.resolve(process.cwd(), '../client/src/assets/LocalLanternLogo.png'),
    ];

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch {
            // ignore
        }
    }
    return null;
}

function buildTransporter() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const portRaw = Number(process.env.SMTP_PORT);
    const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;

    const secure =
        String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();

    const allowSelfSigned =
        !isProd && String(process.env.SMTP_ALLOW_SELF_SIGNED || '').toLowerCase() === 'true';

    const transportOptions = {
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
    };

    // DEV-ONLY: allow self-signed certs when explicitly enabled
    if (allowSelfSigned) {
        transportOptions.tls = { rejectUnauthorized: false };
    }

    return nodemailer.createTransport(transportOptions);
}

const transporter = buildTransporter();

function fromAddress() {
    const fromEnv = String(process.env.SMTP_FROM || '').trim();
    const fromUser = String(process.env.SMTP_USER || '').trim();
    const from = fromEnv || fromUser || 'no-reply@thelocallantern.com';
    return `"The Local Lantern" <${from}>`;
}

/**
 * Sends a verification email with the given token.
 */
export async function sendVerificationEmail(email, firstName, verificationToken) {
    const verificationLink = `${process.env.APP_URL || 'http://localhost:4001'}/auth/verify/${verificationToken}`;

    const mailOptions = {
        from: fromAddress(),
        to: email,
        subject: 'Verify Your Email',
        messageId: `verify-${crypto.randomBytes(16).toString('hex')}@thelocallantern`,
        html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#111; line-height:1.5;">
        <p>Hello ${firstName},</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verificationLink}">${verificationLink}</a></p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
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
        from: fromAddress(),
        to: email,
        subject: 'Your Login Verification Code',
        messageId: `2fa-${crypto.randomBytes(16).toString('hex')}@thelocallantern`,
        html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#111; line-height:1.5;">
        <p>Hello ${firstName},</p>
        <p>You have exceeded the maximum number of login attempts. Please use the following code to complete your login:</p>
        <h2 style="letter-spacing:1px;">${code}</h2>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `,
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
            to: phoneNumber,
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
 * Includes the Local Lantern logo if found at src/assets/LocalLanternLogo.png (or common monorepo paths).
 */
export async function sendResetPasswordEmail(email, firstName, resetLink) {
    const logoPath = resolveLogoPath();
    const logoCid = 'locallantern-logo';

    const logoHtml = logoPath
        ? `<div style="text-align:center;margin-bottom:16px;">
         <img src="cid:${logoCid}" alt="The Local Lantern" style="max-width:180px;height:auto;display:inline-block;" />
       </div>`
        : `<div style="text-align:center;margin-bottom:16px;font-weight:700;font-size:18px;">The Local Lantern</div>`;

    const attachments = [];
    if (logoPath) {
        attachments.push({
            filename: 'LocalLanternLogo.png',
            path: logoPath,
            cid: logoCid,
        });
    }

    const mailOptions = {
        from: fromAddress(),
        to: email,
        subject: 'Password Reset Request',
        messageId: `reset-${crypto.randomBytes(16).toString('hex')}@thelocallantern`,
        html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background:#ffffff; color:#111; padding:24px;">
        ${logoHtml}
        <h2 style="margin:0 0 8px 0;">Reset your password</h2>
        <p style="margin:0 0 16px 0; line-height:1.5;">
          Hello ${firstName}, we received a request to reset your password.
        </p>

        <div style="margin:20px 0; text-align:center;">
          <a href="${resetLink}"
             style="display:inline-block; padding:12px 18px; background:#1976d2; color:#fff; text-decoration:none; border-radius:8px; font-weight:700;">
            Reset password
          </a>
        </div>

        <p style="margin:0 0 10px 0; line-height:1.5;">
          If you did not request this, you can safely ignore this email.
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:18px 0;" />

        <p style="margin:0; font-size:12px; color:#666; line-height:1.5;">
          If the button doesn’t work, copy and paste this link into your browser:<br />
          <span style="word-break:break-all;">${resetLink}</span>
        </p>
      </div>
    `,
        attachments,
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
