import {TooManyRequestsError} from '../errors';

// How often an account may be sent an email with a link or code: once a
// minute, and DAILY_SENDS times a day. The confirmation links and the
// password reset codes each keep their own count.

const RESEND_SECONDS = 60;
const DAILY_SENDS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// What a sending document keeps of the last ones.
interface SendCount {
  lastSentAt: string;
  // Sent since dayStartedAt, against DAILY_SENDS.
  sendsToday: number;
  dayStartedAt: string;
}

// The count after one more email, or a 429 when it's too soon. `what` is
// what the email holds ("link", "code"), for the message.
function nextSend(
  existing: SendCount | undefined,
  now: Date,
  what: string,
): SendCount {
  let sendsToday = 0;
  let dayStartedAt = now.toISOString();
  if (existing) {
    const sinceLast = now.getTime() - Date.parse(existing.lastSentAt);
    if (sinceLast < RESEND_SECONDS * 1000) {
      const wait = Math.ceil(RESEND_SECONDS - sinceLast / 1000);
      throw new TooManyRequestsError(
        `We've just sent a ${what}. Try again in ${wait} seconds.`,
        wait,
      );
    }
    if (now.getTime() - Date.parse(existing.dayStartedAt) < DAY_MS) {
      sendsToday = existing.sendsToday;
      dayStartedAt = existing.dayStartedAt;
    }
    if (sendsToday >= DAILY_SENDS) {
      throw new TooManyRequestsError(
        `That's enough ${what}s for today. Try again tomorrow.`,
        DAY_MS / 1000,
      );
    }
  }
  return {
    lastSentAt: now.toISOString(),
    sendsToday: sendsToday + 1,
    dayStartedAt,
  };
}

// Keeps a value out of an email's HTML.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export {SendCount, escapeHtml, nextSend};
