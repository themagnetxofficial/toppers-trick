import { PublicLayout } from "@/components/layout/public-layout";
import { Link } from "wouter";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold font-serif">{title}</h2>
      <div className="text-foreground/75 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function RefundPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Legal</p>
          <h1 className="text-4xl font-bold font-serif">Refund & Cancellation Policy</h1>
          <p className="text-muted-foreground">Last updated: August 2026</p>
        </div>

        <p className="text-foreground/75 leading-relaxed">
          Smart Study Guide sells digital AI analysis credits — a service that is delivered instantly upon purchase. 
          Please read this policy carefully before making a purchase.
        </p>

        <div className="space-y-8 divide-y divide-border">
          <Section title="1. General Refund Policy">
            <p>
              Since Smart Study Guide provides a digital service (AI analysis credits that are consumed per use), 
              <strong className="text-foreground"> refunds are generally not provided once credits have been used</strong>. 
              Once an analysis has been successfully completed and a credit has been consumed, that analysis is 
              considered delivered and is non-refundable.
            </p>
            <p>
              Credits that have not yet been used may be considered for refund only under the circumstances 
              described below.
            </p>
          </Section>

          <div className="pt-8">
            <Section title="2. Technical Payment Errors">
              <p>
                If your payment was charged but credits were <strong className="text-foreground">not added to your account</strong> due 
                to a technical error on our part, you are eligible for a full resolution. To request a fix:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>Contact us within <strong className="text-foreground">7 days</strong> of the payment date.</li>
                <li>Email us at <a href="mailto:support@smartstudy.app" className="text-primary hover:underline">support@smartstudy.app</a> with your registered email address and the Razorpay payment ID (found in your payment confirmation email).</li>
                <li>We will investigate and either credit your account or process a full refund within <strong className="text-foreground">5–7 business days</strong>.</li>
              </ul>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="3. Credit Expiry">
              <p>
                Purchased credits expire <strong className="text-foreground">30 days from the date of purchase</strong>. 
                Expired credits are forfeited and are <strong className="text-foreground">not eligible for refund or extension</strong>. 
                We encourage users to use credits before they expire. Your credit balance and expiry date are always 
                visible in your account dashboard.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="4. Free Trial Credits">
              <p>
                Free trial credits provided to new users upon sign-up are non-transferable and have no monetary value. 
                They cannot be refunded, exchanged for cash, or transferred to another account under any circumstances.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="5. Cancellation">
              <p>
                Smart Study Guide does not offer subscription plans — you purchase credits as needed. There is nothing 
                to "cancel" on an ongoing basis. If you no longer wish to use the platform, simply stop purchasing credits. 
                Any unused credits in your account will remain valid until their expiry date.
              </p>
              <p>
                If you wish to delete your account entirely, please contact us at{" "}
                <a href="mailto:support@smartstudy.app" className="text-primary hover:underline">support@smartstudy.app</a>. 
                Note that account deletion is permanent, and any unused credits will be forfeited without refund.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="6. How to Request a Refund">
              <p>If you believe you are eligible for a refund based on the criteria above, please follow this process:</p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Visit our <Link href="/contact" className="text-primary hover:underline">Contact Us</Link> page or email <a href="mailto:support@smartstudy.app" className="text-primary hover:underline">support@smartstudy.app</a>.</li>
                <li>Use the subject line: <em>"Refund Request — [your registered email]"</em>.</li>
                <li>Include your Razorpay payment ID and a brief description of the issue.</li>
                <li>Our support team will review your request and respond within 48 business hours.</li>
              </ol>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="7. Refund Processing Timeline">
              <p>
                If a refund is approved, it will be processed to your original payment method via Razorpay within 
                <strong className="text-foreground"> 5–7 business days</strong>. The time for the refund to reflect 
                in your account may vary depending on your bank or card issuer.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="8. Contact Us">
              <p>
                For any questions about this policy, please reach out to us:
              </p>
              <p>
                <strong className="text-foreground">Email:</strong>{" "}
                <a href="mailto:support@smartstudy.app" className="text-primary hover:underline">support@smartstudy.app</a>
                <br />
                <strong className="text-foreground">Response time:</strong> We typically respond within 24–48 hours on business days.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
