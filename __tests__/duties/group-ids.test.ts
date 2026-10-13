import {GROUP_IDS, groupId} from '../../src/duties/group-ids';
import {GROUP_ORDER} from '../../src/duties/xivapi-records';

describe('groupId', () => {
  test('every known group has its own fixed id', () => {
    const ids = GROUP_ORDER.map(groupId);
    expect(ids.every(id => id < 1000)).toBe(true);
    expect(new Set(ids).size).toBe(GROUP_ORDER.length);
    expect(Object.keys(GROUP_IDS).sort()).toStrictEqual(
      [...GROUP_ORDER].sort(),
    );
  });

  test('a group the table does not list gets the same id every time, from 1000 up', () => {
    const id = groupId('Quest Battles');
    expect(id).toBeGreaterThanOrEqual(1000);
    expect(groupId('Quest Battles')).toBe(id);
    expect(groupId('Masked Carnivale')).not.toBe(id);
  });
});
