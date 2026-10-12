import {createHash} from 'crypto';
import {Article, ArticlesService, RouletteCard} from '../articles';
import {Db, Doc} from '../db';
import {DutiesService} from '../duties';
import {InvalidRouletteResultError, TooManyRequestsError} from '../errors';
import {User} from '../users';
import {CharacterRemarks, TATARU, characterAuthorId} from '../waking-sands';
import {RouletteResultInput, buildRouletteCard} from './roulette-result';

// The Waking Sands character who posts guests' results.
const GUEST_POSTER = TATARU;
const POSTER_NAME = GUEST_POSTER.name.split(' ')[0];

// Her line on a guest's result when the model can't write one.
const GUEST_LINES = [
  "Caught someone sneaking a roulette spin without signing in! I've filed it under my name instead. That'll be 500 gil.",
  'A mysterious adventurer just spun the roulette and tried to slip away without signing in. Not on my watch!',
  "No account, no name, no gil… but I'll post their result anyway. You're welcome.",
  "Ahem! Someone used the roulette without signing in. I'll post it for them, at the usual rate, of course.",
  "Spinning the roulette as a guest, are we? Very sneaky. Here's what you got, and yes, I'm keeping a ledger.",
];

// How often a result can be posted: per person (a signed-in user, or a guest
// by IP address), and in all for guests.
const USER_INTERVAL_SECONDS = 15;
const GUEST_INTERVAL_SECONDS = 60;
const GUEST_POSTS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

const MAX_COMMENT_LENGTH = 280;

interface PostLimitDoc extends Doc {
  lastPostAt?: number;
  windowStart?: number;
  count?: number;
}

// Posts accepted roulette results to the feeds, as articles with a result card.
// The card comes from the backend's duty data (buildRouletteCard); signed-in
// people may add a comment, and guests' results are posted by Tataru, the
// Waking Sands character, with a line of her own about it. Article creation
// itself (POST /api/articles) still needs a signed-in user.
class RoulettePostsService {
  private readonly limitsCollection = 'postLimits';

  constructor(
    private readonly db: Db,
    private readonly dutiesService: DutiesService,
    private readonly articlesService: ArticlesService,
    // Writes Tataru's line on a guest's result.
    private readonly remarks: CharacterRemarks,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

  async post(
    input: RouletteResultInput,
    user: User | undefined,
    comment: string | undefined,
    clientAddress: string,
    shareToDiscord = false,
  ): Promise<Article> {
    const guest = !user;
    const text = (comment ?? '').trim();
    if (guest && text) {
      throw new InvalidRouletteResultError(
        'Sign in to add a comment to your result.',
      );
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      throw new InvalidRouletteResultError(
        `Keep the comment to ${MAX_COMMENT_LENGTH} characters.`,
      );
    }

    const card = buildRouletteCard(input, await this.dutyData(), guest);

    const limitKey = user ? `user-${user.id}` : `guest-${hash(clientAddress)}`;
    await this.checkLimits(limitKey, guest);

    const authorId = user?.id ?? characterAuthorId(GUEST_POSTER.id);
    const article = await this.articlesService.createArticle(authorId, {
      title: `Duty Found: ${card.name}`,
      description: `${card.type} · ${card.mode}`,
      body: guest ? await this.guestLine(card) : text,
      tags: ['roulette'],
      roulette: card,
      // Tataru only posts on the site.
      shareToDiscord: !guest && shareToDiscord,
    });

    await this.recordPost(limitKey, guest);
    return article;
  }

  private async dutyData() {
    const [{groups}, {roulettes}, {jobs}] = await Promise.all([
      this.dutiesService.getDutyGroups(),
      this.dutiesService.getRoulettes(),
      this.dutiesService.getJobs(),
    ]);
    return {groups, roulettes, jobs};
  }

  // Tataru's line on a guest's result, by the model in her voice; one of
  // her usual ones when it can't. Guests' lines share one Neuron budget.
  private async guestLine(card: RouletteCard) {
    const remark = await this.remarks.remark(
      GUEST_POSTER.id,
      guestOccasion(card),
      'guests',
    );
    return (
      remark ?? GUEST_LINES[Math.floor(this.random() * GUEST_LINES.length)]
    );
  }

  private async checkLimits(key: string, guest: boolean) {
    const now = this.now().getTime();
    const interval =
      (guest ? GUEST_INTERVAL_SECONDS : USER_INTERVAL_SECONDS) * 1000;

    const own = await this.db.get<PostLimitDoc>(this.limitsCollection, key);
    const wait = (own?.lastPostAt ?? 0) + interval - now;
    if (wait > 0) {
      const seconds = Math.ceil(wait / 1000);
      throw new TooManyRequestsError(
        guest
          ? `Slow down! ${POSTER_NAME} is still filing your last result. Try again in ${seconds} seconds.`
          : `You can post another result in ${seconds} seconds.`,
        seconds,
      );
    }

    if (guest) {
      const all = await this.db.get<PostLimitDoc>(
        this.limitsCollection,
        'guests',
      );
      const inWindow = all && now - (all.windowStart ?? 0) < HOUR_MS;
      if (inWindow && (all.count ?? 0) >= GUEST_POSTS_PER_HOUR) {
        const seconds = Math.ceil(
          ((all.windowStart ?? 0) + HOUR_MS - now) / 1000,
        );
        throw new TooManyRequestsError(
          `${POSTER_NAME} has posted enough guest results for now. Sign in to post yours, or try again later.`,
          seconds,
        );
      }
    }
  }

  private async recordPost(key: string, guest: boolean) {
    const now = this.now().getTime();
    await this.db.set(this.limitsCollection, key, {lastPostAt: now});

    if (guest) {
      const all = await this.db.get<PostLimitDoc>(
        this.limitsCollection,
        'guests',
      );
      const inWindow = all && now - (all.windowStart ?? 0) < HOUR_MS;
      if (inWindow) {
        // Counted in one step, so posts arriving together all count.
        await this.db.increment(this.limitsCollection, 'guests', {count: 1});
      } else {
        await this.db.set(this.limitsCollection, 'guests', {
          windowStart: now,
          count: 1,
        });
      }
    }
  }
}

// What the model is told about a guest's result, for Tataru's line on it.
function guestOccasion(card: RouletteCard) {
  const job = card.job
    ? `, and the job they must play is ${card.job.name}`
    : '';
  return `Someone just spun the Everise duty roulette on the site without signing in, so you are posting their result to the feed for them. They got: ${card.type}, ${card.name} (${card.detail}), played as "${card.mode}"${job}.
Write the post's text that introduces their result, which is shown under it: react to what they got, and tease them a little for not signing in (a fee, your ledger, a guest sneaking a spin).`;
}

// Addresses aren't stored as they are.
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export {GUEST_LINES, MAX_COMMENT_LENGTH, RoulettePostsService};
