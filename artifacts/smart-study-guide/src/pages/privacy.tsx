import { PublicLayout } from "@/components/layout/public-layout";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold font-serif">{title}</h2>
      <div className="text-foreground/75 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Legal</p>
          <h1 className="text-4xl font-bold font-serif">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: August 2026</p>
        </div>

        <p className="text-foreground/75 leading-relaxed">
          At ToppersTrick, we take your privacy seriously. This Privacy Policy explains what data we collect, 
          how we use it, and your rights regarding your personal information. By using our platform, you agree to 
          the practices described in this policy.
        </p>

        <div className="space-y-8 divide-y divide-border">
          <Section title="1. Information We Collect">
            <p>We collect the following categories of information:</p>
            <p><strong className="text-foreground">Account Information:</strong> When you create an account, we collect your email address and any profile information you provide (such as your name and phone number). Authentication is handled via Clerk (our identity provider).</p>
            <p><strong className="text-foreground">Uploaded Files:</strong> When you submit an analysis, you upload previous-year question papers as PDF or image files. These files are processed to extract text content for analysis.</p>
            <p><strong className="text-foreground">Generated Analysis Results:</strong> The AI-generated study guides and analysis summaries are stored and associated with your account so you can access them in your history.</p>
            <p><strong className="text-foreground">Payment Information:</strong> Payment transactions are processed through Razorpay. We receive a confirmation of successful payment and store your credit balance and transaction history. We do not store your card number, bank account details, CVV, or any other sensitive financial information — these are handled entirely by Razorpay.</p>
            <p><strong className="text-foreground">Usage Data:</strong> We may collect basic analytics data such as pages visited and features used, to help us improve the product. This does not include personally identifiable information.</p>
          </Section>

          <div className="pt-8">
            <Section title="2. How We Use Your Data">
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>To provide and operate the ToppersTrick service.</li>
                <li>To process your uploaded question papers through our AI analysis pipeline.</li>
                <li>To store your generated study guides as part of your analysis history.</li>
                <li>To manage your credit balance and process payments.</li>
                <li>To send you transactional emails (e.g., account verification, payment confirmation).</li>
                <li>To respond to your support queries.</li>
                <li>To improve and debug the platform.</li>
              </ul>
              <p>We do not sell your personal data to third parties. We do not use your data for advertising purposes.</p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="3. How Uploaded Files Are Processed">
              <p>
                When you upload a question paper, the file is received by our server and processed to extract its 
                text content. This text, along with your analysis request, is sent to <strong className="text-foreground">OpenAI's API</strong> to 
                generate the study guide. OpenAI processes this data in accordance with their own privacy and data 
                usage policies.
              </p>
              <p>
                <strong className="text-foreground">Data retention for uploaded files:</strong> Uploaded files (PDFs and images) are stored on our servers to enable analysis retries and to process your request. We retain uploaded files for as long as the associated analysis record exists in your account. When you delete an analysis or close your account, the associated uploaded files are also deleted.
              </p>
              <p>
                <strong className="text-foreground">Analysis results</strong> (the generated study guides) are retained as part of your account history until you delete them or close your account.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="4. Third-Party Services">
              <p>We use the following third-party services, each with their own privacy policies:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>
                  <strong className="text-foreground">OpenAI</strong> — used to power the AI analysis of your uploaded question papers. 
                  Your extracted text content is sent to OpenAI for processing. See{" "}
                  <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenAI's Privacy Policy</a>.
                </li>
                <li>
                  <strong className="text-foreground">Razorpay</strong> — used to securely process payments. Razorpay handles all 
                  payment data. See{" "}
                  <a href="https://razorpay.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Razorpay's Privacy Policy</a>.
                </li>
                <li>
                  <strong className="text-foreground">Clerk</strong> — used for user authentication and account management. See{" "}
                  <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Clerk's Privacy Policy</a>.
                </li>
              </ul>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="5. Data Retention">
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li><strong className="text-foreground">Uploaded question paper files:</strong> Retained until the associated analysis is deleted or your account is closed.</li>
                <li><strong className="text-foreground">Generated analysis results:</strong> Retained as part of your account history until you delete them or close your account.</li>
                <li><strong className="text-foreground">Account information:</strong> Retained for as long as your account is active.</li>
                <li><strong className="text-foreground">Payment records:</strong> Retained as required for accounting and legal compliance, typically 7 years as per Indian financial regulations.</li>
              </ul>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="6. Your Rights">
              <p>As a user of ToppersTrick, you have the following rights:</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li><strong className="text-foreground">Access:</strong> You can access your account data, analysis history, and credit balance at any time through the platform.</li>
                <li><strong className="text-foreground">Deletion:</strong> You can request deletion of your account and all associated data by contacting us at <a href="mailto:themagnetxofficial@gmail.com" className="text-primary hover:underline">themagnetxofficial@gmail.com</a>.</li>
                <li><strong className="text-foreground">Correction:</strong> You can update your profile information through your account settings at any time.</li>
                <li><strong className="text-foreground">Data portability:</strong> You may request a copy of your data by contacting our support team.</li>
              </ul>
              <p>
                To exercise any of these rights, please email us at{" "}
                <a href="mailto:themagnetxofficial@gmail.com" className="text-primary hover:underline">themagnetxofficial@gmail.com</a>.
                We will respond within 30 days.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="7. Security">
              <p>
                We take the security of your data seriously. We use industry-standard measures to protect your data, including:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>HTTPS/TLS encryption for all data transmitted between your device and our servers.</li>
                <li>Secure authentication handled by Clerk, including password hashing and optional multi-factor authentication.</li>
                <li>Payment processing handled entirely by Razorpay — we never see or store your card details.</li>
                <li>Access controls to limit who within our team can access production data.</li>
              </ul>
              <p>
                While we take all reasonable precautions, no system is completely secure. If you believe your account 
                has been compromised, please contact us immediately.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="8. Cookies">
              <p>
                ToppersTrick uses cookies and similar browser storage mechanisms to maintain your login session 
                and remember your preferences. These are essential for the service to function correctly. We do not 
                use cookies for advertising or cross-site tracking.
              </p>
              <p>
                You can disable cookies in your browser settings, but doing so may prevent you from logging in or 
                using core features of the platform.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="9. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" 
                date at the top of this page. For significant changes, we will notify you by email or via an in-app 
                notice. Your continued use of the Service after changes are posted constitutes acceptance of the 
                updated policy.
              </p>
            </Section>
          </div>

          <div className="pt-8">
            <Section title="10. Contact Us">
              <p>
                For any privacy-related questions, requests, or concerns, please contact us at:
              </p>
              <p>
                <strong className="text-foreground">Email:</strong>{" "}
                 <a href="mailto:themagnetxofficial@gmail.com" className="text-primary hover:underline">themagnetxofficial@gmail.com</a>
              </p>
            </Section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
