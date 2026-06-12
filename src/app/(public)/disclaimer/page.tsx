import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { FIRM, PRINCIPAL_OFFICE } from "@/lib/firm";

export const metadata: Metadata = { title: "Legal Disclaimer" };

export default function DisclaimerPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Legal Disclaimer" />
      <div className="container-prose py-16 lg:py-20 prose-firm">
        <p>
          The information on this website is provided for general informational purposes only
          and does not constitute legal advice. No information here should be relied upon as
          legal advice for any particular situation.
        </p>
        <h2>No attorney-client relationship</h2>
        <p>
          Viewing this website, contacting the firm, or submitting information through the
          consultation form does not create an attorney-client relationship. An attorney-client
          relationship is formed only after the firm and the client have executed a written
          engagement agreement. Please do not send confidential or time-sensitive information
          through this website until such a relationship has been established.
        </p>
        <h2>No guarantee of results</h2>
        <p>
          Any references to prior results do not guarantee a similar outcome. Each case depends
          on its own facts and circumstances. Descriptions of the firm's experience are not a
          promise or guarantee regarding the outcome of any future matter.
        </p>
        <h2>Advertising notice</h2>
        <p>
          This website may constitute attorney advertising. The principal office of the firm is
          located in {PRINCIPAL_OFFICE.city}, {PRINCIPAL_OFFICE.state}. The attorney responsible
          for this website is {FIRM.attorney.fullName}. The firm does not claim to be a certified
          specialist in any field; it focuses on and handles the practice areas described herein.
        </p>
        <h2>Jurisdiction</h2>
        <p>
          {FIRM.attorney.fullName} is licensed to practice law in the State of Texas. The firm
          does not seek to represent anyone based solely on a visit to this website in a state
          where the website fails to comply with that state's laws and ethical rules.
        </p>
      </div>
    </>
  );
}
