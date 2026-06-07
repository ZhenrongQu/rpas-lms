import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getCourseModules, getCourseLessonCount } from '@/lib/lessons/catalog';
import type { Course, RouteLocale } from '@/lib/lessons/types';

type Props = { params: Promise<{ locale: string }> };

const COURSES: { course: Course; access: 'FREE' | 'PAID' }[] = [
  { course: 'basic', access: 'FREE' },
  { course: 'advanced', access: 'PAID' },
];

export default async function LearnHub({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return (
    <div className="module-landing">
      <div className="dash-callsign">{t('learn.title')}</div>
      <div className="dash-title">{t('learn.subtitle')}</div>
      <div className="course-grid">
        {COURSES.map(({ course, access }) => {
          const modules = getCourseModules(locale as RouteLocale, course).length;
          const lessons = getCourseLessonCount(course);
          return (
            <Link key={course} href={`/${locale}/learn/${course}`} className="hud-panel course-card">
              <div className={`course-badge ${access === 'FREE' ? 'free' : 'paid'}`}>
                {access === 'FREE' ? t('learn.free') : `🔒 ${t('learn.paid')}`}
              </div>
              <div className="course-name">{t(`learn.${course}Course`)}</div>
              <div className="course-tagline">{t(`learn.${course}Tagline`)}</div>
              <div className="course-meta">
                {modules} {t('learn.modules')} · {lessons} {t('learn.lessons')}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
