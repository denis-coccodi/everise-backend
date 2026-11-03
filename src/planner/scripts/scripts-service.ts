import {Db} from '../../db';
import {ValidationError} from '../../errors';
import {FightKinds} from '../fight-report-model';
import {BeforeRead, ReportsService} from '../reports-service';
import {parseTimeline} from './cactbot-timeline';
import {FightScript, ScriptDoc, ScriptSource} from './script-model';

const SCRIPTS = 'plannerScripts';

// The fights' scripts, from cactbot's raidboss timelines: what each
// Extreme, Savage and Ultimate fight's mechanics are, and which are its
// enrages, for completing a wipe with the part it never reached. The game
// data refresh sends each file (it reads them from cactbot's repository);
// kept one per game zone.
class ScriptsService {
  constructor(
    private readonly db: Db,
    private readonly reports: ReportsService,
    private readonly fightKinds: () => Promise<FightKinds>,
    private readonly now: () => Date,
  ) {}

  // Keeps a timeline file as its zone's script, in place of the one before.
  async store(source: ScriptSource, zone: number, text: string) {
    const parsed = parseTimeline(text);
    if (!parsed.mechanics.length) {
      throw new ValidationError([
        `${source.path} has no mechanics: check it's a cactbot raidboss timeline (a .txt file).`,
      ]);
    }
    const script: FightScript = {zone, ...parsed};
    await this.db.set(SCRIPTS, String(zone), {
      ...script,
      source,
      readAt: this.now().toISOString(),
    });
    return {
      zone,
      title: script.title,
      mechanicCount: script.mechanics.length,
      enrageCount: script.mechanics.filter(m => m.enrage).length,
    };
  }

  // How many fights have a script, and the Extreme, Savage and Ultimate
  // fights newer than the newest that has one (game zones are numbered in
  // the order they came out): cactbot hasn't got to them yet, so the
  // planner falls back to other groups' kills for them.
  async check() {
    const [docs, kinds] = await Promise.all([
      this.db.find<ScriptDoc>(SCRIPTS),
      this.fightKinds(),
    ]);
    const zones = new Set(docs.map(doc => doc.zone));
    const newest = Math.max(0, ...[...zones].filter(zone => kinds.has(zone)));
    const missing = [...kinds]
      .filter(([zone]) => newest > 0 && zone > newest && !zones.has(zone))
      .sort(([a], [b]) => a - b)
      .map(([zone, kind]) => ({zone, kind}));
    return {scriptCount: docs.length, newestZone: newest || null, missing};
  }

  // The script of the fight one of the report's pulls is of; null when
  // there's none (cactbot doesn't have it yet) or the log doesn't say
  // where the pull was fought.
  async forPull(code: string, pullId: number, beforeRead?: BeforeRead) {
    const zone = await this.reports.territory(code, pullId, beforeRead);
    if (zone === null) return null;
    const doc = await this.db.get<ScriptDoc>(SCRIPTS, String(zone));
    if (!doc) return null;
    const {title, mechanics, enrageIds, ignoredIds, source} = doc;
    return {zone, title, mechanics, enrageIds, ignoredIds, source};
  }
}

export {ScriptsService};
