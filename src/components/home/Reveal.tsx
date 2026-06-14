'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  /** Stagger offset in seconds. */
  delay?: number;
  /** Initial vertical offset in px (0 = fade only, keeps CSS hover transforms intact). */
  y?: number;
  as?: 'div' | 'article' | 'figure' | 'li';
};

/**
 * Reveals its children with a single fade(+rise) the first time they scroll
 * into view. Honors prefers-reduced-motion (renders static, no animation).
 */
export default function Reveal({ children, className, delay = 0, y = 18, as = 'div' }: Props) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as];

  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  );
}
