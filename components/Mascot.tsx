/**
 * Little pastel mascot used on the auth cards. Pure SVG + CSS (see .mascot in
 * globals.css): it bobs gently and blinks. Decorative only.
 */
export function Mascot({ className = "" }: { className?: string }) {
  return (
    <svg className={`mascot ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="mascot-g" cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#c7d2fe" />
          <stop offset=".55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#e879f9" />
        </radialGradient>
      </defs>
      <ellipse className="mascot-shadow" cx="32" cy="59" rx="15" ry="3" fill="#4f46e5" opacity=".18" />
      <g className="mascot-body">
        <circle cx="32" cy="32" r="24" fill="url(#mascot-g)" />
        <ellipse cx="23" cy="20" rx="7" ry="4" fill="#fff" opacity=".45" transform="rotate(-28 23 20)" />
        <ellipse className="mascot-eye" cx="24" cy="31" rx="2.8" ry="3.8" fill="#2b2358" />
        <ellipse className="mascot-eye" cx="40" cy="31" rx="2.8" ry="3.8" fill="#2b2358" />
        <ellipse cx="17.5" cy="38" rx="4.2" ry="2.6" fill="#fb7185" opacity=".5" />
        <ellipse cx="46.5" cy="38" rx="4.2" ry="2.6" fill="#fb7185" opacity=".5" />
        <path d="M27 38 Q32 44 37 38" fill="none" stroke="#2b2358" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
