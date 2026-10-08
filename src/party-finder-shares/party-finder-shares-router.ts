import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {ArticleDto, ArticleResponse} from '../articles';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {
  NewPartyFinderDiscordShare,
  NewPartyFinderPost,
  PartyFinderDiscordShareResponse,
} from './party-finder-share-schemas';
import {PartyFinderSharesService} from './party-finder-shares-service';

// Sharing a Party Finder listing, for members only: as a post (with the
// member's words, and in the Everise Discord when they ask), or straight
// to the Discord channel.
class PartyFinderSharesRouter {
  constructor(
    private readonly auth: Auth,
    private readonly sharesService: PartyFinderSharesService,
    private readonly profilesService: ProfilesService,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'post',
        path: '/party-finder/posts',
        summary: 'Share a Party Finder listing as a post',
        auth: this.auth.required,
        body: NewPartyFinderPost,
        responses: {
          201: {description: 'The post.', schema: ArticleResponse},
        },
      },
      async (req, res) => {
        const {dataCentre, listingId, comment, shareToDiscord} = req.body;
        const article = await this.sharesService.post(
          req.user!,
          dataCentre,
          listingId,
          comment,
          shareToDiscord,
        );
        const author = await this.profilesService.getProfile(article.authorId);
        res
          .status(StatusCodes.CREATED)
          .json(new ArticleDto(article, false, author));
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/party-finder/discord',
        summary: 'Share a Party Finder listing in the Everise Discord',
        auth: this.auth.required,
        body: NewPartyFinderDiscordShare,
        responses: {
          202: {
            description: 'Sent to the channel.',
            schema: PartyFinderDiscordShareResponse,
          },
        },
      },
      async (req, res) => {
        const {dataCentre, listingId, comment} = req.body;
        await this.sharesService.toDiscord(
          req.user!,
          dataCentre,
          listingId,
          comment,
        );
        res.status(StatusCodes.ACCEPTED).json({shared: true});
      },
    );

    return router;
  }
}

export {PartyFinderSharesRouter};
