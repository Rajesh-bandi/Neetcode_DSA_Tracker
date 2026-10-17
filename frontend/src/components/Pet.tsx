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
  const smiling = happy || mood === 'waiting';

  return (
    <svg className={`pet pet--${mood}`} viewBox="0 0 220 182" role="img" aria-label={`Gruv, the study cat, ${mood}`}>
      {/* the surface he sits on */}
      <ellipse className="pet__shadow" cx="110" cy="164" rx="58" ry="7" />
      <line className="pet__shelf" x1="30" y1="164" x2="190" y2="164" />

      {/* tail, curling behind the body */}
      <path
        className="pet__tail"
        d={droopy ? 'M150 150 C 178 156, 194 142, 184 128' : 'M150 148 C 182 154, 200 130, 186 108'}
      />

      <g className="pet__body">
        {/* ears, behind the head */}
        <path className="pet__fur" d="M82 66 C 77 51, 73 37, 71 26 C 83 32, 96 42, 104 51 Z" />
        <path className="pet__fur" d="M138 66 C 143 51, 147 37, 149 26 C 137 32, 124 42, 116 51 Z" />
        <path className="pet__ear" d="M82 59 C 79 49, 77 41, 75.5 34 C 83 40, 90 46, 96 51 Z" />
        <path className="pet__ear" d="M138 59 C 141 49, 143 41, 144.5 34 C 137 40, 130 46, 124 51 Z" />

        {/* body: a soft pear, wider at the base */}
        <path
          className="pet__fur"
          d="M110 72 C 88 72, 72 96, 72 123 C 72 146, 88 158, 110 158 C 132 158, 148 146, 148 123 C 148 96, 132 72, 110 72 Z"
        />
        <ellipse className="pet__chest" cx="110" cy="136" rx="25" ry="19" />

        {/* front paws, tucked together */}
        <ellipse className="pet__paw" cx="98" cy="156" rx="11.5" ry="6.5" />
        <ellipse className="pet__paw" cx="122" cy="156" rx="11.5" ry="6.5" />

        {/* head */}
        <ellipse className="pet__fur" cx="110" cy="92" rx="41" ry="37" />

        {/* muzzle patch and cheeks */}
        <ellipse className="pet__face" cx="110" cy="104" rx="25" ry="18" />

        {/* faint brow stripes */}
        <g className="pet__stripes" aria-hidden="true">
          <path className="pet__stripe" d="M101 63 q5 -6 10 0" />
          <path className="pet__stripe" d="M113 61 q5 -6 10 0" />
        </g>

        <g className="pet__eyes">
          {eyesClosed ? (
            <>
              <path className="pet__lid" d="M87 94 q8 7 16 0" />
              <path className="pet__lid" d="M117 94 q8 7 16 0" />
            </>
          ) : happy ? (
            <>
              <path className="pet__lid" d="M87 96 q8 -12 16 0" />
              <path className="pet__lid" d="M117 96 q8 -12 16 0" />
            </>
          ) : (
            <>
              <circle className="pet__pupil" cx="96" cy="93" r="5.4" />
              <circle className="pet__pupil" cx="124" cy="93" r="5.4" />
              <circle className="pet__glint" cx="97.8" cy="91.2" r="1.7" />
              <circle className="pet__glint" cx="125.8" cy="91.2" r="1.7" />
            </>
          )}
        </g>

        {/* nose and mouth */}
        <path className="pet__nose" d="M106.4 101 h7.2 l-3.6 3.6 z" />
        <path className="pet__mouth" d={smiling ? 'M103 109 q7 6 14 0' : droopy ? 'M103 111 q7 -5 14 0' : 'M103 110 q7 2 14 0'} />

        <g className="pet__whiskers">
          <path d="M84 101 q-14 -3 -22 -6" />
          <path d="M84 107 q-14 0 -23 2" />
          <path d="M84 113 q-13 3 -21 7" />
          <path d="M136 101 q14 -3 22 -6" />
          <path d="M136 107 q14 0 23 2" />
          <path d="M136 113 q13 3 21 7" />
        </g>

        {happy && (
          <g className="pet__blush">
            <ellipse cx="82" cy="106" rx="7" ry="4" />
            <ellipse cx="138" cy="106" rx="7" ry="4" />
          </g>
        )}
      </g>

      {/* bowl: one dot per problem logged today, up to three */}
      <g className="pet__bowl">
        <path className="pet__dish" d="M172 149 h30 l-5 11 h-20 z" />
        {Array.from({ length: Math.min(fed, 3) }, (_, i) => (
          <circle key={i} className="pet__kibble" cx={178 + i * 9} cy={147 - i * 4} r={3.2} />
        ))}
      </g>

      {/* crumbs that rise while the streak is fed — the same squares as the wall */}
      {mood === 'radiant' && (
        <g className="pet__motes" aria-hidden="true">
          <rect x="48" y="84" width="7" height="7" className="pet__mote" />
          <rect x="38" y="112" width="6" height="6" className="pet__mote" />
          <rect x="170" y="68" width="6" height="6" className="pet__mote" />
        </g>
      )}

      {mood === 'asleep' && (
        <g className="pet__zzz" aria-hidden="true">
          <text x="152" y="74">z</text>
          <text x="164" y="58">z</text>
        </g>
      )}
    </svg>
  );
}
