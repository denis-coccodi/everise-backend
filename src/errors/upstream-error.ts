// An external service this app depends on failed or answered unexpectedly.
class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export {UpstreamError};
