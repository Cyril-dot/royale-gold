import crypto from "node:crypto";
import type { TriviaDifficulty } from "./trivia";

/**
 * Trivia question-generation engine (Nov 2026).
 *
 * The curated seed bank (52 questions) never changes between rounds,
 * so a dealt round mixes in questions generated at deal time. Every
 * generated answer is COMPUTED by the generator, never guessed:
 * arithmetic results are calculated, sequences are built from a known
 * rule, primes are checked with a real primality test, and fact
 * families draw from curated lists whose answers are fixed and
 * verifiable. No external API, no LLM, no new dependency, no DB rows
 * — generated questions live only in the server-side round token.
 *
 * Mix: TRIVIA_GENERATED_SHARE of each dealt round is generated, the
 * rest comes from the bank (see generatedCountFor). The share is one
 * named constant so it can be tuned.
 */

export const TRIVIA_GENERATED_SHARE = 0.5;

/** How many questions of a round of `total` are generated (rest = bank). */
export function generatedCountFor(total: number): number {
  return Math.ceil(total * TRIVIA_GENERATED_SHARE);
}

export interface GeneratedQuestion {
  id: string; // "gen-<hex>" — no DB row; the round token carries the data
  question: string;
  options: [string, string, string, string];
  answerIndex: number;
  category: string;
  difficulty: TriviaDifficulty;
  /** Family that produced it, for debugging and verification. */
  family: string;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

/**
 * Build the 4 options from a correct answer string and candidate
 * distractor strings. Drops duplicates and anything equal to the
 * correct answer, tops up with numeric offsets if a family runs
 * short, and shuffles. Returns null if it cannot build 4 options
 * (the caller retries with another draw).
 */
function buildOptions(
  correct: string,
  distractors: string[],
): { options: [string, string, string, string]; answerIndex: number } | null {
  const seen = new Set<string>([correct]);
  const picked: string[] = [];
  for (const d of shuffle(distractors)) {
    if (picked.length >= 3) break;
    if (!seen.has(d)) {
      seen.add(d);
      picked.push(d);
    }
  }
  // Numeric top-up: keep stepping away from the correct value until
  // the set is full (only used when a family runs short on candidates).
  if (picked.length < 3) {
    const num = Number(correct);
    if (Number.isFinite(num)) {
      let step = 1;
      while (picked.length < 3 && step < 500) {
        for (const cand of [num + step, num - step, num + step * 10]) {
          if (picked.length >= 3) break;
          const s = String(cand);
          if (!seen.has(s) && cand >= 0) {
            seen.add(s);
            picked.push(s);
          }
        }
        step += 1;
      }
    }
  }
  if (picked.length < 3) return null;
  const options = shuffle([correct, ...picked]);
  return {
    options: options as [string, string, string, string],
    answerIndex: options.indexOf(correct),
  };
}

/** Plausible wrong numbers near a correct one. */
function nearNumbers(correct: number, scale: number): string[] {
  const s = Math.max(1, Math.round(scale));
  return [
    correct + 1,
    correct - 1,
    correct + 2,
    correct - 2,
    correct + 3,
    correct - 3,
    correct + 5,
    correct - 5,
    correct + 10,
    correct - 10,
    correct + s,
    correct - s,
    correct + s * 10,
    correct * 2,
    Math.floor(correct / 2),
  ]
    .filter((n) => Number.isInteger(n) && n >= 0 && n !== correct)
    .map(String);
}

interface Draft {
  question: string;
  correct: string;
  distractors: string[];
  category: string;
  family: string;
}

type FamilyFn = (difficulty: TriviaDifficulty) => Draft | null;

function finish(
  draft: Draft,
  difficulty: TriviaDifficulty,
): GeneratedQuestion | null {
  const built = buildOptions(draft.correct, draft.distractors);
  if (!built) return null;
  return {
    id: `gen-${crypto.randomBytes(6).toString("hex")}`,
    question: draft.question,
    options: built.options,
    answerIndex: built.answerIndex,
    category: draft.category,
    difficulty,
    family: draft.family,
  };
}

/* ------------------------------------------------------------------ */
/* computed families — the answer is calculated, never looked up       */
/* ------------------------------------------------------------------ */

function famAdd(d: TriviaDifficulty): Draft {
  if (d === "hard" && Math.random() < 0.5) {
    const a = randInt(40, 300);
    const b = randInt(30, 200);
    const c = randInt(10, Math.min(120, a + b - 1));
    const ans = a + b - c;
    return {
      question: `What is ${a} + ${b} - ${c}?`,
      correct: String(ans),
      distractors: nearNumbers(ans, 10),
      category: "Maths",
      family: "add-two-step",
    };
  }
  const [loA, hiA, loB, hiB] =
    d === "easy" ? [3, 30, 2, 20] : d === "medium" ? [15, 120, 12, 90] : [120, 480, 60, 320];
  const a = randInt(loA, hiA);
  const b = randInt(loB, hiB);
  const ans = a + b;
  return {
    question: `What is ${a} + ${b}?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 10),
    category: "Maths",
    family: "add",
  };
}

function famSubtract(d: TriviaDifficulty): Draft {
  const [loA, hiA] = d === "easy" ? [6, 40] : d === "medium" ? [25, 150] : [120, 900];
  const a = randInt(loA, hiA);
  const b = randInt(2, a - 1);
  const ans = a - b;
  return {
    question: `What is ${a} - ${b}?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 10),
    category: "Maths",
    family: "subtract",
  };
}

function famMultiply(d: TriviaDifficulty): Draft {
  let a: number;
  let b: number;
  if (d === "easy") {
    a = randInt(2, 9);
    b = randInt(2, 9);
  } else if (d === "medium") {
    if (Math.random() < 0.5) {
      a = randInt(3, 12);
      b = randInt(3, 12);
    } else {
      a = randInt(11, 29);
      b = randInt(2, 9);
    }
  } else if (Math.random() < 0.5) {
    a = randInt(12, 29);
    b = randInt(12, 29);
  } else {
    a = randInt(101, 299);
    b = randInt(2, 9);
  }
  const ans = a * b;
  return {
    question: `What is ${a} × ${b}?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 10),
    category: "Maths",
    family: "multiply",
  };
}

function famDivide(d: TriviaDifficulty): Draft {
  const [loD, hiD, loQ, hiQ] =
    d === "easy" ? [2, 9, 2, 9] : d === "medium" ? [3, 12, 3, 24] : [4, 19, 6, 48];
  const divisor = randInt(loD, hiD);
  const quotient = randInt(loQ, hiQ);
  const dividend = divisor * quotient; // exact by construction
  return {
    question: `What is ${dividend} ÷ ${divisor}?`,
    correct: String(quotient),
    distractors: nearNumbers(quotient, 2),
    category: "Maths",
    family: "divide",
  };
}

function famSquare(d: TriviaDifficulty): Draft {
  const n = d === "easy" ? randInt(2, 9) : d === "medium" ? randInt(4, 15) : randInt(11, 25);
  const ans = n * n;
  return {
    question: `What is ${n} squared?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 10),
    category: "Maths",
    family: "square",
  };
}

function famCube(d: TriviaDifficulty): Draft {
  const n = d === "easy" ? randInt(2, 4) : d === "medium" ? randInt(2, 6) : randInt(3, 9);
  const ans = n * n * n;
  return {
    question: `What is ${n} cubed?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 10),
    category: "Maths",
    family: "cube",
  };
}

function famSqrt(d: TriviaDifficulty): Draft {
  const n = d === "easy" ? randInt(3, 12) : d === "medium" ? randInt(5, 20) : randInt(12, 30);
  const ans = n;
  return {
    question: `What is the square root of ${n * n}?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 2),
    category: "Maths",
    family: "sqrt",
  };
}

function famSequence(d: TriviaDifficulty): Draft {
  const kind = Math.random();
  if (kind < 0.6) {
    // Arithmetic: a, a+d, a+2d, a+3d, ?
    const [loA, hiA, loD, hiD] =
      d === "easy" ? [1, 20, 2, 5] : d === "medium" ? [2, 40, 3, 12] : [5, 60, 7, 25];
    const a = randInt(loA, hiA);
    const step = randInt(loD, hiD);
    const terms = [a, a + step, a + 2 * step, a + 3 * step];
    const ans = a + 4 * step;
    return {
      question: `What comes next in the sequence? ${terms.join(", ")}, ...`,
      correct: String(ans),
      distractors: nearNumbers(ans, step),
      category: "Maths",
      family: "sequence-arithmetic",
    };
  }
  if (kind < 0.85) {
    // Geometric: a, 2a, 4a, 8a, ? (medium) or a, 3a, 9a, 27a, ? (hard)
    const mult = d === "hard" ? 3 : 2;
    const a = d === "hard" ? randInt(2, 5) : randInt(2, 9);
    const terms = [a, a * mult, a * mult * mult, a * mult * mult * mult];
    const ans = a * mult * mult * mult * mult;
    return {
      question: `What comes next in the sequence? ${terms.join(", ")}, ...`,
      correct: String(ans),
      distractors: nearNumbers(ans, a * mult),
      category: "Maths",
      family: "sequence-geometric",
    };
  }
  // Squares: n², (n+1)², (n+2)², (n+3)², ?
  const n = d === "easy" ? randInt(1, 4) : d === "medium" ? randInt(2, 6) : randInt(3, 8);
  const terms = [n, n + 1, n + 2, n + 3].map((x) => x * x);
  const ans = (n + 4) * (n + 4);
  return {
    question: `What comes next in the sequence? ${terms.join(", ")}, ...`,
    correct: String(ans),
    distractors: nearNumbers(ans, 10),
    category: "Maths",
    family: "sequence-squares",
  };
}

const PRIMES_EASY = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
const PRIMES_MEDIUM = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59];
const PRIMES_HARD = [23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

function compositesIn(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) if (!isPrime(n)) out.push(n);
  return out;
}

function famPrime(d: TriviaDifficulty): Draft | null {
  const primes = d === "easy" ? PRIMES_EASY : d === "medium" ? PRIMES_MEDIUM : PRIMES_HARD;
  const [loC, hiC] = d === "easy" ? [4, 28] : d === "medium" ? [30, 60] : [49, 99];
  const comps = compositesIn(loC, hiC);
  if (comps.length < 3) return null;
  const notPrime = Math.random() < 0.5;
  if (notPrime) {
    const comp = pick(comps);
    const others = shuffle(primes).slice(0, 3);
    return {
      question: "Which of these is NOT a prime number?",
      correct: String(comp),
      distractors: others.map(String),
      category: "Maths",
      family: "prime-not",
    };
  }
  const prime = pick(primes);
  const others = shuffle(comps).slice(0, 3);
  return {
    question: "Which of these is a prime number?",
    correct: String(prime),
    distractors: others.map(String),
    category: "Maths",
    family: "prime",
  };
}

function famPercent(d: TriviaDifficulty): Draft {
  const [percents, loY, hiY] =
    d === "easy"
      ? [[10, 20, 25, 50], 10, 200]
      : d === "medium"
        ? [[15, 25, 40, 60, 75], 20, 400]
        : [[12, 18, 30, 35, 45, 60, 80], 20, 600];
  const p = pick(percents);
  // y must make p% of y an integer: y is a multiple of 100 / gcd(p, 100).
  const step = 100 / gcd(p, 100);
  const y = step * randInt(Math.max(1, Math.ceil(loY / step)), Math.floor(hiY / step));
  const ans = (p * y) / 100;
  return {
    question: `What is ${p}% of ${y}?`,
    correct: String(ans),
    distractors: nearNumbers(ans, 5),
    category: "Maths",
    family: "percent",
  };
}

/* ------------------------------------------------------------------ */
/* fact families — curated lists, answers fixed and verifiable         */
/* ------------------------------------------------------------------ */

interface FactEntry {
  country: string;
  capital: string;
}

// Tiered so easy asks only world-famous capitals, hard asks obscure ones.
const CAPITALS_EASY: FactEntry[] = [
  { country: "France", capital: "Paris" },
  { country: "the United Kingdom", capital: "London" },
  { country: "the United States", capital: "Washington, D.C." },
  { country: "Ghana", capital: "Accra" },
  { country: "Nigeria", capital: "Abuja" },
  { country: "Egypt", capital: "Cairo" },
  { country: "Japan", capital: "Tokyo" },
  { country: "China", capital: "Beijing" },
  { country: "India", capital: "New Delhi" },
  { country: "Germany", capital: "Berlin" },
  { country: "Italy", capital: "Rome" },
  { country: "Spain", capital: "Madrid" },
  { country: "Canada", capital: "Ottawa" },
  { country: "Brazil", capital: "Brasília" },
  { country: "Australia", capital: "Canberra" },
  { country: "Kenya", capital: "Nairobi" },
];

const CAPITALS_MEDIUM: FactEntry[] = [
  { country: "Morocco", capital: "Rabat" },
  { country: "Algeria", capital: "Algiers" },
  { country: "Ethiopia", capital: "Addis Ababa" },
  { country: "Senegal", capital: "Dakar" },
  { country: "Mexico", capital: "Mexico City" },
  { country: "Argentina", capital: "Buenos Aires" },
  { country: "Peru", capital: "Lima" },
  { country: "Turkey", capital: "Ankara" },
  { country: "Greece", capital: "Athens" },
  { country: "the Netherlands", capital: "Amsterdam" },
  { country: "Sweden", capital: "Stockholm" },
  { country: "Norway", capital: "Oslo" },
  { country: "Poland", capital: "Warsaw" },
  { country: "Ukraine", capital: "Kyiv" },
  { country: "Thailand", capital: "Bangkok" },
  { country: "Vietnam", capital: "Hanoi" },
];

const CAPITALS_HARD: FactEntry[] = [
  { country: "Burkina Faso", capital: "Ouagadougou" },
  { country: "Mali", capital: "Bamako" },
  { country: "Niger", capital: "Niamey" },
  { country: "Chad", capital: "N'Djamena" },
  { country: "Mauritania", capital: "Nouakchott" },
  { country: "Togo", capital: "Lomé" },
  { country: "Benin", capital: "Porto-Novo" },
  { country: "Guinea", capital: "Conakry" },
  { country: "Sierra Leone", capital: "Freetown" },
  { country: "Liberia", capital: "Monrovia" },
  { country: "Gabon", capital: "Libreville" },
  { country: "Angola", capital: "Luanda" },
  { country: "Zambia", capital: "Lusaka" },
  { country: "Zimbabwe", capital: "Harare" },
  { country: "Botswana", capital: "Gaborone" },
  { country: "Namibia", capital: "Windhoek" },
  { country: "Mozambique", capital: "Maputo" },
  { country: "Madagascar", capital: "Antananarivo" },
  { country: "Rwanda", capital: "Kigali" },
  { country: "Malawi", capital: "Lilongwe" },
  { country: "Lesotho", capital: "Maseru" },
  { country: "Eswatini", capital: "Mbabane" },
  { country: "Mauritius", capital: "Port Louis" },
  { country: "Seychelles", capital: "Victoria" },
  { country: "Djibouti", capital: "Djibouti" },
  { country: "Eritrea", capital: "Asmara" },
  { country: "Somalia", capital: "Mogadishu" },
  { country: "Sudan", capital: "Khartoum" },
  { country: "South Sudan", capital: "Juba" },
  { country: "Libya", capital: "Tripoli" },
  { country: "Tunisia", capital: "Tunis" },
  { country: "Jordan", capital: "Amman" },
  { country: "Lebanon", capital: "Beirut" },
  { country: "Iraq", capital: "Baghdad" },
  { country: "Iran", capital: "Tehran" },
  { country: "Pakistan", capital: "Islamabad" },
  { country: "Bangladesh", capital: "Dhaka" },
  { country: "Nepal", capital: "Kathmandu" },
  { country: "Myanmar", capital: "Naypyidaw" },
  { country: "Cambodia", capital: "Phnom Penh" },
  { country: "Laos", capital: "Vientiane" },
  { country: "Mongolia", capital: "Ulaanbaatar" },
  { country: "Kazakhstan", capital: "Astana" },
  { country: "Uzbekistan", capital: "Tashkent" },
  { country: "Iceland", capital: "Reykjavik" },
  { country: "Ireland", capital: "Dublin" },
  { country: "Portugal", capital: "Lisbon" },
  { country: "Belgium", capital: "Brussels" },
  { country: "Switzerland", capital: "Bern" },
  { country: "Austria", capital: "Vienna" },
  { country: "Denmark", capital: "Copenhagen" },
  { country: "Finland", capital: "Helsinki" },
  { country: "Croatia", capital: "Zagreb" },
  { country: "Serbia", capital: "Belgrade" },
  { country: "Romania", capital: "Bucharest" },
  { country: "Bulgaria", capital: "Sofia" },
  { country: "Hungary", capital: "Budapest" },
  { country: "Czechia", capital: "Prague" },
  { country: "Slovakia", capital: "Bratislava" },
  { country: "Lithuania", capital: "Vilnius" },
  { country: "Latvia", capital: "Riga" },
  { country: "Estonia", capital: "Tallinn" },
  { country: "Slovenia", capital: "Ljubljana" },
  { country: "Albania", capital: "Tirana" },
  { country: "North Macedonia", capital: "Skopje" },
  { country: "Montenegro", capital: "Podgorica" },
  { country: "Bosnia and Herzegovina", capital: "Sarajevo" },
  { country: "Georgia", capital: "Tbilisi" },
  { country: "Armenia", capital: "Yerevan" },
  { country: "Azerbaijan", capital: "Baku" },
  { country: "Cyprus", capital: "Nicosia" },
  { country: "Malta", capital: "Valletta" },
];

export const ALL_CAPITALS: FactEntry[] = [
  ...CAPITALS_EASY,
  ...CAPITALS_MEDIUM,
  ...CAPITALS_HARD,
];

function famCapital(d: TriviaDifficulty): Draft {
  const list = d === "easy" ? CAPITALS_EASY : d === "medium" ? CAPITALS_MEDIUM : CAPITALS_HARD;
  const entry = pick(list);
  const distractors = shuffle(ALL_CAPITALS.map((c) => c.capital).filter((c) => c !== entry.capital)).slice(0, 3);
  return {
    question: `What is the capital of ${entry.country}?`,
    correct: entry.capital,
    distractors,
    category: "World Capitals",
    family: "capital",
  };
}

interface FixedFact {
  question: string;
  answer: string;
  distractors: string[];
  category: string;
}

const SCIENCE_EASY: FixedFact[] = [
  { question: "What planet is known as the Red Planet?", answer: "Mars", distractors: ["Venus", "Jupiter", "Saturn"], category: "Science" },
  { question: "What is H2O commonly known as?", answer: "Water", distractors: ["Salt", "Oxygen", "Hydrogen"], category: "Science" },
  { question: "How many legs does a spider have?", answer: "8", distractors: ["6", "10", "4"], category: "Science" },
  { question: "What gas do plants absorb from the air?", answer: "Carbon dioxide", distractors: ["Oxygen", "Nitrogen", "Helium"], category: "Science" },
  { question: "What is the boiling point of water at sea level?", answer: "100°C", distractors: ["90°C", "80°C", "120°C"], category: "Science" },
  { question: "Which organ pumps blood around the body?", answer: "Heart", distractors: ["Liver", "Lung", "Kidney"], category: "Science" },
  { question: "What force keeps us on the ground?", answer: "Gravity", distractors: ["Magnetism", "Friction", "Inertia"], category: "Science" },
  { question: "How many sides does a triangle have?", answer: "3", distractors: ["4", "5", "6"], category: "Science" },
];

const SCIENCE_MEDIUM: FixedFact[] = [
  { question: "What is the chemical symbol for gold?", answer: "Au", distractors: ["Ag", "Gd", "Go"], category: "Science" },
  { question: "Which planet has the most moons?", answer: "Saturn", distractors: ["Jupiter", "Mars", "Neptune"], category: "Science" },
  { question: "What is the powerhouse of the cell?", answer: "Mitochondria", distractors: ["Nucleus", "Ribosome", "Golgi body"], category: "Science" },
  { question: "How many bones are in the adult human body?", answer: "206", distractors: ["186", "226", "196"], category: "Science" },
  { question: "Which gas makes up most of Earth's atmosphere?", answer: "Nitrogen", distractors: ["Oxygen", "Carbon dioxide", "Argon"], category: "Science" },
  { question: "What is the largest organ in the human body?", answer: "Skin", distractors: ["Liver", "Heart", "Brain"], category: "Science" },
  { question: "Which planet is known for its Great Red Spot?", answer: "Jupiter", distractors: ["Mars", "Saturn", "Venus"], category: "Science" },
  { question: "What is the freezing point of water?", answer: "0°C", distractors: ["10°C", "-10°C", "5°C"], category: "Science" },
];

const SCIENCE_HARD: FixedFact[] = [
  { question: "What is the chemical symbol for tungsten?", answer: "W", distractors: ["Tu", "Tn", "Tg"], category: "Science" },
  { question: "Which element has the atomic number 79?", answer: "Gold", distractors: ["Silver", "Platinum", "Mercury"], category: "Science" },
  { question: "What is the hardest naturally occurring substance on Earth?", answer: "Diamond", distractors: ["Quartz", "Titanium", "Granite"], category: "Science" },
  { question: "What is the study of fungi called?", answer: "Mycology", distractors: ["Botany", "Zoology", "Entomology"], category: "Science" },
  { question: "What is the pH of pure water?", answer: "7", distractors: ["5", "9", "1"], category: "Science" },
  { question: "Which blood cells carry oxygen around the body?", answer: "Red blood cells", distractors: ["White blood cells", "Platelets", "Plasma cells"], category: "Science" },
  { question: "How many hearts does an octopus have?", answer: "3", distractors: ["1", "2", "4"], category: "Science" },
  { question: "What is the main chemical in vinegar?", answer: "Acetic acid", distractors: ["Citric acid", "Sulfuric acid", "Lactic acid"], category: "Science" },
];

export const ALL_SCIENCE: FixedFact[] = [...SCIENCE_EASY, ...SCIENCE_MEDIUM, ...SCIENCE_HARD];

function famScience(d: TriviaDifficulty): Draft {
  const list = d === "easy" ? SCIENCE_EASY : d === "medium" ? SCIENCE_MEDIUM : SCIENCE_HARD;
  const f = pick(list);
  return { question: f.question, correct: f.answer, distractors: f.distractors, category: f.category, family: "science" };
}

interface RegionEntry {
  region: string;
  capital: string;
}

const GHANA_REGIONS_EASY: RegionEntry[] = [
  { region: "Greater Accra", capital: "Accra" },
  { region: "Ashanti", capital: "Kumasi" },
  { region: "Northern", capital: "Tamale" },
  { region: "Volta", capital: "Ho" },
  { region: "Central", capital: "Cape Coast" },
  { region: "Western", capital: "Sekondi-Takoradi" },
];

const GHANA_REGIONS_MEDIUM: RegionEntry[] = [
  { region: "Eastern", capital: "Koforidua" },
  { region: "Bono", capital: "Sunyani" },
  { region: "Upper East", capital: "Bolgatanga" },
  { region: "Upper West", capital: "Wa" },
];

const GHANA_REGIONS_HARD: RegionEntry[] = [
  { region: "Oti", capital: "Dambai" },
  { region: "Savannah", capital: "Damongo" },
  { region: "North East", capital: "Nalerigu" },
  { region: "Western North", capital: "Sefwi Wiawso" },
  { region: "Ahafo", capital: "Goaso" },
  { region: "Bono East", capital: "Techiman" },
];

export const ALL_GHANA_REGIONS: RegionEntry[] = [
  ...GHANA_REGIONS_EASY,
  ...GHANA_REGIONS_MEDIUM,
  ...GHANA_REGIONS_HARD,
];

function famGhanaRegion(d: TriviaDifficulty): Draft {
  const list =
    d === "easy" ? GHANA_REGIONS_EASY : d === "medium" ? GHANA_REGIONS_MEDIUM : GHANA_REGIONS_HARD;
  const entry = pick(list);
  const distractors = shuffle(
    ALL_GHANA_REGIONS.map((r) => r.capital).filter((c) => c !== entry.capital),
  ).slice(0, 3);
  return {
    question: `What is the capital of the ${entry.region} Region?`,
    correct: entry.capital,
    distractors,
    category: "Ghana Geography",
    family: "ghana-region",
  };
}

const MATH_FACTS_EASY: FixedFact[] = [
  { question: "How many sides does a square have?", answer: "4", distractors: ["3", "5", "6"], category: "Maths" },
  { question: "How many minutes are in 1 hour?", answer: "60", distractors: ["30", "90", "100"], category: "Maths" },
  { question: "How many days are in a week?", answer: "7", distractors: ["5", "6", "8"], category: "Maths" },
  { question: "How many months are in a year?", answer: "12", distractors: ["10", "11", "13"], category: "Maths" },
  { question: "How many degrees are in a right angle?", answer: "90", distractors: ["45", "180", "60"], category: "Maths" },
];

const MATH_FACTS_MEDIUM: FixedFact[] = [
  { question: "How many sides does a hexagon have?", answer: "6", distractors: ["5", "7", "8"], category: "Maths" },
  { question: "How many faces does a cube have?", answer: "6", distractors: ["4", "8", "12"], category: "Maths" },
  { question: "How many months have 31 days?", answer: "7", distractors: ["5", "6", "8"], category: "Maths" },
  { question: "How many degrees do the angles of a triangle add up to?", answer: "180", distractors: ["90", "270", "360"], category: "Maths" },
  { question: "How many sides does a pentagon have?", answer: "5", distractors: ["4", "6", "7"], category: "Maths" },
  { question: "How many hours are in 3 days?", answer: "72", distractors: ["48", "60", "96"], category: "Maths" },
];

const MATH_FACTS_HARD: FixedFact[] = [
  { question: "How many sides does an octagon have?", answer: "8", distractors: ["6", "7", "10"], category: "Maths" },
  { question: "How many edges does a cube have?", answer: "12", distractors: ["6", "8", "10"], category: "Maths" },
  { question: "How many sides does a decagon have?", answer: "10", distractors: ["8", "9", "12"], category: "Maths" },
  { question: "How many seconds are in 5 minutes?", answer: "300", distractors: ["250", "500", "60"], category: "Maths" },
  { question: "How many faces does a dodecahedron have?", answer: "12", distractors: ["10", "14", "20"], category: "Maths" },
  { question: "What is 7 factorial (7!)?", answer: "5040", distractors: ["720", "40320", "120"], category: "Maths" },
];

export const ALL_MATH_FACTS: FixedFact[] = [...MATH_FACTS_EASY, ...MATH_FACTS_MEDIUM, ...MATH_FACTS_HARD];

function famMathFact(d: TriviaDifficulty): Draft {
  const list = d === "easy" ? MATH_FACTS_EASY : d === "medium" ? MATH_FACTS_MEDIUM : MATH_FACTS_HARD;
  const f = pick(list);
  return { question: f.question, correct: f.answer, distractors: f.distractors, category: f.category, family: "math-fact" };
}

/* ------------------------------------------------------------------ */
/* family tables per difficulty                                        */
/* ------------------------------------------------------------------ */

const FAMILIES: Record<TriviaDifficulty, FamilyFn[]> = {
  easy: [famAdd, famSubtract, famMultiply, famSquare, famSequence, famPrime, famCapital, famScience, famGhanaRegion, famMathFact],
  medium: [famAdd, famSubtract, famMultiply, famDivide, famSquare, famCube, famSqrt, famSequence, famPrime, famPercent, famCapital, famScience, famGhanaRegion, famMathFact],
  hard: [famAdd, famSubtract, famMultiply, famDivide, famSquare, famCube, famSqrt, famSequence, famPrime, famPercent, famCapital, famScience, famGhanaRegion, famMathFact],
};

export const TRIVIA_GENERATED_FAMILIES = [
  "add",
  "add-two-step",
  "subtract",
  "multiply",
  "divide",
  "square",
  "cube",
  "sqrt",
  "sequence-arithmetic",
  "sequence-geometric",
  "sequence-squares",
  "prime",
  "prime-not",
  "percent",
  "capital",
  "science",
  "ghana-region",
  "math-fact",
] as const;

/**
 * Generate `count` unique questions at `difficulty`. `excludeTexts`
 * are question texts already in the round (bank questions) — a
 * generated question never repeats one of them, and never repeats
 * another generated question in the same call.
 */
export function generateTriviaQuestions(
  difficulty: TriviaDifficulty,
  count: number,
  excludeTexts: string[] = [],
): GeneratedQuestion[] {
  const used = new Set(excludeTexts.map((t) => t.trim().toLowerCase()));
  const out: GeneratedQuestion[] = [];
  const families = FAMILIES[difficulty];
  let attempts = 0;
  while (out.length < count && attempts < 400) {
    attempts += 1;
    const fn = pick(families);
    let draft: Draft | null = null;
    try {
      draft = fn(difficulty);
    } catch {
      draft = null;
    }
    if (!draft) continue;
    const key = draft.question.trim().toLowerCase();
    if (used.has(key)) continue;
    const q = finish(draft, difficulty);
    if (!q) continue;
    used.add(key);
    out.push(q);
  }
  return out;
}
