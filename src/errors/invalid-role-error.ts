// A role change that can't be made (e.g. demoting an admin).
class InvalidRoleError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export {InvalidRoleError};
