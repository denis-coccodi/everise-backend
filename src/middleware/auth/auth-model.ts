import {RequestHandler} from 'express';

interface AuthCheck {
  mode: 'required' | 'optional' | 'admin';
  handler: RequestHandler;
}

export {AuthCheck};
