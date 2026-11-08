export interface DocumentBlock {
  text?: string;
  rows?: string[][];
  page?: number;
  sheet?: string;
}
export interface ExtractedDocument {
  name: string;
  format: string;
  text: string;
  blocks: DocumentBlock[];
  warnings: string[];
}
export function textDocument(text: string, name = 'Pasted plan'): ExtractedDocument {
  return { name, format: 'txt', text, blocks: [{ text }], warnings: [] };
}
function finalize(
  name: string,
  format: string,
  blocks: DocumentBlock[],
  warnings: string[],
): ExtractedDocument {
  const text = blocks
    .map((b) => b.text ?? b.rows?.map((r) => r.join('\t')).join('\n') ?? '')
    .join('\n');
  if (!text.trim())
    throw Error(
      'No extractable text found. Scanned/image-only documents need text or OCR outside this importer.',
    );
  if (text.length > 2_000_000 || text.split('\n').length > 10000)
    throw Error('Extracted document exceeds 2 MB / 10,000 lines. Import a smaller section.');
  return { name, format, text, blocks, warnings };
}
export async function parseCSV(text: string): Promise<string[][]> {
  const { default: Papa } = await import('papaparse');
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  if (result.errors.some((e) => e.code !== 'UndetectableDelimiter'))
    throw Error('Malformed CSV: ' + result.errors.map((e) => e.message).join(' '));
  return result.data;
}
async function checkZip(bytes: Uint8Array) {
  const { unzipSync } = await import('fflate');
  let size = 0,
    count = 0;
  // Filter is run before decompression; reject expanded-size bombs and excessive file counts.
  unzipSync(bytes, {
    filter: (f) => {
      size += f.originalSize;
      if (++count > 2000 || size > 32_000_000)
        throw Error('Document archive is too large after extraction.');
      return false;
    },
  });
}
export async function extractDocument(file: File): Promise<ExtractedDocument> {
  if (file.size > 10_000_000) throw Error('Import a file smaller than 10 MB.');
  const format = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['txt', 'pdf', 'docx', 'csv', 'xlsx'].includes(format))
    throw Error('Choose TXT, PDF, DOCX, CSV or XLSX.');
  const buffer = await file.arrayBuffer(),
    bytes = new Uint8Array(buffer);
  if (format === 'txt' || format === 'csv') {
    const encoding =
      bytes[0] === 255 && bytes[1] === 254
        ? 'utf-16le'
        : bytes[0] === 254 && bytes[1] === 255
          ? 'utf-16be'
          : 'utf-8';
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw Error('File contains binary data rather than text.');
    return finalize(
      file.name,
      format,
      format === 'csv' ? [{ rows: await parseCSV(text) }] : [{ text }],
      [],
    );
  }
  if (format === 'docx') {
    await checkZip(bytes);
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      { externalFileAccess: false },
    );
    // Parse inertly and read text only. Imported HTML, links and images never enter the app DOM.
    const dom = new DOMParser().parseFromString(result.value, 'text/html');
    const blocks: DocumentBlock[] = [];
    for (const node of Array.from(dom.body.children)) {
      if (node.tagName === 'TABLE')
        blocks.push({
          rows: Array.from(node.querySelectorAll('tr')).map((r) =>
            Array.from(r.children).map((c) => c.textContent || ''),
          ),
        });
      else
        blocks.push({
          text:
            node.tagName === 'UL' || node.tagName === 'OL'
              ? Array.from(node.children)
                  .map((c) => '- ' + c.textContent)
                  .join('\n')
              : node.textContent || '',
        });
    }
    return finalize(
      file.name,
      format,
      blocks,
      result.messages.map((m) => m.message),
    );
  }
  if (format === 'xlsx') {
    await checkZip(bytes);
    const { default: read } = await import('read-excel-file/browser');
    const sheets = await read(file);
    const blocks: DocumentBlock[] = [];
    for (const { sheet, data: rows } of sheets) {
      blocks.push({ sheet, rows: rows.map((r) => r.map((c) => (c == null ? '' : String(c)))) });
    }
    return finalize(file.name, format, blocks, []);
  }
  const pdf = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdf.GlobalWorkerOptions.workerSrc = worker;
  const task = pdf.getDocument({ data: bytes, useSystemFonts: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > 100) throw Error('Import at most 100 PDF pages.');
    const blocks: DocumentBlock[] = [],
      warnings: string[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const items = content.items.filter(
        (i): i is typeof i & { str: string; transform: number[] } => 'str' in i,
      );
      const lines: { y: number; items: typeof items }[] = [];
      for (const item of items) {
        let line = lines.find((l) => Math.abs(l.y - item.transform[5]) < 3);
        if (!line) {
          line = { y: item.transform[5], items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }
      lines.sort((a, b) => b.y - a.y);
      const text = lines
        .map((l) =>
          l.items
            .sort((a, b) => a.transform[4] - b.transform[4])
            .map((i) => i.str)
            .join(' '),
        )
        .join('\n');
      if (!text.trim())
        warnings.push(
          `PDF page ${page} has no extractable text; image-only content was not imported.`,
        );
      blocks.push({ text, page });
    }
    warnings.push(
      'PDF layout and column reading order require review against the original document.',
    );
    return finalize(file.name, format, blocks, warnings);
  } finally {
    await task.destroy();
  }
}
