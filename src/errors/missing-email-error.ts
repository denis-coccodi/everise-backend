// A provider account (Google, Facebook, Microsoft, Discord) that shares no
// confirmed email address, so it can't be matched to an Everise account or
// make one.
class MissingEmailError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} didn't share a confirmed email address.`);
  }
}

export {MissingEmailError};
