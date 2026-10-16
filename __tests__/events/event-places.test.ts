import {houseIn, inviteCode} from '../../src/events/event-places';

// Locations as organisers wrote them on Partake (October 2026).
describe('houseIn', () => {
  test.each([
    ['Goblet > w13 > p43', 'goblet', 13, 43],
    ['Empyreum, Ward 30, Plot 52', 'empyreum', 30, 52],
    ['Sophia Mist W18 P60', 'mist', 18, 60],
    ['☆Goblet☆ ☆Ward 7☆ ☆Plot 5☆', 'goblet', 7, 5],
    ['Lavender Beds - W20 - P58', 'lavenderBeds', 20, 58],
    ['Light | Twintania | The Goblet Ward 20 Plot 5', 'goblet', 20, 5],
    ['Light|Odin|LB|W04|P06', 'lavenderBeds', 4, 6],
    ['LB W7-P6', 'lavenderBeds', 7, 6],
    ['Chaos Sagi Empy W2 P52', 'empyreum', 2, 52],
    ['CHAOS | MOOGLE | MIST | WARD 16 | PLOT 32', 'mist', 16, 32],
    ['Lav. Beds. Ward 4 | Plot 36', 'lavenderBeds', 4, 36],
    ['Light-Raiden-Goblet-W11-P30', 'goblet', 11, 30],
    ['Empyreum W15 / P 12', 'empyreum', 15, 12],
    ['Shirogane - Ward 02 - Plot 16', 'shirogane', 2, 16],
    ['Goblet | P25 | W21', 'goblet', 21, 25],
    ['Goblet - W17/P5', 'goblet', 17, 5],
  ])('reads "%s"', (text, district, ward, plot) => {
    expect(houseIn(text)).toEqual({district, ward, plot});
  });

  test.each([
    // No ward or plot marked: which number is which is a guess.
    'LB - 6 - 58',
    'Lavender Beds, Ward 4',
    // Two districts, wards or plots.
    'Mist W1 P2, then Goblet W3 P4',
    'Goblet W1 P2 / W3 P2',
    // Numbers no ward or plot has.
    'Goblet W31 P2',
    'Goblet W1 P61',
    'Limsa Lominsa aetheryte plaza',
    '',
  ])('leaves out "%s"', text => {
    expect(houseIn(text)).toBeUndefined();
  });
});

describe('inviteCode', () => {
  test.each([
    ['https://discord.gg/Sunsetcoast', 'sunsetcoast'],
    ['discord.gg/sunsetcoast/', 'sunsetcoast'],
    ['https://discord.com/invite/pMZepR8XYP', 'pmzepr8xyp'],
    ['https://www.discordapp.com/invite/void-club', 'void-club'],
  ])('reads %s', (url, code) => {
    expect(inviteCode(url)).toBe(code);
  });

  test.each([null, '', 'https://linktr.ee/club', 'https://discord.gg/'])(
    'has none in %s',
    url => {
      expect(inviteCode(url)).toBeUndefined();
    },
  );
});
