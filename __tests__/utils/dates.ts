// The API's dates are ISO strings (JSON has no date type); this matches one
// at or after `iso`, e.g. an `updatedAt` after an update.
function atOrAfter(iso: string) {
  return expect.toSatisfy(
    (value: string) => Date.parse(value) >= Date.parse(iso),
  );
}

export {atOrAfter};
