import Hero from '@/components/home/Hero';
import Flow from '@/components/home/Flow';
import TrackSplit from '@/components/home/TrackSplit';
import PrivilegesCompare from '@/components/home/PrivilegesCompare';
import Reviews from '@/components/home/Reviews';
import SiteFooter from '@/components/home/SiteFooter';
import TrackView from '@/components/analytics/TrackView';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  return (
    <div className="home">
      {/* U7 conversion funnel, step 1. */}
      <TrackView event="landing_viewed" />
      <Hero locale={locale} />
      <Flow locale={locale} />
      <TrackSplit locale={locale} />
      <PrivilegesCompare locale={locale} />
      <Reviews locale={locale} />
      <SiteFooter locale={locale} />
    </div>
  );
}
