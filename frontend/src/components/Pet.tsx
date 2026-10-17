export type Mood = 'radiant' | 'content' | 'waiting' | 'droopy' | 'asleep';

export const MOOD_COPY: Record<Mood, { line: string; tone: string }> = {
  radiant: { line: 'Purring. The streak is holding and today is already paid for.', tone: 'var(--aqua)' },
  content: { line: 'Settled in. One problem in today, and the run stays alive.', tone: 'var(--green)' },
  waiting: { line: 'Watching you. The streak is alive — one problem keeps it that way.', tone: 'var(--yellow)' },
  droopy: { line: 'A little droopy. Yesterday ended the run; today starts the next one.', tone: 'var(--orange)' },
  asleep: { line: 'Curled up. Solve a problem and he wakes up.', tone: 'var(--fg-mute)' },
};

/**
 * The companion: a sitting cat drawn from primitives so it stays in the
 * Gruvbox palette and reads as drawn rather than piped in from an icon set.
 * `fed` is how many problems were logged today.
 */
export function Pet({ mood, fed }: { mood: Mood; fed: number }) {
  const happy = mood === 'radiant' || mood === 'content';
  const eyesClosed = mood === 'asleep';
  const droopy = mood === 'droopy';

  return (
    <svg className={`pet pet--${mood}`} viewBox="0 0 220 182" role="img" aria-label={`Gruv, the study cat, ${mood}`}>
      {/* shelf */}
      <line className="pet__shelf" x1="14" y1="161" x2="206" y2="161" />

      {/* tail */}
      <path
        className="pet__tail"
        d={droopy ? 'M148 150 C 178 154, 190 132, 172 126' : 'M148 150 C 184 156, 198 118, 176 100'}
      />

      <g className="pet__body">
        {/* ears */}
        <path className="pet__fur" d="M86 68 L74 30 L106 52 Z" />
        <path className="pet__fur" d="M134 68 L146 30 L114 52 Z" />
        <path className="pet__ear" d="M87 63 L80 41 L100 54 Z" />
        <path className="pet__ear" d="M133 63 L140 41 L120 54 Z" />

        {/* body */}
        <path
          className="pet__fur"
          d="M110 54 C 82 54, 64 82, 64 112 C 64 140, 84 156, 110 156 C 136 156, 156 140, 156 112 C 156 82, 138 54, 110 54 Z"
        />
        {/* chest */}
        <ellipse className="pet__chest" cx="110" cy="132" rx="26" ry="22" />

        {/* face */}
        <ellipse className="pet__face" cx="110" cy="108" rx="31" ry="27" />

        <g className="pet__eyes">
          {eyesClosed ? (
            <>
              <path className="pet__lid" d="M92 108 q7 6 14 0" />
              <path className="pet__lid" d="M114 108 q7 6 14 0" />
            </>
          ) : happy ? (
            <>
              <path className="pet__lid" d="M92 110 q7 -9 14 0" />
              <path className="pet__lid" d="M114 110 q7 -9 14 0" />
            </>
          ) : (
            <>
              <circle className="pet__pupil" cx="99" cy="107" r="4.6" />
              <circle className="pet__pupil" cx="121" cy="107" r="4.6" />
              <circle className="pet__glint" cx="100.6" cy="105.4" r="1.5" />
              <circle className="pet__glint" cx="122.6" cy="105.4" r="1.5" />
            </>
          )}
        </g>

        {/* muzzle */}
        <path className="pet__nose" d="M110 114 l-3.4 3 h6.8 z" />
        <path className="pet__mouth" d={droopy || mood === 'waiting' ? 'M103 124 q7 -5 14 0' : 'M103 122 q7 6 14 0'} />
        <g className="pet__whiskers">
          <path d="M84 112 q-12 -3 -18 -6" />
          <path d="M84 119 q-12 1 -18 2" />
          <path d="M136 112 q12 -3 18 -6" />
          <path d="M136 119 q12 1 18 2" />
        </g>

        {happy && (
          <g className="pet__blush">
            <ellipse cx="86" cy="117" rx="7" ry="4" />
            <ellipse cx="134" cy="117" rx="7" ry="4" />
          </g>
        )}
      </g>

      {/* bowl: one dot per problem logged today, up to three */}
      <g className="pet__bowl">
        <path className="pet__dish" d="M170 150 h30 l-5 11 h-20 z" />
        {Array.from({ length: Math.min(fed, 3) }, (_, i) => (
          <circle key={i} className="pet__kibble" cx={176 + i * 9} cy={148 - i * 4} r={3.4} />
        ))}
      </g>

      {/* crumbs that rise while the streak is fed — the same squares as the wall */}
      {mood === 'radiant' && (
        <g className="pet__motes" aria-hidden="true">
          <rect x="52" y="86" width="7" height="7" className="pet__mote" />
          <rect x="40" y="110" width="6" height="6" className="pet__mote" />
          <rect x="168" y="70" width="6" height="6" className="pet__mote" />
        </g>
      )}

      {mood === 'asleep' && (
        <g className="pet__zzz" aria-hidden="true">
          <text x="150" y="74">z</text>
          <text x="162" y="58">z</text>
        </g>
      )}
    </svg>
  );
}
