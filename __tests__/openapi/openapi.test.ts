import {readFileSync, writeFileSync} from 'fs';
import request from 'supertest';
import {app} from '../utils';

// The committed copy the frontend generates its types from.
const FILE = 'openapi.json';

function savedDocument() {
  try {
    return readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
}

describe('GET /api/openapi.json', () => {
  test('describes the API, the same as the committed openapi.json', async () => {
    const response = await request(app).get('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    const current = JSON.stringify(response.body, null, 2) + '\n';
    const saved = savedDocument();
    if (saved !== current) {
      // Rewritten so a local run fixes it; commit the new file.
      writeFileSync(FILE, current);
    }
    expect({openapiJsonUpToDate: saved === current}).toEqual({
      openapiJsonUpToDate: true,
    });
  });

  test('has a page to browse it at /api/docs', async () => {
    const response = await request(app).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain("url: 'openapi.json'");
  });
});
