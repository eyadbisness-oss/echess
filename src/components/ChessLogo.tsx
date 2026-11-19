export function ChessLogo({ size = 32, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="2" y="2" width="36" height="36" rx="9" fill="#131922" stroke="#10B981" strokeWidth="1.5" />
        <path
          d="M13 30H27V27.5H13V30ZM14.5 25.5H25.5L24.5 21.5C26 19.8 27 17.6 27 15.2C27 11.5 24 8.5 20.5 8.5L19.5 6.5L17.5 8.8C15.1 9.5 13 11.7 12.2 14.5L15.6 16L17.2 14.2C18.3 13.7 19.6 13.9 20.3 14.6C18.8 16.5 16.5 18.2 15.2 21.5L14.5 25.5Z"
          fill="#10B981"
        />
        <circle cx="17" cy="12" r="1.1" fill="#0B0E11" />
      </svg>
      {showWordmark && (
        <span className="font-display text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap">
          e<span className="text-emerald-400">chess</span>
        </span>
      )}
    </div>
  );
}
