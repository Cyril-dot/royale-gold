import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const TRIVIA: { question: string; options: [string, string, string, string]; answerIndex: number; category: string; difficulty: string }[] = [
  // Ghana — sports
  { question: "In which year did Ghana's Black Stars first play at the FIFA World Cup?", options: ["2002", "2006", "2010", "2014"], answerIndex: 1, category: "Ghana Sports", difficulty: "medium" },
  { question: "Which Ghanaian footballer is nicknamed 'Baby Jet'?", options: ["André Ayew", "Asamoah Gyan", "Michael Essien", "Sulley Muntari"], answerIndex: 1, category: "Ghana Sports", difficulty: "medium" },
  { question: "How many Africa Cup of Nations titles has Ghana won?", options: ["2", "3", "4", "5"], answerIndex: 2, category: "Ghana Sports", difficulty: "hard" },
  { question: "Which club is known as the Porcupine Warriors?", options: ["Hearts of Oak", "Asante Kotoko", "Great Olympics", "Ashanti Gold"], answerIndex: 1, category: "Ghana Sports", difficulty: "medium" },
  { question: "Which Ghanaian boxer held the IBF lightweight title in the 1990s?", options: ["Azumah Nelson", "Ike Quartey", "Joshua Clottey", "Ben Tackie"], answerIndex: 0, category: "Ghana Sports", difficulty: "hard" },
  // Ghana — music & culture
  { question: "Which Ghanaian artist released the hit song 'Sarkodie' collaborator track 'Adonai'?", options: ["Shatta Wale", "Sarkodie", "Stonebwoy", "King Promise"], answerIndex: 1, category: "Ghana Music", difficulty: "hard" },
  { question: "Hiplife music is a blend of hip hop and which Ghanaian genre?", options: ["Highlife", "Afrobeats", "Gospel", "Reggae"], answerIndex: 0, category: "Ghana Music", difficulty: "medium" },
  { question: "Which festival is celebrated by the Ga people of Accra?", options: ["Aboakyer", "Homowo", "Hogbetsotso", "Dipo"], answerIndex: 1, category: "Ghana Culture", difficulty: "medium" },
  { question: "What is the capital city of Ghana?", options: ["Kumasi", "Tamale", "Accra", "Takoradi"], answerIndex: 2, category: "Ghana Geography", difficulty: "easy" },
  { question: "Lake Volta is one of the largest artificial lakes in the world. On which river was it created?", options: ["River Pra", "River Volta", "River Ankobra", "River Densu"], answerIndex: 1, category: "Ghana Geography", difficulty: "medium" },
  { question: "In which year did Ghana gain independence from Britain?", options: ["1951", "1957", "1960", "1966"], answerIndex: 1, category: "Ghana History", difficulty: "easy" },
  { question: "Who was Ghana's first president?", options: ["J. B. Danquah", "Kwame Nkrumah", "Kofi Busia", "Jerry Rawlings"], answerIndex: 1, category: "Ghana History", difficulty: "easy" },
  { question: "What is Ghana's currency?", options: ["Naira", "Cedi", "Franc", "Shilling"], answerIndex: 1, category: "Ghana General", difficulty: "easy" },
  { question: "Which Ghanaian dish is made from fermented corn dough steamed in corn husks?", options: ["Waakye", "Kenkey", "Banku", "Fufu"], answerIndex: 1, category: "Ghana Food", difficulty: "easy" },
  { question: "What is the main export crop of Ghana?", options: ["Coffee", "Cocoa", "Cotton", "Tea"], answerIndex: 1, category: "Ghana General", difficulty: "easy" },
  // World — geography
  { question: "What is the largest country in Africa by land area?", options: ["Nigeria", "Egypt", "Algeria", "Sudan"], answerIndex: 2, category: "World Geography", difficulty: "medium" },
  { question: "Which river is the longest in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], answerIndex: 1, category: "World Geography", difficulty: "easy" },
  { question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answerIndex: 2, category: "World Geography", difficulty: "medium" },
  { question: "Mount Kilimanjaro is located in which country?", options: ["Kenya", "Ethiopia", "Tanzania", "Uganda"], answerIndex: 2, category: "World Geography", difficulty: "medium" },
  { question: "Which desert is the largest hot desert in the world?", options: ["Gobi", "Kalahari", "Sahara", "Mojave"], answerIndex: 2, category: "World Geography", difficulty: "easy" },
  // World — history
  { question: "In which year did humans first land on the Moon?", options: ["1965", "1969", "1972", "1975"], answerIndex: 1, category: "World History", difficulty: "easy" },
  { question: "Which ancient civilisation built the pyramids of Giza?", options: ["Romans", "Greeks", "Egyptians", "Aztecs"], answerIndex: 2, category: "World History", difficulty: "easy" },
  { question: "Who wrote the play 'Romeo and Juliet'?", options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"], answerIndex: 1, category: "World History", difficulty: "easy" },
  { question: "The Berlin Wall fell in which year?", options: ["1985", "1989", "1991", "1995"], answerIndex: 1, category: "World History", difficulty: "medium" },
  // Science
  { question: "What is the chemical symbol for gold?", options: ["Gd", "Go", "Au", "Ag"], answerIndex: 2, category: "Science", difficulty: "medium" },
  { question: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], answerIndex: 2, category: "Science", difficulty: "easy" },
  { question: "What is the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi body"], answerIndex: 2, category: "Science", difficulty: "medium" },
  { question: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answerIndex: 1, category: "Science", difficulty: "medium" },
  { question: "What force keeps us on the ground?", options: ["Magnetism", "Friction", "Gravity", "Inertia"], answerIndex: 2, category: "Science", difficulty: "easy" },
  { question: "Water is made of hydrogen and which other element?", options: ["Carbon", "Nitrogen", "Oxygen", "Helium"], answerIndex: 2, category: "Science", difficulty: "easy" },
  // World — sports
  { question: "How often is the FIFA World Cup held?", options: ["Every 2 years", "Every 3 years", "Every 4 years", "Every 5 years"], answerIndex: 2, category: "World Sports", difficulty: "easy" },
  { question: "In football, how many players does each team have on the pitch?", options: ["9", "10", "11", "12"], answerIndex: 2, category: "World Sports", difficulty: "easy" },
  { question: "Which country has won the most FIFA World Cups?", options: ["Germany", "Argentina", "Italy", "Brazil"], answerIndex: 3, category: "World Sports", difficulty: "medium" },
  { question: "In which sport would you perform a slam dunk?", options: ["Volleyball", "Basketball", "Tennis", "Badminton"], answerIndex: 1, category: "World Sports", difficulty: "easy" },
  // World — music & general
  { question: "Which artist is known as the 'King of Pop'?", options: ["Elvis Presley", "Michael Jackson", "Prince", "Freddie Mercury"], answerIndex: 1, category: "World Music", difficulty: "easy" },
  { question: "How many minutes are there in a full day?", options: ["1,240", "1,440", "1,640", "1,840"], answerIndex: 1, category: "General Knowledge", difficulty: "hard" },
  { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answerIndex: 3, category: "World Geography", difficulty: "easy" },
  { question: "Which instrument has 88 keys?", options: ["Guitar", "Piano", "Violin", "Organ"], answerIndex: 1, category: "World Music", difficulty: "hard" },
  { question: "What is 15 × 8?", options: ["110", "115", "120", "125"], answerIndex: 2, category: "General Knowledge", difficulty: "hard" },
  { question: "Which animal is the largest land mammal?", options: ["Hippopotamus", "Giraffe", "African elephant", "Rhinoceros"], answerIndex: 2, category: "Science", difficulty: "medium" },
  { question: "Which country is home to the kangaroo?", options: ["New Zealand", "South Africa", "Australia", "Brazil"], answerIndex: 2, category: "World Geography", difficulty: "easy" },
  { question: "What is the main language spoken in Brazil?", options: ["Spanish", "Portuguese", "French", "Italian"], answerIndex: 1, category: "World Geography", difficulty: "easy" },
  { question: "Which Ghanaian city is known as the Garden City?", options: ["Accra", "Kumasi", "Cape Coast", "Ho"], answerIndex: 1, category: "Ghana Geography", difficulty: "hard" },
  { question: "Which metal is liquid at room temperature?", options: ["Iron", "Mercury", "Copper", "Aluminium"], answerIndex: 1, category: "Science", difficulty: "hard" },
  { question: "How many colours are in a rainbow?", options: ["5", "6", "7", "8"], answerIndex: 2, category: "General Knowledge", difficulty: "easy" },
  // Hard — added Nov 2026 so every difficulty pool holds 15 questions
  { question: "Which Ghanaian author wrote the novel 'The Beautyful Ones Are Not Yet Born'?", options: ["Ayi Kwei Armah", "Chinua Achebe", "Wole Soyinka", "Ngugi wa Thiong'o"], answerIndex: 0, category: "Ghana Culture", difficulty: "hard" },
  { question: "What is the chemical symbol for tungsten?", options: ["Tn", "W", "Tu", "Tg"], answerIndex: 1, category: "Science", difficulty: "hard" },
  { question: "In which year was the University of Ghana founded?", options: ["1948", "1951", "1957", "1960"], answerIndex: 0, category: "Ghana History", difficulty: "hard" },
  { question: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], answerIndex: 1, category: "Science", difficulty: "hard" },
  { question: "What is the capital of Burkina Faso?", options: ["Bamako", "Niamey", "Ouagadougou", "Lome"], answerIndex: 2, category: "World Geography", difficulty: "hard" },
  { question: "Who composed the 'Messiah' oratorio?", options: ["Bach", "Handel", "Vivaldi", "Mozart"], answerIndex: 1, category: "World Music", difficulty: "hard" },
  { question: "Which element has the atomic number 79?", options: ["Silver", "Gold", "Platinum", "Mercury"], answerIndex: 1, category: "Science", difficulty: "hard" },
];

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "owner@royale.gold" },
    update: { name: "Royale Owner", role: "owner", active: true, country: "GH", currency: "GHS" },
    create: {
      name: "Royale Owner",
      email: "owner@royale.gold",
      passwordHash: await bcrypt.hash("owner123", 10),
      role: "owner",
      country: "GH",
      currency: "GHS",
    },
  });
  console.log("Owner:", owner.email);

  const admin = await prisma.user.upsert({
    where: { email: "admin@royale.gold" },
    update: { name: "Royale Admin", role: "admin", commissionPct: 10, active: true, country: "GH", currency: "GHS" },
    create: {
      name: "Royale Admin",
      email: "admin@royale.gold",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "admin",
      commissionPct: 10,
      country: "GH",
      currency: "GHS",
    },
  });
  console.log("Admin:", admin.email, "commission 10%");

  // Phase 1 country-based (Nov 2026): per-currency platform rules.
  // GHS is the live currency; NGN is seeded ENABLED for demo at 100x
  // the GHS values (same "effort") — Chuks sets his own numbers in the
  // owner panel. These are NOT the 7UP limits (a different product).
  for (const row of [
    { currency: "GHS", symbol: "GH₵", minDeposit: 1, minStake: 1, conversionRate: 5, decayStep: 100, withdrawalOwnerThreshold: 500, enabled: true },
    { currency: "NGN", symbol: "₦", minDeposit: 100, minStake: 100, conversionRate: 500, decayStep: 10000, withdrawalOwnerThreshold: 50000, enabled: true },
  ]) {
    await prisma.currencyConfig.upsert({
      where: { currency: row.currency },
      update: { symbol: row.symbol, enabled: row.enabled },
      create: row,
    });
  }
  console.log("CurrencyConfig: GHS + NGN seeded");

  await prisma.referralCode.upsert({
    where: { code: "RG-DEMO1" },
    update: { adminId: admin.id, active: true },
    create: { code: "RG-DEMO1", adminId: admin.id, active: true },
  });
  console.log("Code: RG-DEMO1");

  const existing = await prisma.triviaQuestion.count();
  if (existing === 0) {
    await prisma.triviaQuestion.createMany({ data: TRIVIA });
    console.log(`Trivia bank seeded: ${TRIVIA.length} questions`);
  } else {
    console.log(`Trivia bank already has ${existing} questions — skipped`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
