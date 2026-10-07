import {UpstreamError} from '../errors';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

// How the app reaches Resend; tests pass a fake.
type EmailFetch = (
  url: string,
  init: {method: string; headers: Record<string, string>; body: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

const RESEND_URL = 'https://api.resend.com/emails';

// Sends email through Resend (resend.com), from an address on a domain
// verified there (everise.dev). The API key is a secret.
class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: EmailFetch = (url, init) =>
      (fetch as unknown as EmailFetch)(url, init),
  ) {}

  async send({to, subject, text, html}: EmailMessage) {
    const response = await this.fetchFn(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({from: this.from, to: [to], subject, text, html}),
    });
    if (!response.ok) {
      console.error(
        `Resend answered ${response.status}: ${JSON.stringify(
          await response.json().catch(() => null),
        )}`,
      );
      throw new UpstreamError(
        "The email couldn't be sent. Try again in a few minutes.",
      );
    }
  }
}

// Prints emails to the log instead of sending them: for local runs, with
// RESEND_API_KEY=console in .dev.vars.
class ConsoleEmailSender implements EmailSender {
  async send({to, subject, text}: EmailMessage) {
    console.log(`Email to ${to}: ${subject}\n${text}`);
  }
}

// The sender for RESEND_API_KEY: Resend, the log ("console"), or none.
function emailSenderFor(
  apiKey: string | undefined,
  from: string,
): EmailSender | undefined {
  if (!apiKey) return undefined;
  if (apiKey === 'console') return new ConsoleEmailSender();
  return new ResendEmailSender(apiKey, from);
}

export {
  ConsoleEmailSender,
  EmailFetch,
  EmailMessage,
  EmailSender,
  ResendEmailSender,
  emailSenderFor,
};
