import {
  ConsoleEmailSender,
  EmailFetch,
  ResendEmailSender,
  emailSenderFor,
} from '../../src/email';
import {UpstreamError} from '../../src/errors';

const MESSAGE = {
  to: 'alisaie@example.com',
  subject: 'Confirm your email address for Everise',
  text: 'Open this link',
  html: '<p>Open this link</p>',
};

describe('sending email through Resend', () => {
  test('posts the message with the API key, from the configured sender', async () => {
    const calls: Parameters<EmailFetch>[] = [];
    const sender = new ResendEmailSender(
      're_key',
      'Everise <noreply@everise.dev>',
      async (url, init) => {
        calls.push([url, init]);
        return {ok: true, status: 200, json: async () => ({id: 'e1'})};
      }
    );

    await sender.send(MESSAGE);

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toStrictEqual({
      from: 'Everise <noreply@everise.dev>',
      to: ['alisaie@example.com'],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  test("reports Resend's refusal as an upstream error", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sender = new ResendEmailSender(
      're_key',
      'x@everise.dev',
      async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'The everise.dev domain is not verified.',
        }),
      })
    );

    await expect(sender.send(MESSAGE)).rejects.toBeInstanceOf(UpstreamError);
  });

  test('RESEND_API_KEY picks the sender: none, the log, or Resend', () => {
    expect(emailSenderFor(undefined, 'x')).toBeUndefined();
    expect(emailSenderFor('', 'x')).toBeUndefined();
    expect(emailSenderFor('console', 'x')).toBeInstanceOf(ConsoleEmailSender);
    expect(emailSenderFor('re_key', 'x')).toBeInstanceOf(ResendEmailSender);
  });
});
