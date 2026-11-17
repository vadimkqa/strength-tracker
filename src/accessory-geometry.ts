/** Fixed-layer coordinates: intersect visible bounds with the layout safe edge.
 * No document offsets, keyboard-height estimate, or open/closed threshold. */
export function accessoryTop(
  viewport: { offsetTop: number; height: number },
  height: number,
  bottomInset = 0,
  layoutHeight = Math.max(0, viewport.offsetTop) + Math.max(0, viewport.height),
) {
  const top = Math.max(0, viewport.offsetTop);
  const bottom = Math.min(
    top + Math.max(0, viewport.height),
    layoutHeight - Math.max(0, bottomInset),
  );
  return Math.max(top, bottom - height);
}
