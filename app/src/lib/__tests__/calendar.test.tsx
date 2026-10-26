import { monthWeeks } from '../../components/DateSheet';

describe('calendar layout', () => {
  test('every week has 7 cells and dates sit under the right weekday', () => {
    for (let m = 0; m < 12; m++) {
      const weeks = monthWeeks(2026, m);
      for (const w of weeks) expect(w).toHaveLength(7);
      weeks.flat().forEach((iso, i) => {
        if (iso) expect(new Date(iso + 'T00:00:00').getDay()).toBe(i % 7);
      });
    }
    // 2026-10-01 is a Thursday
    expect(monthWeeks(2026, 9)[0].indexOf('2026-10-01')).toBe(4);
  });
});