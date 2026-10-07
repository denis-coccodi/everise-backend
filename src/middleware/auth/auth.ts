import {NextFunction, Request, RequestHandler, Response} from 'express';
import {UnauthorizedError} from '../../errors';
import {JWTService} from '../../users';

interface AuthCheck {
  mode: 'required' | 'optional';
  handler: RequestHandler;
}

class Auth {
  constructor(private readonly jwtService: JWTService) {}

  requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = this.getToken(req);

      if (!token) {
        throw new UnauthorizedError(
          '"token" is required in "authorization" header',
        );
      }

      const user = await this.jwtService.getUser(token);

      if (!user) {
        throw new UnauthorizedError('"user" not found');
      }

      req.user = user;

      return next();
    } catch (err) {
      return next(err);
    }
  };

  optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = this.getToken(req);

      if (!token) {
        return next();
      }

      const user = await this.jwtService.getUser(token);

      if (!user) {
        throw new UnauthorizedError('"user" not found');
      }

      req.user = user;

      return next();
    } catch (err) {
      return next(err);
    }
  };

  // For route(): whether a route needs a signed-in user, and the middleware
  // that checks it. The OpenAPI document reads the mode.
  readonly required: AuthCheck = {mode: 'required', handler: this.requireAuth};
  readonly optional: AuthCheck = {mode: 'optional', handler: this.optionalAuth};

  private getToken = (req: Request) => {
    if (req.cookies?.token) {
      return req.cookies.token as string;
    }

    const authorizationHeader =
      req.header('Authorization') || req.header('authorization');

    if (!authorizationHeader) {
      return;
    }

    // Support both "Bearer <token>" and "Token <token>"
    const parts = authorizationHeader.split(' ');
    return parts.length === 2 ? parts[1] : undefined;
  };
}

export {Auth, AuthCheck};
