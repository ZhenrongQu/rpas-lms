import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getModuleLessons } from '@/lib/lessons/catalog';
import type { Course, RouteLocale } from '@/lib/lessons/types';

interface Props {
  locale: string;
  course: Course;
  moduleId: string;
  currentSlug: string;
  completed: Set<string>;
}

export default async function LessonSidebar({ locale, course, moduleId, currentSlug, completed }: Props) {
  const t = await getTranslations({ locale });
  const lessons = getModuleLessons(locale as RouteLocale, course, moduleId);
  const done = lessons.filter((l) => completed.has(l.lessonId)).length;
  const pct = lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100);

  return (
    <aside className="sidebar learn-sidebar">
      <div className="sidebar-section">
        <div className="section-label">{t(`modules.${moduleId}`)}</div>
        <div className="tele-row">
          <span className="tele-label">{pct}% {t('learn.completeLabel')}</span>
          <span className="tele-value">{done}/{lessons.length}</span>
        </div>
        <div className="tele-bar"><div className="tele-bar-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="module-list">
        {lessons.map((l) => {
          const active = l.slug === currentSlug;
          const isDone = completed.has(l.lessonId);
          return (
            <Link
              key={l.lessonId}
              href={`/${locale}/learn/${course}/${moduleId}/${l.slug}`}
              className={`lesson-item${active ? ' active' : ''}`}
            >
              <span className={`lesson-check${isDone ? ' done' : ''}`}>{isDone ? '✓' : '○'}</span>
              <span className="lesson-title">{l.title}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
