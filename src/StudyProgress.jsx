import './StudyProgress.css';

import { INTERVAL_DAYS } from './studySchedule';

const BOX_LABELS = ['new', '1 day', '3 days', '7 days', '3 weeks'];

/**
 * Where the saved words sit across the Leitner boxes. The boxes are ordered, not
 * categories, so this is a sequential ramp in one hue — light to dark in the
 * light theme, dim to bright in the dark one, each stepped against its own
 * surface rather than flipped. Every step clears 3:1 against its background, and
 * the counts are written in ink beside the bars, so the colour is never the only
 * thing carrying the information.
 */
const StudyProgress = ({ counts, caption = true, note = true }) => {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return null;

  const most = Math.max(...counts);
  const settled = counts.slice(3).reduce((sum, count) => sum + count, 0);

  return (
    <figure className="progress">
      {caption && (
        <figcaption className="progress-caption">
          {settled > 0
            ? `${settled} of ${total} ${settled === 1 ? 'word is' : 'words are'} sticking`
            : `${total} ${total === 1 ? 'word' : 'words'} in rotation`}
        </figcaption>
      )}

      <ul className="progress-rows">
        {counts.map((count, index) => (
          <li key={BOX_LABELS[index]} className="progress-row">
            <span className="progress-label">{BOX_LABELS[index]}</span>
            <span className="progress-track">
              <span
                className={`progress-bar box-${index + 1}`}
                style={{ width: `${most ? Math.round((count / most) * 100) : 0}%` }}
              />
            </span>
            <span className="progress-count">{count}</span>
          </li>
        ))}
      </ul>

      {note && (
        <p className="progress-note">
          A word moves up a box each time you recall it, and comes back after{' '}
          {INTERVAL_DAYS.slice(1).join(', ')} days.
        </p>
      )}
    </figure>
  );
};

export default StudyProgress;
