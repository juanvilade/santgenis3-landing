const nodemailer = require('nodemailer');

const MAX_FIELD_LENGTH = 3000;
const REQUIRED_FIELDS = ['name', 'email'];
const SITE_URL = 'https://santgenis3-landing.vercel.app';

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

function senderAddress() {
  return process.env.FROM_EMAIL || process.env.GMAIL_USER;
}

function senderName() {
  return process.env.FROM_NAME || 'Agudells Homes';
}

async function sendMail(mailOptions) {
  const preferredFrom = `"${senderName()}" <${senderAddress()}>`;
  try {
    return await transporter.sendMail({ ...mailOptions, from: preferredFrom });
  } catch (error) {
    if (!process.env.FROM_EMAIL || process.env.FROM_EMAIL === process.env.GMAIL_USER) throw error;

    // Gmail only allows custom From addresses when the alias is configured.
    // If hola@santgenis3.com is not accepted, keep delivery alive with the
    // authenticated mailbox while preserving the public reply-to address.
    console.error('Preferred from address failed; retrying with authenticated Gmail user:', error.message);
    return transporter.sendMail({
      ...mailOptions,
      from: `"${senderName()}" <${process.env.GMAIL_USER}>`,
      replyTo: mailOptions.replyTo || process.env.REPLY_TO_EMAIL || process.env.FROM_EMAIL,
    });
  }
}

function leadText(data) {
  return [
    'Nueva solicitud desde SantGenís3',
    '',
    `Nombre: ${data.name}`,
    `Email: ${data.email}`,
    `Teléfono: ${data.phone || '—'}`,
    '',
    'Mensaje:',
    data.message || '—',
  ].join('\n');
}

function leadHtml(data) {
  return `
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
  `;
}

function confirmationHtml(data) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #2C2C2C; line-height: 1.6;">
      <h2 style="color: #B58A3B; border-bottom: 1px solid #e5ded2; padding-bottom: 12px;">
        Hemos recibido tu solicitud
      </h2>
      <p>Hola ${escapeHtml(data.name)},</p>
      <p>
        Gracias por tu interés en <strong>SantGenís3 · Agudells Homes</strong>.
        Hemos recibido tu solicitud de información y nos pondremos en contacto contigo pronto.
      </p>
      <div style="background: #faf8f4; padding: 16px; border-left: 3px solid #B58A3B; margin: 20px 0;">
        <p style="font-weight: bold; color: #7a6a55; margin: 0 0 8px 0;">Resumen de tu mensaje:</p>
        <p style="margin: 0; white-space: pre-wrap;">${data.message ? escapeHtml(data.message) : 'Solicitud de información'}</p>
      </div>
      <p>
        Si quieres añadir algo, puedes responder directamente a este email.
      </p>
      <p style="margin-top: 28px; color: #7a6a55;">
        Agudells Homes<br>
        <a href="${SITE_URL}" style="color: #B58A3B;">SantGenís3</a>
      </p>
    </div>
  `;
}

async function postLeadToCrm(data) {
  const crmUrl = (process.env.SG3_CRM_URL || '').replace(/\/$/, '');
  const pin = process.env.SG3_CRM_PIN;
  if (!crmUrl || !pin) return { skipped: true };

  const authResponse = await fetch(`${crmUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
    redirect: 'manual',
  });

  if (!authResponse.ok) {
    throw new Error(`CRM auth failed: ${authResponse.status}`);
  }

  const cookie = authResponse.headers.get('set-cookie');
  if (!cookie) throw new Error('CRM auth did not return session cookie');

  const crmPayload = {
    name: data.name,
    profile: 'comprador',
    stage: 'nuevo',
    source: 'Landing SantGenís3',
    email: data.email,
    phone: data.phone,
    budget: 0,
    next_action: 'Contactar lead web',
    next_date: '',
    notes: [
      'Lead recibido desde formulario web de SantGenís3.',
      '',
      `Origen: ${SITE_URL}`,
      '',
      'Mensaje:',
      data.message || '—',
    ].join('\n'),
  };

  const crmResponse = await fetch(`${crmUrl}/api/crm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(crmPayload),
  });

  if (!crmResponse.ok) {
    const body = await crmResponse.text().catch(() => '');
    throw new Error(`CRM insert failed: ${crmResponse.status} ${body}`);
  }

  return crmResponse.json();
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

    const crmResult = await postLeadToCrm(data);

    await sendMail({
      to: process.env.CONTACT_EMAIL,
      replyTo: data.email,
      subject: `Nueva solicitud SantGenís3 — ${data.name}`,
      text: leadText(data),
      html: leadHtml(data),
    });

    await sendMail({
      to: data.email,
      replyTo: process.env.REPLY_TO_EMAIL || process.env.FROM_EMAIL || process.env.CONTACT_EMAIL,
      subject: 'Hemos recibido tu solicitud — Agudells Homes',
      text: [
        `Hola ${data.name},`,
        '',
        'Gracias por tu interés en SantGenís3 · Agudells Homes.',
        'Hemos recibido tu solicitud de información y nos pondremos en contacto contigo pronto.',
        '',
        'Resumen de tu mensaje:',
        data.message || 'Solicitud de información',
        '',
        'Agudells Homes',
      ].join('\n'),
      html: confirmationHtml(data),
    });

    return res.status(200).json({ success: true, crm: crmResult });
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
};
