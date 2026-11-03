import {parseTimeline} from '../../src/planner/scripts/cactbot-timeline';

describe('parseTimeline', () => {
  test('keeps an id cast as an enrage and as a mechanic out of the enrages', () => {
    const {enrageIds, mechanics} = parseTimeline(`### A FIGHT
10.0 "Special Bombarian Special" Ability { id: "9752", source: "Brute Bomber" }
300.0 "Special Bombarian Special (enrage)" Ability { id: "9752", source: "Brute Bomber" }
310.0 "Final Fusedown (enrage)?" Ability { id: "9753", source: "Brute Bomber" }`);

    expect(enrageIds).toEqual([0x9753]);
    // A name's trailing "?" (a time cactbot isn't sure of) goes.
    expect(mechanics.map(m => m.name)).toEqual([
      'Special Bombarian Special',
      'Special Bombarian Special (enrage)',
      'Final Fusedown (enrage)',
    ]);
  });

  test('leaves out syncs, comments and lines without a time, and keeps a mechanic with no id', () => {
    const {mechanics} = parseTimeline(`### A FIGHT
# 10.0 "Commented" Ability { id: "1" }
hideall "--sync--"
5.0 "--sync--" Ability { id: "A1", source: "Boss" }
7.5 "Knockback"`);

    expect(mechanics).toEqual([
      {
        at: 7_500,
        name: 'Knockback',
        ids: [],
        phase: null,
        block: null,
        enrage: false,
      },
    ]);
  });
});
