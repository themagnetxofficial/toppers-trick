import { PublicLayout } from "@/components/layout/public-layout";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold font-serif">{title}</h2>
      <div className="text-foreground/75 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Legal</p>
          <h1 className="text-4xl font-bold font-serif">Terms & Conditions</h1>
          <p className="text-muted-foreground">Last updated: August 2026</p>
        </div>

        <p className="text-foreground/75 leading-relaxed">
          Please read these Terms and Conditions carefully before using Smart Study Guide ("the Service", "the Platform"). 
          By creating an account or using the Service in any way, you agree to be bound by these terms. If you do not 
          agree, please do not use the Service.
        </p>

        <div className="space-y-8 divide-y divide-border">
          <Section title="1. Description of Service">
            <p>
              Smart Study Guide is an AI-powered study tool that allows users to upload previous-year question papers 
              (PDFs or images) for analysis. Our platform processes these files to identify topic patterns, generates 
              priority-based study guides, and provides downloadable PDF study materials. The AI analysis is generated 
              using large language model technology via third-party APIs.
            </p>
          </Section>

          <div className="pt-8">
            <Section title="2. User Eligibility">
              <p>
                The Service is intended for genuine students and educational users. By using Smart Study Guide, you confirm 
                that you are at least 13 years of age and that you will not misuse the platform. If you are under 18 years of 
                age, you must have parental or guardian consent to use the Service.
              </p>
              <p>
                We reserve the right to suspend or permanently terminate accounts found to be in violation of these 
                terms or engaging in any form of abuse, fraud, or misuse.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="3. User Responsibilities">
              <p>You are solely responsible for the content you upload to Smart Study Guide. By uploading files, you confirm that:</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>You have the right to use the materials for personal study purposes.</li>
                <li>You are not uploading files with the intent to redistribute, reproduce, or commercially exploit them.</li>
                <li>You will not upload content that is unlawful, harmful, defamatory, or otherwise objectionable.</li>
                <li>You will not attempt to reverse-engineer, scrape, or misuse the platform's AI systems.</li>
              </ul>
              <p>
                Smart Study Guide is a personal study aid. It is not intended for commercial tutoring, content resale, 
                or any use that violates the intellectual property rights of exam boards or publishers.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="4. Credits and Payment Terms">
              <p>
                Smart Study Guide operates on a credit-based system. Each AI analysis consumes one credit from your account balance.
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li><strong className="text-foreground">Purchased credits</strong> expire 30 days from the date of purchase and are non-refundable after expiry.</li>
                <li><strong className="text-foreground">Credits are non-transferable</strong> and cannot be shared between accounts.</li>
                <li>All payments are processed securely through Razorpay. We do not store your card or banking details.</li>
                <li>Prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes.</li>
                <li>We reserve the right to change pricing with reasonable notice.</li>
              </ul>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="5. Free Trial Credits">
              <p>
                New users receive 1 free credit upon creating an account. Free trial credits are non-transferable, 
                have no monetary value, and cannot be refunded or exchanged for cash. Free trial credits do not expire.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="6. Limitation of Liability">
              <p>
                The AI-generated study guide is a study aid based on statistical pattern recognition from past papers 
                provided by the user. It does <strong className="text-foreground">not</strong> guarantee which questions 
                will appear in any future examination, and should not be relied upon as the sole method of exam preparation.
              </p>
              <p>
                Smart Study Guide makes no warranties, express or implied, regarding the accuracy, completeness, or 
                fitness for purpose of the generated content. We are not liable for any loss of marks, exam results, or 
                other academic outcomes arising from reliance on the platform.
              </p>
              <p>
                To the fullest extent permitted by law, our total liability to you for any claim arising from the use 
                of the Service shall not exceed the amount you paid us in the 30 days preceding the claim.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="7. Account Suspension and Termination">
              <p>
                We reserve the right to suspend or terminate your account at any time, with or without notice, if we 
                determine that you have violated these Terms and Conditions, engaged in fraudulent activity, or otherwise 
                misused the platform.
              </p>
              <p>
                You may also delete your account at any time by contacting us at{" "}
                <a href="mailto:support@smartstudy.app" className="text-primary hover:underline">support@smartstudy.app</a>. 
                Upon deletion, your analysis history and uploaded files will be removed from our systems. Unused credits 
                are forfeited upon account deletion.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="8. Intellectual Property">
              <p>
                All content, design, code, and branding on the Smart Study Guide platform is the intellectual property 
                of the Company. You may not reproduce, copy, or distribute any part of the platform without prior written 
                permission.
              </p>
              <p>
                The study guides generated for you are for your personal, non-commercial educational use only.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="9. Governing Law">
              <p>
                These Terms and Conditions are governed by and construed in accordance with the laws of India. Any 
                disputes arising from or relating to these terms shall be subject to the exclusive jurisdiction of the 
                courts located in India.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="10. Changes to These Terms">
              <p>
                We may update these Terms and Conditions from time to time. When we do, we will update the "Last updated" 
                date at the top of this page and, for significant changes, notify you via email or an in-app notice. 
                Your continued use of the Service after any changes constitutes your acceptance of the updated terms.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="11. Contact">
              <p>
                For any questions about these Terms, please contact us at{" "}
                <a href="mailto:support@smartstudy.app" className="text-primary hover:underline">support@smartstudy.app</a> 
                {" "}or visit our{" "}
                <a href="/contact" className="text-primary hover:underline">Contact Us</a> page.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
