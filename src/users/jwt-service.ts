import * as jwt from 'jsonwebtoken';
import {User} from './user';
import {UsersService} from './users-service';

interface JWTOptions {
  issuer: string;
  secondsToExpiration: number;
}

class JWTService {
  readonly secondsToExpiration: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtSecretKey: string,
    private readonly jwtOptions: JWTOptions
  ) {
    this.secondsToExpiration = jwtOptions.secondsToExpiration;
  }

  getToken(user: User) {
    const token = jwt.sign({}, this.jwtSecretKey, {
      subject: user.id,
      issuer: this.jwtOptions.issuer,
      expiresIn: `${this.jwtOptions.secondsToExpiration}s`,
    });

    return token;
  }

  async getUser(token: string) {
    const decodedToken = jwt.verify(token, this.jwtSecretKey, {
      issuer: this.jwtOptions.issuer,
      ignoreExpiration: false,
    }) as jwt.JwtPayload;

    if (!decodedToken.sub) {
      return undefined;
    }

    return this.usersService.getUserById(decodedToken.sub);
  }
}

export {JWTService};
