interface ProgressProps {
  value: number;
  max: number;
  label?: string;
}

/** Chunky progress bar with a "n/max" label. */
export function Progress({ value, max, label }: ProgressProps) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className={ratio >= 1 ? 'progress progress--done' : 'progress'}>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <div className="progress__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="progress__label">
        {value.toLocaleString()}/{max.toLocaleString()}
      </span>
    </div>
  );
}
