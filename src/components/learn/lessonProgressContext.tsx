'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface Ctx {
  register: (id: string) => void;
  pass: (id: string) => void;
  allPassed: boolean;
}

const LessonCtx = createContext<Ctx | null>(null);

export function useLessonProgress(): Ctx {
  return useContext(LessonCtx) ?? { register: () => {}, pass: () => {}, allPassed: true };
}

export function LessonProgressProvider({ children }: { children: ReactNode }) {
  const [required, setRequired] = useState<Set<string>>(new Set());
  const [passed, setPassed] = useState<Set<string>>(new Set());

  const register = useCallback((id: string) => {
    setRequired((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);
  const pass = useCallback((id: string) => {
    setPassed((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

  const allPassed = [...required].every((id) => passed.has(id));
  return <LessonCtx.Provider value={{ register, pass, allPassed }}>{children}</LessonCtx.Provider>;
}
