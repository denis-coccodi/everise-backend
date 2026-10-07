import * as express from 'express';
import {buildOpenApiDocument} from './openapi';

// Swagger UI, from its CDN, reading the document below.
const DOCS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Everise API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="docs"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({url: 'openapi.json', dom_id: '#docs'});
    </script>
  </body>
</html>
`;

// The API's own description: GET /api/openapi.json (OpenAPI 3.1) and a page
// to browse and try it, GET /api/docs.
function docsRouter() {
  const router = express.Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });
  router.get('/docs', (_req, res) => {
    res.type('html').send(DOCS_PAGE);
  });
  return router;
}

export {docsRouter};
