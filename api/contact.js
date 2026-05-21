const nodemailer = require('nodemailer');

const MAX_FIELD_LENGTH = 3000;
const REQUIRED_FIELDS = ['name', 'email'];

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalize(value = '') {
  return String(value).trim().slice(0, MAX_FIELD_LENGTH);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.CONTACT_EMAIL) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    const body = req.body || {};

    // Honeypot antispam: real users never fill this hidden field.
    if (body.company) {
      return res.status(200).json({ success: true });
    }

    const data = {
      name: normalize(body.name),
      email: normalize(body.email),
      phone: normalize(body.phone),
      message: normalize(body.message),
    };

    for (const field of REQUIRED_FIELDS) {
      if (!data[field]) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    if (!isValidEmail(data.email)) {
      return res.status(400).json({ error: 'Email no válido' });
    }

    await transporter.sendMail({
      from: `"Agudells Homes Web" <${process.env.GMAIL_USER}>`,
      to: process.env.CONTACT_EMAIL,
      replyTo: data.email,
      subject: `Nueva solicitud SantGenís3 — ${data.name}`,
      text: [
        'Nueva solicitud desde santgenis3-landing.vercel.app',
        '',
        `Nombre: ${data.name}`,
        `Email: ${data.email}`,
        `Teléfono: ${data.phone || '—'}`,
        '',
        'Mensaje:',
        data.message || '—',
      ].join('\n'),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #2C2C2C;">
          <h2 style="color: #B58A3B; border-bottom: 1px solid #e5ded2; padding-bottom: 12px;">
            Nueva solicitud desde SantGenís3
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #7a6a55; width: 120px;">Nombre</td>
              <td style="padding: 8px 12px;">${escapeHtml(data.name)}</td>
            </tr>
            <tr style="background: #faf8f4;">
              <td style="padding: 8px 12px; font-weight: bold; color: #7a6a55;">Email</td>
              <td style="padding: 8px 12px;"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #7a6a55;">Teléfono</td>
              <td style="padding: 8px 12px;">${data.phone ? escapeHtml(data.phone) : '—'}</td>
            </tr>
          </table>
          <div style="background: #faf8f4; padding: 16px; border-left: 3px solid #B58A3B; margin: 20px 0;">
            <p style="font-weight: bold; color: #7a6a55; margin: 0 0 8px 0;">Mensaje:</p>
            <p style="margin: 0; white-space: pre-wrap;">${data.message ? escapeHtml(data.message) : '—'}</p>
          </div>
          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            Puedes responder directamente a este email: llegará a ${escapeHtml(data.email)}.
          </p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
};
