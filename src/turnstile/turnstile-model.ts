// What the site's forms ask the check for; siteverify answers with it, so a
// token from the login form can't sign anyone up.
type TurnstileAction =
  'signup' | 'login' | 'resend' | 'forgot-password' | 'reset-password';

export {TurnstileAction};
