import { programView, type SavedProgram } from './programs';
import { weekdayNumber } from './calendar';
export function scheduleMetadata(p: SavedProgram) {
  const view = programView(p);
  const weeks = view.rotation?.weeks.length
    ? [...new Set(view.rotation.weeks)]
    : [...new Set(view.workouts.map((w) => w.week))].sort((a, b) => a - b);
  const cycles = weeks.map((week) => {
    const sessions: {
      key: string;
      name: string;
      templateIds: string[];
      day: number | null;
      slotId: string;
      intensity: string | null;
    }[] = [];
    for (const w of view.workouts
      .filter((w) => w.week === week)
      .sort((a, b) => a.order - b.order)) {
      const variants = ['built-in', 'legacy-txt'].includes(view.source.format);
      const day = p.calendar?.days[w.id] ?? weekdayNumber(w.day);
      const key = variants ? `${w.day || ''}:${w.slotId}` : w.id;
      const found = sessions.find((s) => s.key === key);
      if (found) found.templateIds.push(w.id);
      else
        sessions.push({
          key,
          name: `${w.day ? `${w.day} · ` : ''}${w.name}`,
          templateIds: [w.id],
          day,
          slotId: w.slotId,
          intensity: w.intensity,
        });
    }
    return { week, sessions };
  });
  const explicitTextWeek = /^\s*week\s+\d+\b/im.test(view.source.text);
  const sourceRows = view.source.text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((c) => c.trim()));
  const tableWeek =
    ['csv', 'xlsx', 'docx'].includes(view.source.format) &&
    sourceRows.some((row, index) => {
      const normalized = row.map((c) => c.toLowerCase().replace(/[^a-z]/g, '')),
        column = normalized.indexOf('week');
      return (
        column >= 0 &&
        normalized.some((c) => ['exercise', 'exercisename', 'movement'].includes(c)) &&
        normalized.some((c) => ['workout', 'session', 'workoutname'].includes(c)) &&
        sourceRows
          .slice(index + 1)
          .some((r) => /^\d+$/.test(r[column] || '') && weeks.includes(Number(r[column])))
      );
    });
  const hasWeekdays =
    cycles.length > 0 &&
    cycles.every((c) => c.sessions.length > 0 && c.sessions.every((s) => s.day !== null));
  return {
    cycles,
    hasWeekdays,
    explicitWeeks: view.rotation !== null || explicitTextWeek || tableWeek,
    weekly:
      view.workouts.length > 0 &&
      (hasWeekdays || view.rotation !== null || explicitTextWeek || tableWeek),
  };
}
