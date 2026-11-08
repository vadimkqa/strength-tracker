import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
const basic = readFileSync('tests/fixtures/basic_gym_workout_plan.txt');
async function settings(page: Page) {
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}
async function file(page: Page, name: string, buffer: Buffer) {
  await page
    .locator('#plan-file')
    .setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(page.getByText(`Loaded: ${name}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('strength-tracker-v2');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const r = db.transaction('state').objectStore('state').get('current');
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
function docx() {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        xml +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        xml +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/document.xml': strToU8(
        xml +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          ['Program: Office plan', 'Workout A', 'Squat 3x5 rest 90s']
            .map((t) => '<w:p><w:r><w:t>' + t + '</w:t></w:r></w:p>')
            .join('') +
          '</w:body></w:document>',
      ),
    }),
  );
}
function xlsx() {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  const rows = [
    ['Workout', 'Exercise', 'Sets', 'Reps', 'Rest seconds'],
    ['Upper', 'Bench Press', '3', '8', '90'],
    ['Lower', 'Squat', '4', '5', '120'],
  ];
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        xml +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        xml +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
      'xl/workbook.xml': strToU8(
        xml +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Training" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        xml +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        xml +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          rows
            .map(
              (r, i) =>
                '<row r="' +
                (i + 1) +
                '">' +
                r
                  .map(
                    (c, j) =>
                      '<c r="' +
                      String.fromCharCode(65 + j) +
                      (i + 1) +
                      '" t="inlineStr"><is><t>' +
                      c +
                      '</t></is></c>',
                  )
                  .join('') +
                '</row>',
            )
            .join('') +
          '</sheetData></worksheet>',
      ),
    }),
  );
}
function pdf(imageOnly = false) {
  const lines = imageOnly ? [] : ['Program: PDF plan', 'Workout A', 'Squat 3x5 rest 90s'];
  const stream =
    'BT /F1 12 Tf 50 780 Td ' +
    lines.map((s, i) => (i ? '0 -24 Td ' : '') + '(' + s + ') Tj').join('\n') +
    ' ET';
  const objects = [
    '<</Type /Catalog /Pages 2 0 R>>',
    '<</Type /Pages /Kids [3 0 R] /Count 1>>',
    '<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>>',
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
  ];
  let content = '%PDF-1.4\n',
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(content.length);
    content += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = content.length;
  content +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}
test('uploaded five-day plan is reviewed explicitly, preserves source cutoff, and creates five chronological cards', async ({
  page,
}) => {
  await settings(page);
  const before = await state(page);
  await file(page, 'basic_gym_workout_plan.txt', basic);
  const preview = page.getByLabel('Editable program preview', { exact: true });
  await expect(preview).toContainText('5 sessions · 29 exercises');
  await expect(preview).toContainText('cut off');
  await expect(
    page.getByRole('button', { name: 'Apply imported program', exact: true }),
  ).toBeDisabled();
  expect(await state(page)).toEqual(before);
  for (const workout of [
    'Chest + Triceps',
    'Back + Biceps',
    'Legs',
    'Shoulders + Abs',
    'Chest + Back',
  ]) {
    await preview
      .getByRole('combobox', { name: 'WORKOUT', exact: true })
      .selectOption({ label: workout });
    for (const row of await preview.locator('.review-exercise').all()) {
      await row.locator('summary').first().click();
      await row.getByRole('checkbox').first().check();
    }
  }
  await preview
    .getByRole('checkbox', {
      name: 'I reviewed this section; keep unsupported content as source notes only',
      exact: true,
    })
    .check();
  await preview
    .getByRole('checkbox', {
      name: 'I confirm saving this independent program and making it active; preserve existing programs, history and unspecified values',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Apply imported program', exact: true }).click();
  await expect(preview.getByRole('status').filter({ hasText: 'Plan applied.' })).toBeVisible();
  const after = await state(page);
  expect(after.history).toEqual(before.history);
  expect(after.active).toEqual(before.active);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.pagination button')).toHaveCount(5);
  expect(await page.locator('.stack-card-top span:first-child').allTextContents()).toEqual([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
  ]);
  await page.screenshot({ path: 'test-results/universal-five-day-home.png', fullPage: true });
  await page.getByRole('button', { name: 'Select Legs', exact: true }).click();
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Legs', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leg Press', exact: true })).toBeVisible();
  await expect(page.getByLabel('Weight Leg Press set 1', { exact: true })).toHaveValue('');
});
test('pasted A/B program edits and source review are local; cancel changes no data', async ({
  page,
}) => {
  await settings(page);
  const before = await state(page);
  await page.getByText('Source text and workout aliases', { exact: true }).click();
  await page
    .locator('#plan-source')
    .fill('Program: Alternating\nWorkout A\n- Squat 3x5 rest 90s\nWorkout B\n- Row 3x10 rest 60s');
  await page.getByRole('button', { name: 'Parse TXT', exact: true }).click();
  const preview = page.getByLabel('Editable program preview', { exact: true });
  await expect(preview).toContainText('2 sessions · 2 exercises');
  await preview.locator('.review-exercise > summary').first().click();
  await preview.getByText('Edit exercise details', { exact: true }).click();
  await preview.getByLabel('EXERCISE NAME', { exact: true }).fill('Front Squat');
  await preview.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  expect(await state(page)).toEqual(before);
});
for (const [name, buffer, count] of [
  ['office.docx', docx(), 1],
  ['table.xlsx', xlsx(), 2],
  ['plan.pdf', pdf(), 1],
  [
    'table.csv',
    Buffer.from(
      'Workout,Exercise,Sets,Reps,Rest seconds\nPush,Bench Press,3,8,90\nPull,Row,3,10,60\nLegs,Squat,4,6,120',
    ),
    3,
  ],
] as const) {
  test(`${name} extracts and parses entirely in the browser`, async ({ page }) => {
    await settings(page);
    await file(page, name, buffer);
    const preview = page.getByLabel('Editable program preview', { exact: true });
    await expect(preview).toContainText(`${count} sessions`);
    await expect(preview.locator('.review-exercise')).toHaveCount(1);
    await page.screenshot({ path: `test-results/import-${name}.png`, fullPage: true });
  });
}
test('image-only PDF and corrupt documents report extraction failure without modifying data', async ({
  page,
}) => {
  await settings(page);
  const before = await state(page);
  await page
    .locator('#plan-file')
    .setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf(true) });
  await expect(page.getByRole('alert')).toContainText('No extractable text');
  expect(await state(page)).toEqual(before);
  await page.locator('#plan-file').setInputFiles({
    name: 'corrupt.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('bad zip'),
  });
  await expect(page.getByRole('alert')).toContainText('File not loaded');
  expect(await state(page)).toEqual(before);
});
test('PDF and spreadsheet extraction remain available offline after PWA installation', async ({
  page,
  context,
}) => {
  await page.goto('/strength-tracker/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await file(page, 'offline.pdf', pdf());
  await expect(page.getByLabel('Editable program preview', { exact: true })).toContainText(
    '1 sessions',
  );
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  await file(page, 'offline.xlsx', xlsx());
  await expect(page.getByLabel('Editable program preview', { exact: true })).toContainText(
    '2 sessions',
  );
});
test('variable-length rotations navigate one, two and three-card weeks, preserve selected templates and survive reload', async ({
  page,
}) => {
  const { parseProgram } = await import('../src/importing/parser');
  const { textDocument } = await import('../src/importing/extraction');
  const { programIssues } = await import('../src/importing/model');
  const { applyProgram } = await import('../src/importing/saving');
  const { emptyData } = await import('../src/data');
  const p = parseProgram(
    textDocument(
      'Program: Variable cycle\nWeek 1\nWorkout A\n- Squat 3x5 rest 90s\nWorkout B\n- Press 3x8 rest 90s\nWeek 2\nWorkout C\n- Row 3x10 rest 60s\nWeek 3\nWorkout D\n- Lunge 3x12 rest 60s\nWorkout E\n- Curl 2x12 rest 60s\nWorkout F\n- Fly 2x15 rest 60s',
    ),
  );
  programIssues(p).forEach((i) => (i.reviewed = true));
  const d = applyProgram(emptyData(), p, true);
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
  const week = page.getByLabel('TRAINING ROTATION', { exact: true }),
    front = page.locator('.stack-front'),
    region = page.getByRole('region', { name: 'Workout selection', exact: true });
  await expect(page.locator('.pagination button')).toHaveCount(2);
  await region.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const side = (await page.locator('.stack-next').boundingBox())!;
  await page.touchscreen.tap(Math.min(386, side.x + side.width - 8), side.y + side.height * 0.25);
  await expect(front).toHaveAttribute('aria-label', 'Workout B');
  await expect(week).toHaveValue('1');
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect(front).toHaveAttribute('aria-label', 'Workout C');
  await expect(week).toHaveValue('2');
  await expect(page.locator('.pagination button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Selected Workout C', exact: true }).click();
  await expect(week).toHaveValue('2');
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect(front).toHaveAttribute('aria-label', 'Workout D');
  await expect(week).toHaveValue('3');
  await expect(page.locator('.pagination button')).toHaveCount(3);
  await page.keyboard.press('ArrowLeft');
  await expect(front).toHaveAttribute('aria-label', 'Workout C');
  await expect(week).toHaveValue('2');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  await expect(page.getByRole('heading', { name: 'Workout C', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Row', exact: true })).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Row', exact: true })).toBeVisible();
});
