"use client";

export function DraftButton({
  onClick,
  size = 22,
}: {
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      title="Draft this player"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full border border-rink-blue bg-surface text-rink-blue transition-colors hover:border-rink-blue-dark hover:bg-rink-blue hover:text-white active:scale-90"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" className="block" aria-hidden="true">
        <path
          d="M6 2v8M2 6h8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
