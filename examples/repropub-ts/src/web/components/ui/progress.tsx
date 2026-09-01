interface ProgressProps {
  readonly value: number;
  readonly label: string;
}

export function Progress({ value, label }: ProgressProps) {
  const bounded = Math.min(100, Math.max(0, value));
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded} aria-label={label}>
      <span className="progress__bar" style={{ transform: `scaleX(${bounded / 100})` }} />
    </div>
  );
}
