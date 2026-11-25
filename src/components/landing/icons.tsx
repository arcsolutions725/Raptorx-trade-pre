/** Small inline icons repeated across the landing (same paths as the prototype). */

export function ArrowIcon({
  size,
  strokeWidth = 2.2,
  ariaHidden = true,
}: {
  size: number;
  strokeWidth?: number;
  ariaHidden?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The gold bolt inside `.mk-new` chips. */
export function BoltIcon({ size, ariaHidden = false }: { size: number; ariaHidden?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      <path
        d="M13.6 1.8 4.3 13.4c-.3.4 0 .9.5.9h5.6l-1.3 7.6c-.1.6.6.9 1 .5l9.4-11.7c.3-.4 0-.9-.5-.9h-5.6l1.2-7.5c.1-.6-.6-.9-1-.5Z"
        fill="#FFD15C"
      />
    </svg>
  );
}
