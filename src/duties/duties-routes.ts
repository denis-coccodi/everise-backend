import {Db} from '../db';
import {FileStore} from '../files';
import {DutiesRouter} from './duties-router';
import {DutiesService} from './duties-service';
import {ImagesService} from './images-service';
import {HttpGet, XivApiClient} from './xivapi-client';

// The cached game data, put together for the app (src/app.ts): the duties,
// roulettes and jobs from XIVAPI and their images. The service and the
// client are shared with the features that use the game data.
interface DutiesParts {
  db: Db;
  httpGet: HttpGet;
  fileStore: FileStore;
  // Allows POST /api/duties/refresh; when unset, refreshing is disabled.
  refreshKey?: string;
  now: () => Date;
}

function dutiesRoutes(parts: DutiesParts) {
  const xivApiClient = new XivApiClient(parts.httpGet);
  const images = new ImagesService(parts.db, xivApiClient, parts.fileStore);
  const dutiesService = new DutiesService(
    parts.db,
    xivApiClient,
    images,
    parts.now,
  );
  return {
    router: new DutiesRouter(dutiesService, images, parts.refreshKey).router,
    dutiesService,
    xivApiClient,
  };
}

export {dutiesRoutes};
