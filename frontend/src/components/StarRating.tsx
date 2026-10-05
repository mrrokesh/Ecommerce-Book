export default function StarRating({
  value = 0,
  size = 'md',
  showValue = false,
}: {
  value?: number;
  size?: string;
  showValue?: boolean;
}) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.floor(rating);
  const half = rating - full >= 0.4 && rating - full < 0.9;
  const stars = [];

  for (let i = 1; i <= 5; i++) {
    let cls = 'star empty';
    if (i <= full) cls = 'star filled';
    else if (i === full + 1 && half) cls = 'star half';
    stars.push(
      <span key={i} className={cls} aria-hidden="true">
        ★
      </span>
    );
  }

  return (
    <span className={`star-rating star-${size}`} title={`${rating} out of 5`}>
      {stars}
      {showValue ? <span className="star-value">{rating.toFixed(1)}</span> : null}
    </span>
  );
}
