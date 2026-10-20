// E-mail transacional (redefinição de senha e avisos). Provedor: Resend (HTTPS, sem SMTP).
// Configuração: RESEND_API_KEY e BOLD_MAIL_FROM (ex.: "The Bold <acesso@seudominio.com.br>", domínio verificado no Resend).
// Sem configuração, nada é enviado e quem chamou recebe { sent: false, reason } — nada é simulado.
export const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.BOLD_MAIL_FROM);

export async function sendMail({ to, subject, html, text }) {
  if (!mailConfigured()) return { sent: false, reason: 'E-mail não configurado (RESEND_API_KEY e BOLD_MAIL_FROM).' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.BOLD_MAIL_FROM, to: [to], subject, html, text }),
    });
    if (!r.ok) return { sent: false, reason: `Provedor de e-mail recusou (${r.status}): ${(await r.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: `Falha ao enviar e-mail: ${e.message}` };
  }
}
