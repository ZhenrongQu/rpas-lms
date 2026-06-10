import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCourseModules, getModuleLessonCount } from '@/lib/lessons/catalog';
import type { Course, RouteLocale } from '@/lib/lessons/types';

type Props = { params: Promise<{ locale: string; course: string }> };

export default async function CourseIndex({ params }: Props) {
  const { locale, course } = await params;
  if (course !== 'basic' && course !== 'advanced') notFound();
  const t = await getTranslations({ locale });
  const modules = await getCourseModules(locale as RouteLocale, course as Course);
  const lessonCounts = await Promise.all(
    modules.map((id) => getModuleLessonCount(course as Course, id)),
  );

  return (
    <div className="module-landing">
      <Link href={`/${locale}/learn`} className="btn-review">↩ {t('learn.title')}</Link>
      <div className="dash-title">{t(`learn.${course}Course`)}</div>
      <ul className="lesson-index">
        {modules.map((id, i) => (
          <li key={id}>
            <Link href={`/${locale}/learn/${course}/${id}`} className="hud-panel lesson-index-row">
              <span className="lesson-index-title">{t(`modules.${id}`)}</span>
              <span className="lesson-index-min">
                {lessonCounts[i]} {t('learn.lessons')} ▶
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
