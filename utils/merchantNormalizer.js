/**
 * Known canonical merchants dictionary mapping lowercased keywords to clean brand names.
 */
const CANONICAL_MERCHANTS = [
  // Food & Dining
  { match: ["swiggy", "swgy"], clean: "Swiggy" },
  { match: ["zomato", "zom"], clean: "Zomato" },
  { match: ["starbucks"], clean: "Starbucks" },
  { match: ["mcdonalds", "mcdonald", "mcd"], clean: "McDonald's" },
  { match: ["dominos", "domino"], clean: "Domino's" },
  { match: ["pizzahut", "pizza hut"], clean: "Pizza Hut" },
  { match: ["kfc"], clean: "KFC" },
  { match: ["subway"], clean: "Subway" },
  { match: ["burger king", "burgerking"], clean: "Burger King" },
  { match: ["blinkit", "grofers"], clean: "Blinkit" },
  { match: ["zepto"], clean: "Zepto" },
  { match: ["instamart"], clean: "Instamart" },

  // Shopping & Retail
  { match: ["amazon", "amzn", "amazon pay"], clean: "Amazon" },
  { match: ["flipkart", "fkrt"], clean: "Flipkart" },
  { match: ["myntra"], clean: "Myntra" },
  { match: ["ajio"], clean: "Ajio" },
  { match: ["nykaa"], clean: "Nykaa" },
  { match: ["zara"], clean: "Zara" },
  { match: ["meesho"], clean: "Meesho" },
  { match: ["tatacliq", "tata cliq"], clean: "Tata CLiQ" },
  { match: ["croma"], clean: "Croma" },
  { match: ["reliance digital"], clean: "Reliance Digital" },
  { match: ["apple"], clean: "Apple" },
  { match: ["google"], clean: "Google" },

  // Transport & Travel
  { match: ["uber"], clean: "Uber" },
  { match: ["ola", "olacabs"], clean: "Ola" },
  { match: ["rapido"], clean: "Rapido" },
  { match: ["irctc"], clean: "IRCTC" },
  { match: ["makemytrip", "mmt"], clean: "MakeMyTrip" },
  { match: ["goibibo"], clean: "Goibibo" },
  { match: ["redbus"], clean: "RedBus" },
  { match: ["metro"], clean: "Metro" },
  { match: ["indigo"], clean: "IndiGo" },
  { match: ["air india", "airindia"], clean: "Air India" },

  // Bills & Utilities
  { match: ["bescom"], clean: "BESCOM" },
  { match: ["tata power"], clean: "Tata Power" },
  { match: ["adani"], clean: "Adani Electricity" },
  { match: ["airtel"], clean: "Airtel" },
  { match: ["jio"], clean: "Jio" },
  { match: ["vodafone", "idea", "vi "], clean: "Vi" },
  { match: ["act fibernet", "act broadband"], clean: "ACT Fibernet" },
  { match: ["tatasky", "tata play"], clean: "Tata Play" },

  // Entertainment
  { match: ["netflix"], clean: "Netflix" },
  { match: ["spotify"], clean: "Spotify" },
  { match: ["bookmyshow", "bms"], clean: "BookMyShow" },
  { match: ["hotstar", "disney"], clean: "Disney+ Hotstar" },
  { match: ["prime video", "primevideo"], clean: "Prime Video" },
  { match: ["pvr"], clean: "PVR Cinemas" },
  { match: ["inox"], clean: "INOX Cinemas" },
  { match: ["youtube"], clean: "YouTube" },

  // Health
  { match: ["apollo", "apollo pharmacy"], clean: "Apollo Pharmacy" },
  { match: ["netmeds"], clean: "Netmeds" },
  { match: ["1mg", "tata 1mg"], clean: "Tata 1mg" },
  { match: ["pharmeasy"], clean: "PharmEasy" },
  { match: ["medplus"], clean: "MedPlus" },

  // Groceries
  { match: ["bigbasket"], clean: "BigBasket" },
  { match: ["dmart", "d-mart"], clean: "DMart" },
  { match: ["nature's basket", "natures basket"], clean: "Nature's Basket" },
  { match: ["reliance fresh", "reliance smart"], clean: "Reliance Smart" },
];

/**
 * Noise words and suffixes to strip from merchant strings.
 */
const NOISE_PREFIXES = [
  /^upi\//i,
  /^pos\s*(?:\d+\*?)?/i,
  /^ecom\s*/i,
  /^neft\//i,
  /^imps\//i,
  /^info\s*:\s*/i,
  /^vpa\s*/i,
  /^payto\s*/i,
];

const NOISE_SUFFIXES = [
  /\b(?:pvt|private)\s*(?:ltd|limited)\b/i,
  /\b(?:ltd|limited|inc|llc|llp)\b/i,
  /\b(?:india|corp|corporation)\b/i,
  /\b(?:payments|gateway|marketplace|mktp)\b/i,
  /\b(?:bangalore|mumbai|new delhi|delhi|gurgaon|noida|chennai|hyderabad|pune|kolkata)\b/i,
  /@(?:okaxis|okhdfcbank|okicici|oksbi|paytm|upi|ybl|apl|axl|ibl|barodampay)\b/i,
  /\b\d{4,}\b/, // Standalone terminal or reference codes
];

/**
 * Converts text to title casing.
 */
const toTitleCase = (str) =>
  str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");

/**
 * Normalizes a raw merchant string into a clean, canonical business name.
 * 
 * @param {string} rawMerchant - The raw merchant string extracted from SMS or transaction
 * @returns {{ raw: string, clean: string }} Object containing both raw and clean merchant names
 */
export const normalizeMerchant = (rawMerchant = "") => {
  const original = String(rawMerchant || "").trim();
  if (!original) {
    return { raw: "", clean: "Merchant" };
  }

  const lower = original.toLowerCase();

  // 1. Check dictionary of known canonical merchants
  for (const item of CANONICAL_MERCHANTS) {
    for (const token of item.match) {
      if (lower.includes(token)) {
        return { raw: original, clean: item.clean };
      }
    }
  }

  // 2. Strip noise prefixes
  let cleaned = original;
  for (const prefix of NOISE_PREFIXES) {
    cleaned = cleaned.replace(prefix, "");
  }

  // 3. Strip noise suffixes
  for (const suffix of NOISE_SUFFIXES) {
    cleaned = cleaned.replace(suffix, "");
  }

  // 4. Strip punctuation symbols except spaces and dots
  cleaned = cleaned.replace(/[^\w\s.-]/g, " ").replace(/\s+/g, " ").trim();

  // 5. Final fallback cleanup
  if (cleaned.length < 2 || /^\d+$/.test(cleaned)) {
    cleaned = original;
  }

  if (cleaned.length > 50) {
    cleaned = cleaned.slice(0, 50).trim();
  }

  return {
    raw: original,
    clean: toTitleCase(cleaned),
  };
};

export default {
  normalizeMerchant,
};
