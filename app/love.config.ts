/**
 * Everything personal on the site lives in this one file.
 * Change the names, dates, memories and letter here and the whole site updates.
 *
 * Photos: drop images into /public/photos and set `image: "/photos/your-file.jpg"`.
 * Leave `image` out to show the pretty gradient placeholder instead.
 */

export const love = {
  yourName: "Your Name",
  herName: "X",

  // Initials shown in the little logo (top-left and footer).
  yourInitial: "Y",
  herInitial: "X",

  // The day it all started (YYYY-MM-DD). Used for the "together for" counter
  // and to work out the next anniversary for the countdown.
  startDate: "2023-02-14",

  hero: {
    script: "Forever & Always",
    tagline:
      "Every love story is beautiful, but ours is my favourite. Together since {start}, and counting every second.",
  },

  story: [
    {
      date: "14 Feb 2023",
      title: "The first hello",
      body: "Where it all began. I still remember exactly what you were wearing.",
    },
    {
      date: "02 Mar 2023",
      title: "Our first date",
      body: "Coffee that turned into dinner that turned into a walk we never wanted to end.",
    },
    {
      date: "Summer 2024",
      title: "Our first trip",
      body: "Getting lost together and realising home is wherever you are.",
    },
    {
      date: "Today",
      title: "Still choosing you",
      body: "Every single day, in every little way. And I always will.",
    },
  ],

  moments: [
    { caption: "Our first date", date: "March 2023", colors: ["#FBD3D9", "#F6A8B6"] },
    { caption: "Sunset by the sea", date: "June 2023", colors: ["#FDE2C8", "#F4A88A"] },
    { caption: "Your birthday surprise", date: "August 2023", colors: ["#E9D7F5", "#C7A3E6"] },
    { caption: "Rainy day chai", date: "October 2023", colors: ["#D7E8F5", "#A3C4E6"] },
    { caption: "Our first trip", date: "Summer 2024", colors: ["#FCE3E6", "#E8536B"] },
    { caption: "Just us, being silly", date: "Every day", colors: ["#FFE7B8", "#F2B25C"] },
  ] as { caption: string; date: string; colors: [string, string]; image?: string }[],

  reasons: [
    "The way you laugh at my worst jokes, every single time.",
    "How you make the most ordinary days feel like an adventure.",
    "Your kindness, to me, to strangers, to every stray cat we meet.",
    "The way you look at me when you think I am not looking.",
    "How you believe in me, even on the days I do not.",
    "Because you are you. And that will always be enough.",
  ],

  letter: {
    greeting: "My dearest {her},",
    paragraphs: [
      "I made this little corner of the internet just for you, because some feelings are too big to fit into a text message.",
      "Thank you for every laugh, every late-night talk, every hand held under the table. Thank you for staying patient with me, for growing with me, and for making my world softer and brighter just by being in it.",
      "Wherever life takes us next, I want to go there with you. Today, tomorrow and every day after that.",
    ],
    signOff: "Forever yours,",
  },

  question: {
    intro: "One little question...",
    ask: "Will you keep being my favourite person, forever?",
    yes: "Yes, always!",
    no: "No",
    answer: "I knew it. I love you, {her}.",
  },
};

export type LoveConfig = typeof love;

/** Replace {her}, {you} and {start} tokens in copy. */
export function fill(text: string, extra: Record<string, string> = {}) {
  return text
    .replaceAll("{her}", love.herName)
    .replaceAll("{you}", love.yourName)
    .replace(/\{(\w+)\}/g, (m, k: string) => extra[k] ?? m);
}
