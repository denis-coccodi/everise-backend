import {Attachment} from '../media';
import {PartyFinderPost, RouletteCard} from './article-model';

class Article {
  constructor(
    readonly id: string,
    readonly authorId: string,
    // Only on posts from before posts had ids in their links.
    readonly slug: string | undefined,
    readonly title: string,
    readonly description: string,
    readonly body: string,
    readonly tags: string[],
    readonly favoritedBy: string[],
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly roulette?: RouletteCard,
    // Images, GIFs and videos, shown apart from the text.
    readonly media: Attachment[] = [],
    readonly partyFinder?: PartyFinderPost,
  ) {}
}

export {Article};
