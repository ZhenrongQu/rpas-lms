import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

export default async function BillingCancelledPage({ params }: Props) {
  const { locale } = await params;
  return (
    <div className="module-landing">
      <div className="hud-panel locked-gate">
        <div className="locked-title">Checkout cancelled</div>
        <div className="locked-body">No payment was completed and your access was not changed.</div>
        <Link href={`/${locale}/learn`} className="btn-review">Back to lessons</Link>
      </div>
    </div>
  );
}
