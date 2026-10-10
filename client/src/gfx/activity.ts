import { mix } from './paint';
import type { Compound } from '../world/types';

// pIC50 -> crystal colour. Weak = ember red, potent = bright teal.
const STOPS: [number, number][] = [
  [5.0, 0xd9534f],
  [6.0, 0xf0a030],
  [7.0, 0xf2d34a],
  [8.0, 0x5ee08a],
  [8.7, 0x5cf2e6],
];
export const UNTESTED = 0x9aa0aa;

export function potencyColour(p: number): number {
  if (p <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    if (p <= p1) {
      const [p0, c0] = STOPS[i - 1];
      return mix(c0, c1, (p - p0) / (p1 - p0));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function potencyCss(p: number): string {
  return `#${potencyColour(p).toString(16).padStart(6, '0')}`;
}

/** Measured pIC50, or null when the compound has not been tested. */
export function measured(c: Compound): number | null {
  const v = c.activity?.pIC50;
  return typeof v === 'number' ? v : null;
}

/** CSS gradient matching the crystal ramp, for legends. */
export const POTENCY_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([, c]) => `#${c.toString(16).padStart(6, '0')}`).join(', ')})`;
