/** Modern Pages stores paragraph text in TSWP.StorageArchive (type 2001, field 3).
 * Read those typed records, never arbitrary printable strings from the archive.
 * IWA uses raw Snappy frames (not the standard Snappy stream wrapper).
 */
const LIMIT = 32_000_000;
function invalid(): never {
  throw Error('Cannot read this Pages document safely. Export it as DOCX or TXT and try again.');
}
function uint(bytes: Uint8Array, cursor: { pos: number }): number {
  let value = 0,
    factor = 1;
  for (let n = 0; n < 8; n++) {
    if (cursor.pos >= bytes.length) invalid();
    const b = bytes[cursor.pos++];
    value += (b & 127) * factor;
    if (!Number.isSafeInteger(value)) invalid();
    if (b < 128) return value;
    factor *= 128;
  }
  return invalid();
}
function slice(bytes: Uint8Array, cursor: { pos: number }, size: number) {
  if (size < 0 || cursor.pos + size > bytes.length) invalid();
  const part = bytes.subarray(cursor.pos, cursor.pos + size);
  cursor.pos += size;
  return part;
}
function snappy(bytes: Uint8Array): Uint8Array {
  const cursor = { pos: 0 },
    size = uint(bytes, cursor);
  if (size > LIMIT) invalid();
  const out = new Uint8Array(size);
  let pos = 0;
  const little = (n: number) => slice(bytes, cursor, n).reduce((v, b, i) => v + b * 256 ** i, 0);
  while (cursor.pos < bytes.length) {
    const tag = bytes[cursor.pos++],
      type = tag & 3;
    if (type === 0) {
      const code = tag >>> 2,
        length = code < 60 ? code + 1 : little(code - 59) + 1;
      if (pos + length > size) invalid();
      out.set(slice(bytes, cursor, length), pos);
      pos += length;
    } else {
      const length = type === 1 ? 4 + ((tag >>> 2) & 7) : 1 + (tag >>> 2);
      const offset = type === 1 ? ((tag & 224) << 3) + little(1) : little(type === 2 ? 2 : 4);
      if (!offset || offset > pos || pos + length > size) invalid();
      for (let i = 0; i < length; i++, pos++) out[pos] = out[pos - offset];
    }
  }
  if (pos !== size) invalid();
  return out;
}
interface Field {
  number: number;
  value: number | Uint8Array;
}
function fields(bytes: Uint8Array): Field[] {
  const cursor = { pos: 0 },
    result: Field[] = [];
  while (cursor.pos < bytes.length) {
    const key = uint(bytes, cursor),
      wire = key & 7,
      number = Math.floor(key / 8);
    if (!number) invalid();
    if (wire === 0) result.push({ number, value: uint(bytes, cursor) });
    else if (wire === 2) result.push({ number, value: slice(bytes, cursor, uint(bytes, cursor)) });
    else if (wire === 1 || wire === 5) slice(bytes, cursor, wire === 1 ? 8 : 4);
    else invalid();
  }
  return result;
}
export function pagesText(files: Record<string, Uint8Array>): { text: string; warnings: string[] } {
  const texts: string[] = [];
  let expanded = 0;
  for (const [name, bytes] of Object.entries(files)) {
    if (!/^Index\/.*\.iwa$/.test(name)) continue;
    const cursor = { pos: 0 },
      chunks: Uint8Array[] = [];
    while (cursor.pos < bytes.length) {
      const header = slice(bytes, cursor, 4);
      if (header[0] !== 0) invalid();
      const size = header[1] + header[2] * 256 + header[3] * 65536;
      const chunk = snappy(slice(bytes, cursor, size));
      expanded += chunk.length;
      if (expanded > LIMIT) invalid();
      chunks.push(chunk);
    }
    const raw = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }
    const record = { pos: 0 };
    while (record.pos < raw.length) {
      const header = fields(slice(raw, record, uint(raw, record)));
      for (const message of header.filter((f) => f.number === 2)) {
        if (!(message.value instanceof Uint8Array)) invalid();
        const info = fields(message.value),
          type = info.find((f) => f.number === 1)?.value;
        const length = info.find((f) => f.number === 3)?.value;
        if (typeof length !== 'number') invalid();
        const body = slice(raw, record, length);
        if (type !== 2001) continue;
        for (const field of fields(body).filter((f) => f.number === 3)) {
          if (!(field.value instanceof Uint8Array)) invalid();
          const text = new TextDecoder('utf-8', { fatal: true }).decode(field.value);
          if (text.trim()) texts.push(text);
        }
      }
    }
  }
  if (!texts.length) invalid();
  return {
    text: texts.join('\n\n'),
    warnings:
      texts.length > 1
        ? [
            'Pages contains multiple text flows. Verify their reading order against the original document.',
          ]
        : [],
  };
}
