import { useEffect, useRef } from 'react';
import { subscribeLevel } from '../../lib/voice-level';

export type OrbState = 'idle' | 'connecting' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

const STATUS: Record<OrbState, string> = {
  idle: 'Standing by',
  connecting: 'Connecting',
  listening: 'Listening',
  transcribing: 'Processing speech',
  thinking: 'Analysing',
  speaking: 'Speaking',
};

const TICKS = Array.from({ length: 48 }, (_, i) => i);
const BARS = Array.from({ length: 16 }, (_, i) => i);

/**
 * Animated voice indicator for Talk mode: a glowing core inside rotating
 * rings. Each state has its own motion so the user can tell at a glance
 * whether Jarvis is listening, thinking or speaking.
 */
export function VoiceOrb({
  state,
  size = 150,
  hearing = false,
}: {
  state: OrbState;
  size?: number;
  /** The user's voice is being picked up right now. */
  hearing?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Follow the loudness of whoever is talking, without re-rendering.
  useEffect(
    () =>
      subscribeLevel((level) => {
        ref.current?.style.setProperty('--voice-level', level.toFixed(3));
      }),
    [],
  );

  return (
    <div
      ref={ref}
      className="voice-orb-wrap"
      data-state={state}
      data-hearing={hearing}
      role="status"
      aria-live="polite"
    >
      <div className="voice-orb" style={{ width: size, height: size }}>
        <span className="voice-orb-ripple" />
        <span className="voice-orb-ripple voice-orb-ripple--late" />
        <svg viewBox="0 0 200 200" className="voice-orb-svg" aria-hidden="true">
          <g className="voice-orb-ring voice-orb-ring--outer">
            <circle cx="100" cy="100" r="94" fill="none" strokeWidth="1" strokeDasharray="14 8" />
          </g>
          <g className="voice-orb-ring voice-orb-ring--ticks">
            {TICKS.map((i) => (
              <line
                key={i}
                x1="100"
                y1="14"
                x2="100"
                y2={i % 4 === 0 ? 24 : 19}
                strokeWidth={i % 4 === 0 ? 1.6 : 0.8}
                transform={`rotate(${(i * 360) / TICKS.length} 100 100)`}
              />
            ))}
          </g>
          <g className="voice-orb-ring voice-orb-ring--arc">
            <circle
              cx="100"
              cy="100"
              r="74"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="90 375"
            />
          </g>
          <g className="voice-orb-bars">
            {BARS.map((i) => (
              <g key={i} transform={`rotate(${(i * 360) / BARS.length} 100 100)`}>
                <rect
                  x="98.5"
                  y="38"
                  width="3"
                  height="14"
                  rx="1.5"
                  style={{ animationDelay: `${(i % 5) * 0.11}s` }}
                />
              </g>
            ))}
          </g>
          <circle cx="100" cy="100" r="56" fill="none" strokeWidth="1" className="voice-orb-inner" />
        </svg>
        <span className="voice-orb-core" />
      </div>
      <div className="voice-orb-status">{STATUS[state]}</div>
    </div>
  );
}
