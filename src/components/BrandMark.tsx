interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="cliniqo-mark-grad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#cliniqo-mark-grad)" />
        <rect
          x="1.5"
          y="1.5"
          width="29"
          height="29"
          rx="8.5"
          stroke="white"
          strokeOpacity="0.45"
        />
        <path
          d="M16 8.5V23.5M8.5 16H23.5"
          stroke="white"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight text-[#0B192C]">
        Cliniqo
      </span>
    </span>
  );
}
