/**
 * Standalone client questionnaires — single-file HTML forms served from
 * /public/forms. They run entirely in the client's browser (nothing is
 * transmitted); the client prints to PDF or downloads a summary and returns
 * it to the office. The admin Intake tab lists these and emails a branded
 * cover note with the link. Add new questionnaires here as they're built.
 */
export type ClientQuestionnaire = {
  id: string;
  label: string;
  blurb: string;
  /** Path under the site root (a file in /public/forms). */
  path: string;
  /** Rough completion time shown to the client. */
  minutes: string;
};

export const CLIENT_QUESTIONNAIRES: ClientQuestionnaire[] = [
  {
    id: "small-estate-affidavit",
    label: "Small Estate Affidavit (Estates Code Ch. 205)",
    blurb:
      "Gathers everything needed to evaluate and prepare a Texas Small Estate Affidavit: decedent details, eligibility screening (will, administration, $75,000 limit), full family history for heirship, assets, debts, and two disinterested witnesses. Flags disqualifiers for attorney review.",
    path: "/forms/small-estate-affidavit.html",
    minutes: "20–30",
  },
];

export function getQuestionnaire(id: string): ClientQuestionnaire | undefined {
  return CLIENT_QUESTIONNAIRES.find((q) => q.id === id);
}
