/**
 * The 18+ confirmation. The stored flag is versioned: raise the version when
 * what the user agrees to changes, and everyone is asked again.
 */
export const AGE_GATE_KEY = 'openjarvis-age-gate';
export const AGE_GATE_VERSION = 1;

export function loadAdultConfirmation(): boolean {
  try {
    const raw = localStorage.getItem(AGE_GATE_KEY);
    if (!raw) return false;
    const flag = JSON.parse(raw);
    return flag?.version === AGE_GATE_VERSION && flag.adult === true;
  } catch {
    return false;
  }
}

export function saveAdultConfirmation(confirmed: boolean): void {
  try {
    localStorage.setItem(
      AGE_GATE_KEY,
      JSON.stringify({ version: AGE_GATE_VERSION, adult: confirmed }),
    );
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}
