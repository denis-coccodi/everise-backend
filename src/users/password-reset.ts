import {createHash, randomBytes} from 'crypto';
import {Db, Doc} from '../db';
import {EmailSender} from '../email';
import {UnavailableError} from '../errors';
import {SendCount, escapeHtml, nextSend} from './send-limits';
import {User} from './user';
import {UserPasswords} from './user-passwords';
import {UsersService} from './users-service';

// One code waiting to be used, per account. Only its hash is stored.
interface PasswordResetDoc extends Doc, SendCount {
  userId: string;
  codeHash: string;
  expiresAt: string;
}

const CODE_MINUTES = 15;
// The code's letters: no 0/O or 1/I to mix up. 8 of them (40 bits) are too
// many to guess: the code alone, without the email, finds the account.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function newCode() {
  const letters = [...randomBytes(CODE_LENGTH)].map(
    byte => ALPHABET[byte % ALPHABET.length],
  );
  return `${letters.slice(0, 4).join('')}-${letters.slice(4).join('')}`;
}

// The code as typed, in any case, with or without the dash or spaces.
function hashOf(code: string) {
  const plain = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return createHash('sha256').update(plain).digest('hex');
}

// "Forgot password?": a code sent to the account's address sets a new
// password without the old one. Accounts made with a provider can set
// their first password this way. Needs an email sender (RESEND_API_KEY).
class PasswordReset {
  private readonly collection = 'passwordResets';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly passwords: UserPasswords,
    private readonly sender: EmailSender | undefined,
    private readonly baseUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Sends a code to `email` when it's a confirmed account's, replacing any
  // earlier one. Says nothing about whether there is one, so the form can't
  // be used to find out who has an account.
  async send(email: string) {
    if (!this.sender) {
      throw new UnavailableError(
        "Passwords can't be reset by email on this site.",
      );
    }
    const user = await this.usersService.getUserByEmail(email);
    if (!user || !user.emailConfirmed) return;

    const now = this.now();
    const [existing] = await this.findBy('userId', user.id);
    const code = newCode();
    const data = {
      userId: user.id,
      codeHash: hashOf(code),
      expiresAt: new Date(
        now.getTime() + CODE_MINUTES * 60 * 1000,
      ).toISOString(),
      ...nextSend(existing, now, 'code'),
    };
    if (existing) {
      await this.db.update(this.collection, existing.id, data);
    } else {
      await this.db.create(this.collection, data);
    }
    await this.sender.send(this.codeMessage(user, code));
  }

  // Uses a code: sets the new password, which signs out everywhere.
  async reset(code: string, password: string): Promise<User> {
    const [doc] = await this.findBy('codeHash', hashOf(code));
    if (!doc || Date.parse(doc.expiresAt) <= this.now().getTime()) {
      throw new RangeError(
        'That code is wrong or has expired. Check it, or ask for a new one.',
      );
    }
    const user = await this.passwords.set(doc.userId, password);
    await this.db.delete(this.collection, doc.id);
    await this.notifyChanged(user);
    return user;
  }

  // Tells the member their password changed, so a change they didn't make
  // gets noticed. A failed email doesn't undo the change.
  async notifyChanged(user: User) {
    if (!this.sender) return;
    try {
      await this.sender.send(this.changedMessage(user));
    } catch (err) {
      console.error('Password change email failed', err);
    }
  }

  private findBy(field: 'userId' | 'codeHash', value: string) {
    return this.db.find<PasswordResetDoc>(this.collection, {
      where: [{field, op: '==', value}],
    });
  }

  private codeMessage(user: User, code: string) {
    const link = `${this.baseUrl}/reset-password?code=${code}`;
    const intro = `Here is the code to choose a new password for your Everise account, ${user.username}:`;
    const outro = `It works once, for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email: your password stays as it is.`;
    const text = `${intro}\n\n${code}\n\nOr open ${link}\n\n${outro}\n`;
    const href = escapeHtml(link);
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1b2a4a;line-height:1.5">
<p>${escapeHtml(intro)}</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>
<p><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold">Choose a new password</a></p>
<p style="font-size:13px;color:#4b5563">${escapeHtml(outro)}</p>
</body></html>`;
    return {to: user.email, subject: 'Your Everise password code', text, html};
  }

  private changedMessage(user: User) {
    const lines = [
      `The password of your Everise account, ${user.username}, was just changed, and every device signed in to it was signed out.`,
      `If that wasn't you, choose a new password with "Forgot password?" on ${this.baseUrl}/login.`,
    ];
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1b2a4a;line-height:1.5">
${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('\n')}
</body></html>`;
    return {
      to: user.email,
      subject: 'Your Everise password was changed',
      text: `${lines.join('\n\n')}\n`,
      html,
    };
  }
}

export {PasswordReset};
