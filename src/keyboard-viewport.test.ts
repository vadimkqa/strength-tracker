import { it, expect } from 'vitest';
import { focusedInputDelta } from './useKeyboardViewport';
it('uses actual visible bounds for panned Safari and layout-resizing keyboards without applying an inset twice', () => {
  expect(focusedInputDelta({ top: 300, bottom: 344 }, { offsetTop: 100, height: 300 })).toBe(0);
  expect(focusedInputDelta({ top: 370, bottom: 414 }, { offsetTop: 100, height: 300 })).toBe(22);
  expect(focusedInputDelta({ top: 50, bottom: 94 }, { offsetTop: 100, height: 300 })).toBe(-58);
  expect(focusedInputDelta({ top: 300, bottom: 344 }, { offsetTop: 0, height: 300 })).toBe(52);
});
