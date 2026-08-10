/**
 * The Smith v. Morgan (CV24-162) elements proof matrix, as structured data for
 * the trial evidence tool. Seeded once by Database Sync alongside the case.
 *
 * Exhibit-kind proofs carry their Bates citation as text rather than a link to a
 * numbered exhibit: the exhibit list hasn't been numbered yet, and the tool
 * supports a citation with no exhibit attached. Once exhibits are numbered under
 * Witnesses & Exhibits, each entry can be pointed at the real exhibit.
 *
 * `anticipated: true` marks expected trial testimony with no deposition
 * transcript behind it (italicized in the original matrix).
 */

export type SeedWitness = { key: string; name: string; side: string; role: string; notes?: string; available?: string };

export const CV24_162_WITNESSES: SeedWitness[] = [
  { key: "smith", name: "Robert Smith", side: "plaintiff", role: "Plaintiff", available: "confirmed" },
  { key: "morgan", name: "Tommy Morgan", side: "defendant", role: "Defendant (adverse)", notes: "Deposition taken — see transcripts." },
  { key: "etter", name: "George Etter IV", side: "plaintiff", role: "Fact witness — predecessor family", notes: "Etter family owned the Smith Property from the 1940s; may go by deposition." },
  { key: "bass", name: "Bass", side: "plaintiff", role: "Fact witness — County", notes: "2007 Chapter 258 map process and the 'Public Rd 3515' designation on Grid 135." },
  { key: "leatherwood", name: "Leatherwood", side: "plaintiff", role: "Expert — aerials and access" },
  { key: "ballard", name: "Joe Ballard", side: "plaintiff", role: "Surveyor — 2024 survey plat" },
  { key: "lozano", name: "Lozano", side: "plaintiff", role: "Fact witness — long-term access", notes: "Affidavit on file (RES_000477–000480)." },
  { key: "wagner", name: "Wagner", side: "plaintiff", role: "Fact witness — long-term access", notes: "Affidavit on file (RES_000477–000480)." },
  { key: "gomez", name: "Gomez", side: "plaintiff", role: "Fact witness — long-term access", notes: "Affidavit on file (RES_000477–000480)." },
  { key: "aguirre", name: "Aguirre", side: "plaintiff", role: "Fact witness — long-term access", notes: "Affidavit on file. Per pretrial list: do NOT call.", available: "unavailable" },
  { key: "gonzales", name: "Homero Gonzales", side: "plaintiff", role: "Fact witness — visited the ranch", notes: "(214) 205-2265" },
  { key: "whitfield", name: "Charles Whitfield Land Clearing", side: "plaintiff", role: "Fact witness — mowing and shredding at the ranch", notes: "(817) 648-4668" },
  { key: "tms", name: "T. Maxwell Smith", side: "plaintiff", role: "Attorney's fees (lodestar)", notes: "Hours, rates, tasks, reasonableness. Billing records to be supplemented.", available: "confirmed" },
];

export type SeedProof = { kind: "exhibit" | "testimony"; witnessKey?: string; citation?: string; summary?: string; anticipated?: boolean };
export type SeedElement = { text: string; proofs: SeedProof[] };
export type SeedClaim = { name: string; isLead?: boolean; party?: string; notes?: string; elements: SeedElement[] };

export const CV24_162_CLAIMS: SeedClaim[] = [
  {
    name: "Count 6 — Declaratory Judgment: CR 3515 is a Public Road (Implied Dedication)",
    isLead: true,
    notes: "Lead claim.",
    elements: [
      {
        text: "Element 1 — Landowner's acts induced belief of intent to dedicate",
        proofs: [
          { kind: "exhibit", citation: "RES_000260; 000804", summary: "Grid Map #135 depicting \"Public Rd 3515\"" },
          { kind: "exhibit", citation: "RES_000091–000092", summary: "Bosque County Road Index listing CR 3515, Grid pp. 135–136" },
          { kind: "exhibit", citation: "RES_000001–000017", summary: "CAD records: three properties with official CR 3515 addresses — 455, 540, 805" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 18, ll. ___ (RES_000330)", summary: "Never discussed road use with Smith before 2024; denies building fence/gate over road" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 8, ll. ___ (RES_000036)", summary: "Morgan never said Smith couldn't use road prior to easement discussion ~2023" },
          { kind: "testimony", witnessKey: "smith", anticipated: true, summary: "No gate, chain, or barrier ever blocked the route from 2006 until the recent obstructions; Morgans watched daily use for 19 years without objection" },
        ],
      },
      {
        text: "Element 2 — Landowner competent to dedicate",
        proofs: [
          { kind: "exhibit", citation: "RES_001002–001081", summary: "Chain-of-title deeds establishing ownership at all relevant times" },
          { kind: "exhibit", citation: "RES_000370–000372; 001079–001081", summary: "Spence-to-Morgan deed, Sept. 3, 1981" },
          { kind: "testimony", witnessKey: "etter", anticipated: true, summary: "Etter family owned the Smith Property from the 1940s and used this route with the knowledge of successive Morgan-tract owners (live or by deposition)" },
        ],
      },
      {
        text: "Element 3 — Public reliance / public served by dedication",
        proofs: [
          { kind: "exhibit", citation: "RES_000986; 001046; 001214–001218", summary: "1934 public-road affidavit; historical public-passage affidavits" },
          { kind: "exhibit", citation: "RES_000987; 001159–001162; 001219", summary: "Etter v. Torrance 1947 judgment + Stipulation of Facts: 40-year open lane/road" },
          { kind: "exhibit", citation: "RES_000477–000480", summary: "Lozano, Wagner, Gomez, Aguirre affidavits — each accessed 805 CR 3515 for 15–19+ years exclusively via CR 3515 and the gravel road across the Morgan Property" },
          { kind: "exhibit", citation: "RES_000375–000464", summary: "AmeriGas, Childress Creek, Myatt Fuels, CR Texas delivery records 2006–2025" },
          { kind: "exhibit", citation: "RES_000737–000738", summary: "USPS FOIA: 805 CR 3515 in AMS database" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 22, ll. ___ (RES_000050)", summary: "Road was always there; Etters took him through that way; used by utility companies, delivery vehicles, fuel vehicles" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 14, ll. ___ (RES_000326)", summary: "People come and go to Smith's property \"all hours\"" },
          { kind: "testimony", witnessKey: "lozano", anticipated: true, summary: "Accessed 805 CR 3515 exclusively via CR 3515 and the gravel road across the Morgan Property" },
          { kind: "testimony", witnessKey: "wagner", anticipated: true, summary: "Accessed 805 CR 3515 exclusively via CR 3515 and the gravel road across the Morgan Property" },
          { kind: "testimony", witnessKey: "gomez", anticipated: true, summary: "Accessed 805 CR 3515 exclusively via CR 3515 and the gravel road across the Morgan Property" },
        ],
      },
      {
        text: "Element 4 — Offer and acceptance of dedication",
        proofs: [
          { kind: "exhibit", citation: "RES_000070–000102", summary: "Official designation as \"County Road 3515\"; inclusion on county road map" },
          { kind: "exhibit", citation: "RES_000300–000301; 000073–000074", summary: "Report of Jury of View, May 31, 2007: maintenance ceases Whitney line to Morgan cattle guard \"but the public nature of the road will remain unaffected\"" },
          { kind: "exhibit", citation: "RES_000070–000075", summary: "Order Adopting County Road Map, June 19, 2007" },
          { kind: "exhibit", citation: "RES_000018–000022", summary: "911-system recognition — Sheriff's Office records affidavit" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 18, ll. ___ (RES_000046)", summary: "Understood CR 3515 was formerly county road, now PR with public access; attended hearing years ago" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 19, ll. ___ (RES_000047)", summary: "Documentation from CR-to-PR conversion states public access" },
          { kind: "testimony", witnessKey: "bass", anticipated: true, summary: "The 2007 Chapter 258 map process, the meaning of the \"Public Rd 3515\" designation on Grid 135, and the County's intent to preserve the road's public character" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 8, ll. ___ (RES_000320)", summary: "COUNTER-TESTIMONY — claims the CR designation was a 911 clerical error (\"they put CR instead of PR\"). Build the Element 4 cross around this." },
        ],
      },
      {
        text: "Alternative — Origin \"shrouded in obscurity\": presumption from long public use",
        proofs: [
          { kind: "exhibit", citation: "RES_000472–000476; 000744–000750", summary: "1978 USDA aerials showing road in current location" },
          { kind: "exhibit", citation: "RES_001187–001190; 001172–001186; 000739–000741", summary: "1957 USGS Valley Mills Quad; 1970 TxDOT map; 1953 Tobin map" },
          { kind: "exhibit", citation: "RES_000355–000362", summary: "Google Earth timeline 1985–2024" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 33, ll. ___ (RES_000345)", summary: "When he bought it (1981) there was a road all the way around all the fences; doesn't remember if tracks pre-existed" },
          { kind: "testimony", witnessKey: "leatherwood", anticipated: true, summary: "The road appears in the same location in every aerial and map from 1978 forward; its origin predates available records" },
        ],
      },
      {
        text: "No abandonment",
        proofs: [
          { kind: "exhibit", citation: "RES_000301", summary: "Jury of View special instruction, plus all continuous-use evidence above" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 20, ll. ___ (RES_000048)", summary: "Has used the road since purchase" },
        ],
      },
    ],
  },
  {
    name: "Count 1 — Prescriptive Easement (alternative)",
    elements: [
      {
        text: "Element 1 — Open and notorious use",
        proofs: [
          { kind: "exhibit", citation: "RES_000353; 000354", summary: "Annotated aerial: clearly visible gravel road; 2024 Ballard survey plat" },
          { kind: "exhibit", citation: "RES_000023–000028; 000751–000766", summary: "Photographs: gate, \"805\" sign, road" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 14, ll. ___ (RES_000326); p. 21, ll. ___ (RES_000333)", summary: "People drove down there night and day; two ruts; gate has George Etter name on it" },
        ],
      },
      {
        text: "Element 2 — Continuous, uninterrupted 10+ years (tacking)",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 13, ll. ___ (RES_000041)", summary: "Has always accessed property through Morgan's" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 20, ll. ___ (RES_000048)", summary: "Used road since 2006 purchase" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 22, ll. ___ (RES_000334)", summary: "\"GEORGE\"/\"ETTER\" granite inscriptions at gate are pre-1981 — plus Petition ¶13 (Etter entrance existed by 1981)" },
          { kind: "exhibit", citation: "RES_000375–000464; 000355–000362; 000472–000476", summary: "Delivery records 2006–2025; aerials 1978–2024" },
          { kind: "testimony", witnessKey: "etter", anticipated: true, summary: "The Etter family used the identical route continuously from at least the 1960s–70s through the 2006 sale" },
        ],
      },
      {
        text: "Element 3 — Adverse and hostile",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 8, ll. ___ (RES_000036)", summary: "No permission ever sought; Morgan never objected pre-2024" },
          { kind: "exhibit", citation: "RES_001219", summary: "Etter v. Torrance judgment: predecessors litigated and established claimed access right" },
          { kind: "testimony", witnessKey: "smith", anticipated: true, summary: "He used the road as a matter of right appurtenant to his CR 3515 address, never by asking the Morgans' leave" },
        ],
      },
      {
        text: "Element 4 — Exclusive use",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 21, ll. ___ (RES_000049)", summary: "Only knows one entrance; wouldn't need Morgan's road if other access existed" },
          { kind: "exhibit", citation: "RES_000023–000028", summary: "Photographs: Smith's own gate, inscriptions, \"805\" sign marking individual claim" },
          { kind: "testimony", witnessKey: "smith", anticipated: true, summary: "The segment from the cattle guard to his gate serves only the Smith Property — distinguishing his claim of right from general public passage" },
        ],
      },
    ],
  },
  {
    name: "Count 2 — Easement by Estoppel (alternative)",
    elements: [
      {
        text: "Element 1 — Representation by word or action",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 24, ll. ___ (RES_000052)", summary: "Morgans were neighborly for 19 years" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 6, ll. ___ (RES_000034)", summary: "Communications minimal — holiday ham, trash complaints only; never access objections" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 18, ll. ___ (RES_000330)", summary: "Denies ever discussing road use with Smith before 2024" },
          { kind: "testimony", witnessKey: "smith", anticipated: true, summary: "The Morgans watched him grade the road, receive deliveries, and improve the gate for nearly two decades and said nothing" },
        ],
      },
      {
        text: "Element 2 — Communication believed",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 16, ll. ___ (RES_000044)", summary: "Nobody raised any road/easement issue when buying; property carried 805 CR 3515 address" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 17, ll. ___ (RES_000045)", summary: "Assumed the address meant road access; easement never discussed before purchase" },
        ],
      },
      {
        text: "Element 3 — Reliance",
        proofs: [
          { kind: "exhibit", citation: "RES_000005–000009; 001257–001266; 001225–001246", summary: "2006 deed, $1.1M; TREC contract; title commitment/policy" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 23, ll. ___ (RES_000051)", summary: "Put caliche/gravel on ruts on Morgan's property several times over 19 years" },
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 26, ll. ___ (RES_000054)", summary: "$5.2M contract collapsed; $5,000 retainer paid" },
          { kind: "exhibit", citation: "RES_000374", summary: "Unsworn Declaration ¶¶ re: rock gate maintenance 2006–present" },
        ],
      },
    ],
  },
  {
    name: "Count 7 — Irrevocable License (alternative)",
    elements: [
      {
        text: "Element 1 — License (permission/acquiescence)",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 24, ll. ___ (RES_000052)", summary: "Same acquiescence proof — Morgans neighborly for 19 years" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 18, ll. ___ (RES_000330)", summary: "Denies ever discussing road use before 2024" },
        ],
      },
      {
        text: "Element 2 — Expenditure of money/labor in reliance",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 23, ll. ___ (RES_000051)", summary: "Repeated caliche/gravel applications" },
          { kind: "exhibit", citation: "RES_000375–000464; 000374", summary: "Utility/fuel/water expenditures 2006–2025; gate improvements" },
        ],
      },
      {
        text: "Element 3 — Revocation inequitable",
        proofs: [
          { kind: "testimony", witnessKey: "smith", citation: "Smith Dep. p. 20, ll. ___ (RES_000048); p. 21, ll. ___ (RES_000049)", summary: "No other known access; property inaccessible without route" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. p. 16, ll. ___ (RES_000328)", summary: "\"I guess so\" that rock gate route is only way through" },
          { kind: "testimony", witnessKey: "leatherwood", anticipated: true, summary: "No alternative vehicular access from any public road exists" },
        ],
      },
    ],
  },
  {
    name: "Defendants' Interference / Injunctive Relief",
    elements: [
      {
        text: "Interference with access supporting injunctive relief",
        proofs: [
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. pp. 25–27, ll. ___ (RES_000337–000339)", summary: "Fallen trees near Smith's entrance; \"right to do what he wants on his property\"" },
          { kind: "testimony", witnessKey: "morgan", citation: "Morgan Dep. pp. 19–20, ll. ___ (RES_000331–000332); pp. 29–30, ll. ___ (RES_000341–000342)", summary: "Surveyor confrontation; sheriff called" },
          { kind: "exhibit", citation: "RES_000028; 000754–000759; 000788–000791", summary: "Photographs: debris at gate, chains, stop signs" },
          { kind: "testimony", witnessKey: "ballard", anticipated: true, summary: "Morgan confronted him and attempted to prohibit access while surveying the road" },
        ],
      },
    ],
  },
  {
    name: "Attorney's Fees (DJA)",
    elements: [
      {
        text: "Reasonable and necessary attorney's fees",
        proofs: [
          { kind: "testimony", witnessKey: "tms", anticipated: true, summary: "Hours, rates, tasks, reasonableness (lodestar); billing records to be supplemented" },
        ],
      },
    ],
  },
];
