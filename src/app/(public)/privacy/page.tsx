import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { FIRM } from "@/lib/firm";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" />
      <div className="container-prose py-16 lg:py-20 prose-firm">
        <p>
          This Privacy Policy explains what information {FIRM.name} collects through this website
          and how it is used. By using this website, you consent to the practices described here.
        </p>
        <h2>Information we collect</h2>
        <p>
          We collect information you voluntarily provide through the consultation/intake form —
          such as your name, contact details, county, and a description of your matter. We also
          collect limited, non-identifying analytics data (such as pages visited and referring
          sites) to understand how the website is used.
        </p>
        <h2>How we use your information</h2>
        <p>
          Information submitted through the intake form is used solely to evaluate and respond to
          your inquiry. We may contact you using the contact information and preferences you
          provide. We do not sell your personal information.
        </p>
        <h2>Email</h2>
        <p>
          Intake submissions are delivered to the firm by email, which may include the details
          you provide. Please do not include confidential or privileged information in your
          submission until an attorney-client relationship has been established in writing.
        </p>
        <h2>Analytics</h2>
        <p>
          We use privacy-conscious analytics to measure site traffic. These tools may set cookies
          or collect aggregated usage data. You can control cookies through your browser settings.
        </p>
        <h2>Data retention &amp; security</h2>
        <p>
          We retain intake submissions for as long as necessary to evaluate and act on your
          inquiry and to comply with our professional obligations. We take reasonable measures to
          protect the information we hold, though no method of transmission over the internet is
          completely secure.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about this policy may be directed to {FIRM.email}.
        </p>
      </div>
    </>
  );
}
