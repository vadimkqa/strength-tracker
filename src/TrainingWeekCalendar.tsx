import type { TrainingDay } from './streak';
export function TrainingWeekCalendar({ days }: { days: TrainingDay[] }) {
  return (
    <ol className="training-week-calendar" aria-label="Monday to Sunday training calendar">
      {days.map((day) => {
        const status = day.complete
          ? day.scheduled === null
            ? 'Completed training day'
            : day.scheduled
              ? 'Completed'
              : 'Completed on a rest day (make-up)'
          : day.state === 'missed'
            ? 'Missed planned day; make-ups allowed'
            : day.state === 'scheduled'
              ? 'Scheduled, not yet completed'
              : day.state === 'rest'
                ? 'Rest day'
                : 'Weekday not configured';
        return (
          <li
            key={day.date}
            className={`training-calendar-day ${day.state} ${day.today ? 'today' : ''}`}
            aria-current={day.today ? 'date' : undefined}
            aria-label={`${day.weekday} ${day.date}: ${status}`}
          >
            <span className="training-calendar-weekday">{day.weekday.slice(0, 3)}</span>
            <span className="training-calendar-date">{Number(day.date.slice(-2))}</span>
            <span className="training-calendar-symbol" aria-hidden="true">
              {day.complete
                ? '✓'
                : day.state === 'missed'
                  ? '!'
                  : day.state === 'rest'
                    ? '–'
                    : day.state === 'unspecified'
                      ? '?'
                      : ''}
            </span>
            <span className="training-calendar-state" aria-hidden="true">
              {day.complete
                ? 'Done'
                : day.state === 'missed'
                  ? 'Missed'
                  : day.state === 'rest'
                    ? 'Rest'
                    : day.state === 'unspecified'
                      ? 'Set up'
                      : 'Plan'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
