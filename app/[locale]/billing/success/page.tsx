import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

export default async function BillingSuccessPage({ params }: Props) {
  const { locale } = await params;
  return (
    <div className="module-landing">
      <div className="hud-panel locked-gate">
        <div className="locked-title">Payment received</div>
        <div className="locked-body">
          Stripe is confirming your purchase. Paid lessons unlock as soon as the webhook is processed.
        </div>
        <Link href={`/${locale}/learn`} className="btn-review">Back to lessons</Link>
      </div>
    </div>
  );
}
