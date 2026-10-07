import {createHash, randomBytes} from 'crypto';
import {Db, Doc} from '../db';
import {EmailSender} from '../email';
import {TooManyRequestsError} from '../errors';
import {User} from './user';
import {UsersService} from './users-service';

// One link waiting to be opened, per account. Only the token's hash is
// stored, so the database alone can't confirm anything.
interface ConfirmationDoc extends Doc {
  userId: string;
  // The address the link was sent to: the account's, or the one it's
  // changing to.
  email: string;
  tokenHash: string;
  expiresAt: string;
  lastSentAt: string;
  // Links sent since dayStartedAt, against DAILY_SENDS.
  sendsToday: number;
  dayStartedAt: string;
}

const LINK_HOURS = 24;
const RESEND_SECONDS = 60;
const DAILY_SENDS = 5;
const HOUR_MS = 60 * 60 * 1000;

function hashOf(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Confirms that people own the email address on their account: a new
// account (signed up with a password), or a new address from the settings.
// The link opens the site's /confirm-email page, which posts the token back.
// Without an email sender (RESEND_API_KEY unset) nothing is confirmed:
// accounts work at once, as before.
class EmailConfirmation {
  private readonly collection = 'emailConfirmations';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly sender: EmailSender | undefined,
    private readonly baseUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get enabled() {
    return !!this.sender;
  }

  // Sends a link to `email` for this account, replacing any earlier one.
  async send(user: User, email: string) {
    if (!this.sender) return;
    const now = this.now();
    const [existing] = await this.findBy('userId', user.id);

    let sendsToday = 0;
    let dayStartedAt = now.toISOString();
    if (existing) {
      const sinceLast = now.getTime() - Date.parse(existing.lastSentAt);
      if (sinceLast < RESEND_SECONDS * 1000) {
        const wait = Math.ceil(RESEND_SECONDS - sinceLast / 1000);
        throw new TooManyRequestsError(
          `We've just sent a link. Try again in ${wait} seconds.`,
          wait,
        );
      }
      if (now.getTime() - Date.parse(existing.dayStartedAt) < 24 * HOUR_MS) {
        sendsToday = existing.sendsToday;
        dayStartedAt = existing.dayStartedAt;
      }
      if (sendsToday >= DAILY_SENDS) {
        throw new TooManyRequestsError(
          "That's enough links for today. Try again tomorrow.",
          24 * 60 * 60,
        );
      }
    }

    const token = randomBytes(32).toString('base64url');
    const data = {
      userId: user.id,
      email,
      tokenHash: hashOf(token),
      expiresAt: new Date(now.getTime() + LINK_HOURS * HOUR_MS).toISOString(),
      lastSentAt: now.toISOString(),
      sendsToday: sendsToday + 1,
      dayStartedAt,
    };
    if (existing) {
      await this.db.update(this.collection, existing.id, data);
    } else {
      await this.db.create(this.collection, data);
    }

    await this.sender.send(this.message(user, email, token));
  }

  // Sends a new sign-up link to an account that hasn't been confirmed yet.
  // Says nothing about whether there is one, so the form can't be used to
  // find out who has an account.
  async resend(email: string) {
    const user = await this.usersService.getUserByEmail(email);
    if (user && !user.emailConfirmed && !user.system) {
      await this.send(user, user.email);
    }
  }

  // Opens a link: confirms the address it was sent to, and returns the
  // account, to sign in to.
  async confirm(token: string): Promise<User> {
    const [doc] = await this.findBy('tokenHash', hashOf(token));
    if (!doc || Date.parse(doc.expiresAt) <= this.now().getTime()) {
      throw new RangeError(
        'This link has expired or was already used. Sign in to get a new one.',
      );
    }
    const user = await this.usersService.confirmEmail(doc.userId, doc.email);
    await this.db.delete(this.collection, doc.id);
    return user;
  }

  // The account's links, when it's deleted.
  async forget(userId: string) {
    for (const doc of await this.findBy('userId', userId)) {
      await this.db.delete(this.collection, doc.id);
    }
  }

  private findBy(field: 'userId' | 'tokenHash', value: string) {
    return this.db.find<ConfirmationDoc>(this.collection, {
      where: [{field, op: '==', value}],
    });
  }

  private message(user: User, email: string, token: string) {
    const link = `${this.baseUrl}/confirm-email?token=${token}`;
    const changing = user.emailConfirmed;
    const subject = changing
      ? 'Confirm your new email address for Everise'
      : 'Confirm your email address for Everise';
    const intro = changing
      ? `Open this link to use ${email} for your Everise account, ${user.username}:`
      : `Welcome to Everise, ${user.username}! Open this link to confirm your email address and sign in:`;
    const outro = `The link works once, for ${LINK_HOURS} hours. If you didn't ask for it, ignore this email.`;
    const text = `${intro}\n\n${link}\n\n${outro}\n`;
    const href = escape(link);
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1b2a4a;line-height:1.5">
<p>${escape(intro)}</p>
<p><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold">Confirm my email</a></p>
<p style="font-size:13px">Or copy this address into your browser:<br><span style="word-break:break-all">${href}</span></p>
<p style="font-size:13px;color:#4b5563">${escape(outro)}</p>
</body></html>`;
    return {to: email, subject, text, html};
  }
}

function escape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export {EmailConfirmation};
