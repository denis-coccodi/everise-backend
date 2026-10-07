import {z} from 'zod';

// Turns failed checks into messages for people: `"article.title" is
// required`, `"comment" must be at most 280 characters`. A message written
// into a schema (`.max(280, {error: '...'})`) is used as it is.

const PATH = '{path}';

const UNITS: Record<string, string> = {
  string: 'characters',
  array: 'items',
  set: 'items',
};

// Zod's error map: only the checks' default messages come through here.
function defaultMessage(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined
        ? `${PATH} is required`
        : `${PATH} must be a ${issue.expected}`;
    case 'too_big':
    case 'too_small': {
      const limit = issue.code === 'too_big' ? issue.maximum : issue.minimum;
      const unit = UNITS[issue.origin];
      const bound = issue.code === 'too_big' ? 'at most' : 'at least';
      if (
        issue.origin === 'string' &&
        issue.code === 'too_small' &&
        limit === 1
      ) {
        return `${PATH} can't be empty`;
      }
      if (unit) return `${PATH} must have ${bound} ${limit} ${unit}`;
      return `${PATH} must be ${bound} ${limit}`;
    }
    case 'invalid_format':
      return `${PATH} must be a valid ${issue.format}`;
    case 'invalid_value':
      return `${PATH} must be one of ${issue.values.join(', ')}`;
    case 'unrecognized_keys':
      return `${issue.keys.map(key => `"${key}"`).join(', ')} is not allowed`;
    default:
      return undefined;
  }
}

// The messages for a failed parse, with each one's field name filled in.
function issueMessages(error: z.ZodError, segment: string): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length ? issue.path.join('.') : segment;
    return issue.message.replace(PATH, `"${path}"`);
  });
}

export {defaultMessage, issueMessages};
