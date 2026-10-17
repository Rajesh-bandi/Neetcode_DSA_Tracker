import nodemailer from 'nodemailer';

/**
 * Mail is optional. With no SMTP_* config the OTP is printed to the server
 * console and handed back to the client once (dev convenience) — set the
 * SMTP_* variables in .env and that code never leaves the server.
 */
export function createMailer(env = process.env) {
  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!host || !user || !pass) {
    return {
      transport: 'console',
      async sendOtp({ email, code }) {
        console.log(`\n  verification code for ${email}: ${code}\n`);
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true' || Number(env.SMTP_PORT) === 465,
    auth: { user, pass },
  });

  const from = env.MAIL_FROM ?? `NeetCode 150 <${user}>`;

  return {
    transport: 'smtp',
    async sendOtp({ email, code, name }) {
      await transporter.sendMail({
        from,
        to: email,
        subject: `${code} is your NeetCode 150 code`,
        text: [
          `Hi${name ? ` ${name}` : ''},`,
          '',
          `Your one-time code is ${code}. It expires in 10 minutes.`,
          '',
          'If you did not ask for this, ignore the email.',
        ].join('\n'),
        html: `
          <div style="background:#1d2021;padding:32px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#ebdbb2">
            <p style="margin:0 0 8px;color:#a89984;font-size:12px;letter-spacing:.18em;text-transform:uppercase">NeetCode 150</p>
            <p style="margin:0 0 24px">Your one-time code:</p>
            <p style="margin:0 0 24px;font-size:34px;letter-spacing:.34em;color:#fabd2f">${code}</p>
            <p style="margin:0;color:#a89984;font-size:13px">Expires in 10 minutes. If you did not ask for this, ignore the email.</p>
          </div>
        `,
      });
    },
  };
}
