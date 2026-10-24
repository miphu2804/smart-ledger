import { useEffect, useRef, useState } from 'react';

const HALF_LIFE_MS = 80;
const MAX_FRAME_MS = 100;

export function nextRevealLength(shown: number, target: number, elapsedMs: number): number {
  if (shown >= target) return target;
  const share = 1 - 0.5 ** (Math.min(elapsedMs, MAX_FRAME_MS) / HALF_LIFE_MS);
  return Math.min(target, shown + Math.max(1, Math.ceil((target - shown) * share)));
}

export function useSmoothText(target: string): string {
  const [shown, setShown] = useState(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    setShown((current) => Math.min(current, target.length));
  }, [target]);

  useEffect(() => {
    let last = Date.now();
    let frame = requestAnimationFrame(function tick() {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      setShown((current) => nextRevealLength(current, targetRef.current.length, elapsed));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return target.slice(0, shown);
}
