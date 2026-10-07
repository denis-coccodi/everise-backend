// Documents are kept as JSON, which has no dates or bytes. These are written
// as {"$date": ms} and {"$bytes": base64}, and read back as Date and
// Uint8Array, so services get the same values the key-value store gave them.

type Json = null | boolean | number | string | Json[] | {[key: string]: Json};

// Tested by tag rather than instanceof, so values from another realm (e.g.
// cloned by the runtime) count too.
const isDate = (value: object): value is Date =>
  Object.prototype.toString.call(value) === '[object Date]';
const isBytes = (value: object): value is Uint8Array =>
  Object.prototype.toString.call(value) === '[object Uint8Array]';

function encode(value: unknown): Json | undefined {
  if (value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return value as Json;
  if (isDate(value)) return {$date: value.getTime()};
  if (isBytes(value)) {
    return {$bytes: Buffer.from(value).toString('base64')};
  }
  if (Array.isArray(value)) return value.map(item => encode(item) ?? null);
  const result: {[key: string]: Json} = {};
  for (const [key, item] of Object.entries(value)) {
    const encoded = encode(item);
    if (encoded !== undefined) result[key] = encoded;
  }
  return result;
}

function decode(value: Json): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const keys = Object.keys(value);
  if (keys.length === 1 && typeof value.$date === 'number') {
    return new Date(value.$date);
  }
  if (keys.length === 1 && typeof value.$bytes === 'string') {
    return new Uint8Array(Buffer.from(value.$bytes, 'base64'));
  }
  return Object.fromEntries(keys.map(key => [key, decode(value[key])]));
}

export {Json, decode, encode, isDate};
