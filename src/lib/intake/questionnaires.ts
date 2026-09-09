/**
 * Standalone client questionnaires — single-file HTML forms served from
 * /public/forms. Answers stay in the client's browser while they work (drafts
 * in localStorage, nothing transmitted); pressing Submit on the review page
 * POSTs the summary to /api/questionnaire, which emails the intake team and
 * sends the client a branded confirmation with a PDF copy. The admin Intake
 * tab lists these and emails a branded cover note with the link. Add new
 * questionnaires here as they're built.
 */
export type ClientQuestionnaire = {
  id: string;
  label: string;
  blurb: string;
  /** Path under the site root (a file in /public/forms). */
  path: string;
  /** Rough completion time shown to the client. */
  minutes: string;
  /** Intake branch whose managed recipient list gets the submission email. */
  notifyBranch: string;
};

export const CLIENT_QUESTIONNAIRES: ClientQuestionnaire[] = [
  {
    id: "small-estate-affidavit",
    label: "Small Estate Affidavit (Estates Code Ch. 205)",
    blurb:
      "Gathers everything needed to evaluate and prepare a Texas Small Estate Affidavit: decedent details, eligibility screening (will, administration, $75,000 limit), full family history for heirship, assets, debts, and two disinterested witnesses. Flags disqualifiers for attorney review.",
    path: "/forms/small-estate-affidavit.html",
    minutes: "20–30",
    notifyBranch: "estate-succession-planning",
  },
];

export function getQuestionnaire(id: string): ClientQuestionnaire | undefined {
  return CLIENT_QUESTIONNAIRES.find((q) => q.id === id);
}
