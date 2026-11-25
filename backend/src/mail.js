// 引換券メールの送信。
// SMTP_HOST が設定されていない場合はメールを送らない（画面のQRを使う）。
// パスワードなどはリポジトリに書かず、.env（ローカル）か Secret Manager（クラウド）で渡す。
import nodemailer from 'nodemailer';

export function createMailer(env = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = env;
  if (!SMTP_HOST) {
    return { enabled: false, async sendTicket() { throw new Error('メール送信が設定されていません'); } };
  }
  const port = Number(SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return {
    enabled: true,
    async sendTicket({ to, guestName, eventName, itemCount, ticketUrl }) {
      const lines = [
        `${guestName} 様`,
        '',
        'クロークにてお荷物をお預かりいたしました。',
        eventName ? `ご出席のお集まり：${eventName}` : null,
        `お預かり品：${itemCount} 点`,
        '',
        'お引き取りの際は、下記のページに表示される引換券（QRコード）をスタッフにお見せください。',
        ticketUrl,
        '',
        '※ このメールは送信専用です。',
      ].filter((l) => l !== null);
      await transport.sendMail({
        from: MAIL_FROM || SMTP_USER,
        to,
        subject: '【クローク】お荷物の引換券',
        text: lines.join('\n'),
      });
    },
  };
}
