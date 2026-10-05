import {readFileSync} from 'fs';
import {join} from 'path';
import {readImageInfo} from '../../src/users/image-info';

// Real encoder output (a browser's canvas; pixel.gif is the classic 1×1 GIF).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, '../fixtures/images', name)));

describe('readImageInfo', () => {
  test.each([
    ['small.png', 'image/png', 64, 48],
    ['small.jpg', 'image/jpeg', 120, 90],
    ['pixel.gif', 'image/gif', 1, 1],
    // The three WebP layouts: lossy, lossless, and extended.
    ['vp8.webp', 'image/webp', 200, 150],
    ['vp8l.webp', 'image/webp', 300, 100],
    ['alpha.webp', 'image/webp', 500, 400],
  ])('reads %s as %s, %i × %i', (name, type, width, height) => {
    expect(readImageInfo(fixture(name))).toStrictEqual({type, width, height});
  });

  test.each([
    [
      'text',
      new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ],
    ['an empty file', new Uint8Array(0)],
    ['a truncated PNG', fixture('small.png').subarray(0, 18)],
    ['a truncated JPEG', fixture('small.jpg').subarray(0, 40)],
  ])('rejects %s', (_label, bytes) => {
    expect(readImageInfo(bytes)).toBeNull();
  });
});
