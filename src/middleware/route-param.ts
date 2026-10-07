import {Request} from 'express';

// A named route parameter (`:id`) as a string. Express 5's types also allow
// string[] (for `*name` wildcards, which no route here uses), and they lose
// the route's names when a validator sits before the handler.
function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw new Error(`The route has no :${name} parameter.`);
  }
  return value;
}

export {routeParam};
