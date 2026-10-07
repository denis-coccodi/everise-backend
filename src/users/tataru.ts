import {
  ProfileImagesService,
  profileImageUrl,
  uploadedImageId,
} from './profile-images-service';
import {User} from './user';
import {UsersService} from './users-service';

// Reads a picture shipped with the backend (public/), e.g. Tataru's first one;
// undefined when it can't be read.
type LoadBundledPicture = (path: string) => Promise<Uint8Array | undefined>;

const TATARU = {
  username: 'Tataru',
  email: 'tataru@everise.invalid',
  bio: 'Receptionist, accountant and keeper of the books. I post roulette results for adventurers who forget to sign in. For a modest fee.',
};
// Her first picture: the "dress-up Tataru" minion portrait from the game's
// data (via XIVAPI), used under Square Enix's fan site materials licence.
const TATARU_PICTURE = '/assets/images/tataru.png';

// Tataru: a real account that posts guests' roulette results. Nobody can
// sign in as her (her password is random and never kept); admins edit her
// bio and picture. Her picture is an uploaded one, like anyone's: on first
// use, the bundled portrait is stored as her upload.
class TataruAccount {
  constructor(
    private readonly usersService: UsersService,
    private readonly profileImagesService: ProfileImagesService,
    private readonly loadBundledPicture: LoadBundledPicture,
  ) {}

  async get(): Promise<User> {
    const tataru = await this.usersService.getOrCreateSystemUser(TATARU);
    if (uploadedImageId(tataru.image)) {
      return tataru;
    }

    // New, or still pointing at the picture the site used to serve.
    const picture = await this.loadBundledPicture(TATARU_PICTURE);
    if (!picture) {
      return tataru;
    }
    const id = await this.profileImagesService.save(tataru.id, picture);
    return this.usersService.setImage(tataru.id, profileImageUrl(id));
  }
}

export {LoadBundledPicture, TATARU, TataruAccount};
