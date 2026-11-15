import { it, expect } from 'vitest';
import { focusedInputDelta } from './useKeyboardViewport';
it('uses actual visible bounds for panned Safari and layout-resizing keyboards without applying an inset twice', () => {
  expect(focusedInputDelta({ top: 300, bottom: 344 }, { offsetTop: 100, height: 300 })).toBe(0);
  expect(focusedInputDelta({ top: 370, bottom: 414 }, { offsetTop: 100, height: 300 })).toBe(22);
  expect(focusedInputDelta({ top: 50, bottom: 94 }, { offsetTop: 100, height: 300 })).toBe(-58);
  expect(focusedInputDelta({ top: 300, bottom: 344 }, { offsetTop: 0, height: 300 })).toBe(52);
});

it('rounds fractional reveal distances outward for WebKit scroll-position rounding', () => {
  expect(
    focusedInputDelta({ top: 365.765625, bottom: 409.765625 }, { offsetTop: 70, height: 347 }),
  ).toBe(1);
  expect(focusedInputDelta({ top: 77.75, bottom: 121.75 }, { offsetTop: 70, height: 347 })).toBe(
    -1,
  );
});

it('reveals inputs above the measured Next/Done accessory without changing viewport sizing', () => {
  expect(focusedInputDelta({ top: 360, bottom: 404 }, { offsetTop: 50, height: 400 }, 398)).toBe(
    14,
  );
  expect(focusedInputDelta({ top: 340, bottom: 384 }, { offsetTop: 50, height: 400 }, 398)).toBe(0);
});
