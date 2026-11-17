/** Fixed-layer coordinates: never mix document scroll offsets into visual viewport bounds. */
export function accessoryTop(
  viewport: { offsetTop: number; height: number },
  height: number,
  bottomInset = 0,
) {
  const top = Math.max(0, viewport.offsetTop);
  return Math.max(top, top + Math.max(0, viewport.height) - height - Math.max(0, bottomInset));
}
