import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getModuleLessons } from '@/lib/lessons/catalog';
import type { Course, RouteLocale } from '@/lib/lessons/types';

type Props = { params: Promise<{ locale: string; course: string; moduleId: string }> };

export default async function ModuleLanding({ params }: Props) {
  const { locale, course, moduleId } = await params;
  if (course !== 'basic' && course !== 'advanced') notFound();
  const t = await getTranslations({ locale });
  const lessons = getModuleLessons(locale as RouteLocale, course as Course, moduleId);

  return (
    <div className="module-landing">
      <Link href={`/${locale}/learn/${course}`} className="btn-review">↩ {t(`learn.${course}Course`)}</Link>
      <div className="dash-callsign">{t('learn.title')}</div>
      <div className="dash-title">{t(`modules.${moduleId}`)}</div>
      {lessons.length === 0 ? (
        <div className="hud-panel coming-soon">{t('learn.comingSoon')}</div>
      ) : (
        <ul className="lesson-index">
          {lessons.map((l) => (
            <li key={l.lessonId}>
              <Link
                href={`/${locale}/learn/${course}/${moduleId}/${l.slug}`}
                className="hud-panel lesson-index-row"
              >
                <span className="lesson-index-title">{l.title}</span>
                <span className="lesson-index-min">{l.estMinutes} min ▶</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
