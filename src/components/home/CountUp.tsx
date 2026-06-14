'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

/**
 * Counts a numeric value up from 0 the first time it scrolls into view.
 * Non-numeric values render verbatim. Honors prefers-reduced-motion.
 * Writes textContent directly (no per-frame React re-render).
 */
export default function CountUp({ value, className }: { value: string; className?: string }) {
  const target = parseInt(value, 10);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || Number.isNaN(target)) return;
    if (reduce || !inView) {
      node.textContent = String(target);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [inView, target, reduce]);

  // Non-numeric → render as-is; numeric → start at 0 (the effect animates it).
  const initial = Number.isNaN(target) ? value : '0';
  return (
    <span ref={ref} className={className}>
      {initial}
    </span>
  );
}
