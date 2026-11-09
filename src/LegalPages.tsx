import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

export type LegalPageKind = "privacy" | "terms" | "contact";

export function LegalPage({ kind, onBack }: { kind: LegalPageKind; onBack: () => void }) {
  const title = kind === "privacy" ? "Privacy Policy" : kind === "terms" ? "Terms of Use" : "Contact & support";
  return (
    <main className="legal-page">
      <div className="legal-topbar">
        <button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15} /> Back to Law Hub</button>
        <a className="legal-brand" href="/">LAW HUB <span>Law school hub</span></a>
      </div>
      <article className="legal-document">
        <div className="legal-eyebrow"><ShieldCheck size={15} /> OFFICIAL PLATFORM INFORMATION</div>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: 9 November 2026</p>
        {kind === "privacy" && <PrivacyContent />}
        {kind === "terms" && <TermsContent />}
        {kind === "contact" && <ContactContent />}
      </article>
    </main>
  );
}

function PrivacyContent() {
  return <>
    <p>Law Hub is a learning platform for law students. This policy explains what information we collect, why we use it, and the choices available to you. It is written in plain language and does not replace professional legal advice.</p>
    <h2>Information we collect</h2>
    <p>When you create an account, we may collect your name, email address, university, study level, profile preferences, and authentication information. When you use the platform, we may also process materials you upload, research drafts, timetable entries, debate activity, support messages, and basic security or activity records needed to operate the service.</p>
    <h2>Why we use it</h2>
    <p>We use this information to create and secure your account, provide learning tools, save your work, organise shared study features, respond to support requests, prevent misuse, improve reliability, and meet legal or security obligations. We do not sell student data.</p>
    <h2>Service providers and storage</h2>
    <p>Some services, such as authentication, database hosting, file storage, email, AI processing, or media processing, may process information for Law Hub under their own service terms. We limit access to what is needed for the requested feature and should not be treated as a substitute for your own backup of important academic work.</p>
    <h2>Your rights</h2>
    <p>You may ask to be informed about your data, request access or a copy, correct inaccurate information, object to certain processing, request deletion where applicable, or ask a question about our safeguards. Sign in and open My profile to download basic account information, submit a data request, or delete your account. We may need to verify your identity before completing a request.</p>
    <h2>Cookies and browser storage</h2>
    <p>Law Hub does not currently use advertising cookies. The browser may use local storage or essential session storage to keep you signed in, remember your draft, or remember preferences. If we introduce analytics, advertising, or other non-essential tracking, this policy will be updated and the appropriate choices will be provided.</p>
    <h2>Retention and security</h2>
    <p>We keep information only for as long as it is needed for the purposes above, unless a longer period is required for security, dispute handling, or law. No online service is completely risk-free. Use a unique password, avoid uploading confidential client information, and contact us promptly if you suspect unauthorised access.</p>
    <h2>Contact</h2>
    <p>For an access, correction, deletion, or privacy question, sign in and use Support & complaints, or use the Contact & support page linked below.</p>
  </>;
}

function TermsContent() {
  return <>
    <p>By creating an account or using Law Hub, you agree to use the platform lawfully, respectfully, and in a way that does not put other users, the service, or confidential information at risk.</p>
    <h2>What Law Hub provides</h2>
    <p>Law Hub provides study organisation, document, research, discussion, debate, and learning-support tools. AI output may contain mistakes and must be checked against the original authority, lecturer material, or official source. The platform is not a law firm and its output is not legal advice.</p>
    <h2>Your responsibilities</h2>
    <p>Do not upload confidential client information, examination material you are not allowed to share, copyrighted material without permission, malware, or another person’s personal information without a lawful reason. Do not impersonate another person, harass users, manipulate scores, or misuse debates, AI players, or platform communications.</p>
    <h2>Your content</h2>
    <p>You keep ownership of work you create or upload, subject to the rights in material belonging to other people. You give Law Hub permission to store and process your content only as needed to provide the feature you requested. You are responsible for checking that you have permission to share third-party material.</p>
    <h2>Suspension and changes</h2>
    <p>We may limit or suspend access where necessary to protect users, investigate abuse, comply with law, or maintain the service. We may change features or these terms as the platform develops. Material changes should be communicated through the platform or account email where reasonably practicable.</p>
    <h2>Contact</h2>
    <p>Questions, complaints, and account requests can be sent through Support & complaints after sign-in.</p>
  </>;
}

function ContactContent() {
  return <>
    <p>Need help, want to report a problem, or want to exercise a data right? Law Hub members can send a private message to the platform administrator through Support & complaints.</p>
    <div className="legal-contact-card"><Mail size={20} /><div><strong>Member support</strong><span>Sign in, open Support & complaints, and choose Technical problem, Account help, Complaint, or Other.</span></div><a className="primary-button" href="/login">Sign in to contact support</a></div>
    <h2>Data requests</h2><p>For access, correction, export, or deletion, choose Account help and write what you need. Do not include passwords, payment details, or confidential client information in a support message.</p>
    <h2>Before contacting us</h2><p>Include the email address on your Law Hub account, a short description of the issue, and the page or feature involved. Never send your password.</p>
  </>;
}

export function LegalFooter({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <footer className="legal-footer"><span>LAW HUB · Study tools for law students</span><nav aria-label="Legal"><button onClick={() => onNavigate("privacy")}>Privacy Policy</button><button onClick={() => onNavigate("terms")}>Terms of Use</button><button onClick={() => onNavigate("contact")}>Contact & support</button><button onClick={() => onNavigate("account")}>Data controls</button></nav></footer>;
}

export function PolicyAcceptanceModal({ busy, onAccept }: { busy: boolean; onAccept: () => void }) {
  return <div className="policy-modal-backdrop" role="presentation"><section className="policy-modal" role="dialog" aria-modal="true" aria-labelledby="policy-modal-title"><div className="legal-eyebrow"><ShieldCheck size={15} /> LAW HUB POLICY UPDATE</div><h2 id="policy-modal-title">Please review our updated policies</h2><p>We have updated the Privacy Policy and Terms of Use so you can clearly understand how Law Hub handles account information, learning activity, uploaded materials, and support requests.</p><div className="policy-modal-links"><a href="/privacy" target="_blank" rel="noreferrer">Read the Privacy Policy</a><a href="/terms" target="_blank" rel="noreferrer">Read the Terms of Use</a></div><p className="field-hint">You must acknowledge these documents before continuing to the learning workspace. You can change your mind later by contacting Support & complaints or deleting your account.</p><button type="button" className="primary-button" disabled={busy} onClick={onAccept}>{busy ? "Saving acknowledgement…" : "I have read and agree — continue"}</button></section></div>;
}
