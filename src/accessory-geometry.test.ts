import { expect, it } from 'vitest';
import { accessoryTop } from './accessory-geometry';
it.each([
  [0, 874, 822],
  [60, 480, 488],
  [100, 320, 368],
  [0, 240, 188],
  [60.5, 480.25, 488.75],
])(
  'anchors one measured 52px row to viewport offset %s and height %s',
  (offsetTop, height, expected) => {
    const top = accessoryTop({ offsetTop, height }, 52);
    expect(top).toBe(expected);
    expect(top + 52).toBe(offsetTop + height);
  },
);
it('does not double subtract safe area when the keyboard already reduces the viewport', () => {
  expect(accessoryTop({ offsetTop: 0, height: 874 }, 52, 34)).toBe(788);
  expect(accessoryTop({ offsetTop: 60, height: 480 }, 52, 0)).toBe(488);
});
it('clamps negative/oversized bounds without using document or horizontal scroll coordinates', () => {
  expect(accessoryTop({ offsetTop: -10, height: 400 }, 52)).toBe(348);
  expect(accessoryTop({ offsetTop: 0, height: 20 }, 52)).toBe(0);
  expect(accessoryTop({ offsetTop: 0, height: 400 }, 52, -20)).toBe(348);
});

it('intersects safe bounds continuously during keyboard animation without a keyboard threshold', () => {
  const positions = [874, 864, 844, 834, 540].map((height) =>
    accessoryTop({ offsetTop: 0, height }, 52, 34, 874),
  );
  expect(positions).toEqual([788, 788, 788, 782, 488]);
  expect(accessoryTop({ offsetTop: 60, height: 480 }, 52, 34, 874)).toBe(488);
});
