import {config} from '../config';

// A member as others see them (the Profile schema): the same shape on a
// profile, as a post's author and as a comment's. A Waking Sands character
// who posts (Tataru) has the same shape, with `character`.
function profileView(
  member: {
    id: string;
    username: string;
    bio?: string;
    image?: string;
    character?: string;
  },
  following: boolean,
) {
  return {
    id: member.id,
    username: member.username,
    following,
    bio: member.bio || null,
    image: member.image || `${config.baseUrl}/assets/images/avatar-profile.png`,
    ...(member.character ? {character: member.character} : {}),
  };
}

export {profileView};
