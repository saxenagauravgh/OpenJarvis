import { useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';

export const FREE_TIER_NOTICE =
  "On Google's free tier, what you type or upload may be used by Google and read by human reviewers. Don't send personal or sensitive information.";

export function AgeGateView({
  blocked,
  onAnswer,
}: {
  blocked: boolean;
  onAnswer: (isAdult: boolean) => void;
}) {
  const Icon = blocked ? ShieldX : ShieldCheck;
  return (
    <div
      className="fixed inset-0 flex overflow-y-auto"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        className="w-full max-w-md m-auto p-6 rounded-2xl text-center"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
        >
          <Icon size={28} />
        </div>
        <h1
          id="age-gate-title"
          className="text-xl font-semibold mb-2"
          style={{ color: 'var(--color-text)' }}
        >
          {blocked ? 'This app is for adults only' : 'Adults only (18+)'}
        </h1>
        {blocked ? (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            You must be 18 or older to use it. Please close the app.
          </p>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              A JEE Physics, Chemistry and Maths tutor for adults: JEE repeaters, adult
              learners, and teachers or tutors preparing Class 10–12 material.
            </p>
            <p
              className="text-sm text-left rounded-xl px-4 py-3 mb-5"
              style={{
                color: 'var(--color-text)',
                background: 'var(--color-accent-subtle)',
                border: '1px solid var(--color-border)',
              }}
            >
              {FREE_TIER_NOTICE}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onAnswer(true)}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
              >
                Yes, I am 18 or older
              </button>
              <button
                type="button"
                onClick={() => onAnswer(false)}
                className="w-full px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                style={{
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                No
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Shown before anything else until the user confirms they are an adult.
 * "No" blocks the app until it is relaunched.
 */
export function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  const [blocked, setBlocked] = useState(false);
  return (
    <AgeGateView
      blocked={blocked}
      onAnswer={(isAdult) => (isAdult ? onConfirm() : setBlocked(true))}
    />
  );
}
