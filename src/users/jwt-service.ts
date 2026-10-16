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
    private readonly jwtOptions: JWTOptions,
  ) {
    this.secondsToExpiration = jwtOptions.secondsToExpiration;
  }

  // `sv` is the account's session version: a token from before a password
  // change, or a "sign out everywhere", stops working.
  getToken(user: User) {
    const token = jwt.sign({sv: user.sessionVersion}, this.jwtSecretKey, {
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

    const user = await this.usersService.getUserById(decodedToken.sub);
    // Tokens from before session versions have none: version 0.
    if (user && user.sessionVersion !== (decodedToken.sv ?? 0)) {
      throw new jwt.JsonWebTokenError('session ended');
    }
    return user;
  }
}

export {JWTService};
