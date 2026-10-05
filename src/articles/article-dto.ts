import {config} from '../config';
import {Profile} from '../profiles';
import {Article} from './article';

// An article as the API returns it, for the viewer the profile was read for
// (`favorited`, `author.following`).
class ArticleDto {
  readonly article;

  constructor(article: Article, favorited: boolean, author: Profile) {
    this.article = {
      slug: article.slug,
      title: article.title,
      description: article.description,
      body: article.body,
      tagList: article.tags,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
      favorited: favorited,
      favoritesCount: article.favoritedBy.length,
      // Only on roulette results, so other articles keep the RealWorld shape.
      ...(article.roulette ? {roulette: article.roulette} : {}),
      author: {
        username: author.username,
        bio: author.bio,
        image:
          author.image || `${config.baseUrl}/assets/images/avatar-profile.png`,
        following: author.following,
      },
    };
  }
}

export {ArticleDto};
