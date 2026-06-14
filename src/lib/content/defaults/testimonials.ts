/**
 * Client testimonials — verbatim 5-star Google reviews (lightly cleaned for
 * spelling/abbreviations only). Seeded into the database when the table is
 * empty; fully editable afterward in the admin Testimonials tab.
 * Reviews left without any written text are intentionally omitted.
 */

export type TestimonialSeed = {
  quote: string;
  attribution: string;
  context?: string;
  sort: number;
};

export const TESTIMONIALS: TestimonialSeed[] = [
  {
    quote:
      "We had a great experience working with Max Smith on our will. He is extremely knowledgeable, professional, and made the process easy to understand. Communication was clear, and everything was handled promptly. I highly recommend his firm's services for estate planning.",
    attribution: "Rene Sanders",
    context: "Google review — Estate planning",
    sort: 1,
  },
  {
    quote:
      "If you are looking for an attorney that cares, is honest, and will get the job done, then call Mr. Smith — you will not be disappointed. He has tirelessly worked my father's case for four years and we could not have asked for anything better. He truly cares.",
    attribution: "Kimberly Ohde",
    context: "Google review",
    sort: 2,
  },
  {
    quote:
      "My 96-year-old friend needed help with a threat she was having from a reverse mortgage company. In my opinion, Mr. Smith went above and beyond. That is what I appreciate about him.",
    attribution: "Adam T.",
    context: "Google review",
    sort: 3,
  },
  {
    quote:
      "Max did a great job helping us with my mom's estate. He recommended and successfully executed a quicker, cheaper process for us that saved us thousands of dollars. Thanks, Max!",
    attribution: "Ted Gajary",
    context: "Google review — Estate",
    sort: 4,
  },
  {
    quote:
      "He went above and beyond to handle my case. His attention was wonderful and he was excellent at communication. It was a wonderful experience — I found the best attorney there is. I would recommend him time and time again. Thank you for all your help.",
    attribution: "Clayton Brooks",
    context: "Google review",
    sort: 5,
  },
  {
    quote:
      "I've known Max since we were children; he is one of the most trustworthy and hardworking people around. I'm certain his legal practice is competent, professional, and effective.",
    attribution: "Reid Pinkerton",
    context: "Google review — Character reference",
    sort: 6,
  },
  {
    quote:
      "Mr. Smith is an outstanding attorney. He demonstrates the utmost dedication to his clients.",
    attribution: "Daniel Barber",
    context: "Google review",
    sort: 7,
  },
  {
    quote:
      "Through a long process and rollercoaster of events thrown my way, I could always call and get a response. Very professional and knowledgeable. I'm glad I made the decision to go this route.",
    attribution: "Miguel Castorena",
    context: "Google review",
    sort: 8,
  },
  {
    quote:
      "The best attorney I've had. He did everything he said he would do, and more. I recommend him and his services.",
    attribution: "Brandon Jenkins",
    context: "Google review",
    sort: 9,
  },
];
