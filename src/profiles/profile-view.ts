import {config} from '../config';

// A member as others see them (the Profile schema): the same shape on a
// profile, as a post's author and as a comment's.
function profileView(
  member: {id: string; username: string; bio?: string; image?: string},
  following: boolean,
) {
  return {
    id: member.id,
    username: member.username,
    following,
    bio: member.bio || null,
    image: member.image || `${config.baseUrl}/assets/images/avatar-profile.png`,
  };
}

export {profileView};
