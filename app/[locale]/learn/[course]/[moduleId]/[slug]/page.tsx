import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getLesson, getModuleLessons } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
import { canViewLesson, type AccessTier } from '@/lib/exam/access';
import { hasPaidAccess } from '@/lib/payments/entitlements';
import { auth } from '../../../../../../auth';
import MDXContent from '@/components/learn/MDXContent';
import LessonShell from '@/components/learn/LessonShell';
import LessonSidebar from '@/components/learn/LessonSidebar';
import PurchaseButton from '@/components/payments/PurchaseButton';
import type { Course, RouteLocale } from '@/lib/lessons/types';
import VideoPlayer from '@/components/learn/VideoPlayer';
import { streamConfig, signPlaybackToken } from '@/lib/video/cloudflareStream';

type Props = { params: Promise<{ locale: string; course: string; moduleId: string; slug: string }> };

export default async function LessonPage({ params }: Props) {
  const { locale, course, moduleId, slug } = await params;
  if (course !== 'basic' && course !== 'advanced') notFound();
  const lesson = await getLesson(locale as RouteLocale, course as Course, moduleId, slug);
  if (!lesson) notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const isPaid = userId ? await hasPaidAccess(userId) : false;
  const tier: AccessTier = isPaid ? 'PAID' : userId ? 'FREE' : 'GUEST';

  if (!canViewLesson(tier, lesson.meta.access)) {
    const t = await getTranslations({ locale });
    return (
      <div className="module-landing">
        <Link href={`/${locale}/learn/${course}/${moduleId}`} className="btn-review">
          ↩ {t(`modules.${moduleId}`)}
        </Link>
        <div className="hud-panel locked-gate">
          <div className="locked-icon">🔒</div>
          <div className="locked-title">{t('learn.lockedTitle')}</div>
          <div className="locked-body">{t('learn.lockedBody')}</div>
          {userId ? (
            <PurchaseButton locale={locale} />
          ) : (
            <Link href={`/${locale}/signin`} className="btn-review">
              {t('auth.signIn')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);
  const lessons = await getModuleLessons(locale as RouteLocale, course as Course, moduleId);
  const idx = lessons.findIndex((l) => l.slug === slug);
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const nextHref = next ? `/${locale}/learn/${course}/${moduleId}/${next.slug}` : null;
  const backHref = `/${locale}/learn/${course}/${moduleId}`;

  let videoToken: string | null = null;
  if (lesson.meta.videoUid && lesson.meta.videoStatus === 'READY') {
    try {
      const cfg = streamConfig();
      videoToken = await signPlaybackToken({
        videoUid: lesson.meta.videoUid,
        keyId: cfg.signingKeyId,
        privateKeyPem: cfg.signingKeyPem,
      });
    } catch (err) {
      // Misconfigured CF env shouldn't take down the whole lesson — degrade to text-only.
      console.error('Failed to sign video playback token', err);
      videoToken = null;
    }
  }

  return (
    <div className="learn-layout">
      <LessonSidebar
        locale={locale}
        course={course as Course}
        moduleId={moduleId}
        currentSlug={slug}
        completed={completed}
      />
      <article className="lesson-main">
        <h1 className="lesson-h1">{lesson.meta.title}</h1>
        <LessonShell lessonId={lesson.meta.lessonId} nextHref={nextHref} backHref={backHref}>
          {videoToken && <VideoPlayer token={videoToken} />}
          <MDXContent source={lesson.body} locale={locale} />
        </LessonShell>
      </article>
    </div>
  );
}
