/**
 * Category detection rules with confidence scoring and explainable reasons.
 */

const CATEGORY_RULES = [
  // 1. Food
  {
    categoryName: "Food",
    type: "expense",
    merchants: [
      "swiggy", "zomato", "starbucks", "mcdonald's", "domino's",
      "pizza hut", "kfc", "subway", "burger king", "blinkit",
      "zepto", "instamart", "dunkin", "haldiram", "chai point", "chaayos"
    ],
    keywords: [
      "food", "restaurant", "cafe", "dining", "bakery", "kitchen",
      "eats", "coffee", "bites", "sweet", "barbeque", "dhaba", "pizza", "burger"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched food & dining merchant: ${m}`,
  },

  // 2. Transport
  {
    categoryName: "Transport",
    type: "expense",
    merchants: [
      "uber", "ola", "rapido", "metro", "redbus"
    ],
    keywords: [
      "cab", "taxi", "ride", "auto", "petrol", "diesel", "fuel",
      "hpcl", "bpcl", "iocl", "shell", "fastag", "toll", "parking"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched transport merchant or transit provider: ${m}`,
  },

  // 3. Travel
  {
    categoryName: "Travel",
    type: "expense",
    merchants: [
      "irctc", "makemytrip", "goibibo", "indigo", "air india"
    ],
    keywords: [
      "flight", "airline", "train", "railway", "hotel", "resort",
      "homestay", "booking.com", "cleartrip", "yatra", "travel"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched travel or ticketing provider: ${m}`,
  },

  // 4. Utilities
  {
    categoryName: "Utilities",
    type: "expense",
    merchants: [
      "bescom", "tata power", "adani electricity", "airtel", "jio",
      "vi", "act fibernet", "tata play"
    ],
    keywords: [
      "electricity", "water", "gas", "broadband", "fibernet",
      "recharge", "dth", "bill payment", "utility", "postpaid", "prepaid"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched utility or telecom provider: ${m}`,
  },

  // 5. Entertainment
  {
    categoryName: "Entertainment",
    type: "expense",
    merchants: [
      "netflix", "spotify", "bookmyshow", "disney+ hotstar",
      "prime video", "pvr cinemas", "inox cinemas", "youtube"
    ],
    keywords: [
      "cinema", "movie", "theater", "theatre", "show", "concert",
      "streaming", "subscription", "gaming", "playstation", "steam"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched entertainment or streaming service: ${m}`,
  },

  // 6. Healthcare
  {
    categoryName: "Healthcare",
    type: "expense",
    merchants: [
      "apollo pharmacy", "netmeds", "tata 1mg", "pharmeasy", "medplus"
    ],
    keywords: [
      "pharmacy", "medical", "hospital", "clinic", "doctor",
      "diagnostic", "lab", "pathology", "chemist", "dentist", "medicine"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched healthcare provider or pharmacy: ${m}`,
  },

  // 7. Shopping
  {
    categoryName: "Shopping",
    type: "expense",
    merchants: [
      "amazon", "flipkart", "myntra", "ajio", "nykaa", "zara",
      "meesho", "tata cliq", "croma", "reliance digital", "apple", "google"
    ],
    keywords: [
      "shopping", "store", "retail", "mart", "mall", "clothing",
      "apparel", "footwear", "fashion", "electronics", "supermarket"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.80,
    reasonTemplate: (m) => `Matched retail or shopping merchant: ${m}`,
  },

  // 8. Education
  {
    categoryName: "Education",
    type: "expense",
    merchants: [
      "coursera", "udemy", "unacademy", "byjus"
    ],
    keywords: [
      "tuition", "school", "college", "university", "institute",
      "academy", "course", "education", "fees", "books", "library"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.85,
    reasonTemplate: (m) => `Matched education or learning service: ${m}`,
  },

  // 9. Housing
  {
    categoryName: "Housing",
    type: "expense",
    merchants: [
      "nobroker", "housing.com"
    ],
    keywords: [
      "rent", "society", "maintenance", "landlord", "apartment"
    ],
    merchantConfidence: 0.90,
    keywordConfidence: 0.80,
    reasonTemplate: (m) => `Matched housing or rent indicator: ${m}`,
  },

  // 10. Salary
  {
    categoryName: "Salary",
    type: "income",
    merchants: [],
    keywords: [
      "salary", "payroll", "stipend", "wages", "allowance", "employer"
    ],
    merchantConfidence: 0.95,
    keywordConfidence: 0.90,
    reasonTemplate: () => "Detected salary credit notification",
  },
];

/**
 * Automatically predicts the appropriate category for a transaction.
 * 
 * @param {Object} params
 * @param {string} params.cleanMerchant - Clean normalized merchant name
 * @param {string} params.rawMessage - Full SMS body or description
 * @param {string} params.direction - 'debit' or 'credit' (or 'income'/'expense')
 * @param {Array} params.availableCategories - Categories list from database [{ id, name, type }]
 * @returns {{ categoryId: number|null, categoryName: string, confidence: number, reason: string }}
 */
export const predictCategory = ({
  cleanMerchant = "",
  rawMessage = "",
  direction = "debit",
  availableCategories = [],
}) => {
  const isIncome = direction === "credit" || direction === "income";
  const targetType = isIncome ? "income" : "expense";

  const merchantLower = cleanMerchant.toLowerCase();
  const messageLower = rawMessage.toLowerCase();

  // 1. Try matching rules of target type
  for (const rule of CATEGORY_RULES) {
    if (rule.type !== targetType) continue;

    // Check merchant matches
    for (const m of rule.merchants) {
      if (merchantLower.includes(m) || messageLower.includes(m)) {
        let found = availableCategories.find(
          (c) => c.name.toLowerCase() === rule.categoryName.toLowerCase() && c.type === targetType,
        );
        if (!found) {
          found = availableCategories.find(
            (c) => (c.name.toLowerCase().includes(rule.categoryName.toLowerCase()) || rule.categoryName.toLowerCase().includes(c.name.toLowerCase())) && c.type === targetType,
          ) || availableCategories.find((c) => c.type === targetType);
        }
        return {
          categoryId: found ? found.id : null,
          categoryName: found ? found.name : rule.categoryName,
          confidence: rule.merchantConfidence,
          reason: rule.reasonTemplate(cleanMerchant || m),
        };
      }
    }

    // Check keyword matches
    for (const kw of rule.keywords) {
      if (merchantLower.includes(kw) || messageLower.includes(kw)) {
        let found = availableCategories.find(
          (c) => c.name.toLowerCase() === rule.categoryName.toLowerCase() && c.type === targetType,
        );
        if (!found) {
          found = availableCategories.find(
            (c) => (c.name.toLowerCase().includes(rule.categoryName.toLowerCase()) || rule.categoryName.toLowerCase().includes(c.name.toLowerCase())) && c.type === targetType,
          ) || availableCategories.find((c) => c.type === targetType);
        }
        return {
          categoryId: found ? found.id : null,
          categoryName: found ? found.name : rule.categoryName,
          confidence: rule.keywordConfidence,
          reason: `Matched keyword '${kw}' for ${rule.categoryName}`,
        };
      }
    }
  }

  // 2. Default fallback
  const fallbackName = isIncome ? "Other Income" : "Other Expense";
  const fallbackCategory = availableCategories.find(
    (c) => c.name.toLowerCase() === fallbackName.toLowerCase() && c.type === targetType,
  ) || availableCategories.find((c) => c.type === targetType);

  return {
    categoryId: fallbackCategory ? fallbackCategory.id : null,
    categoryName: fallbackCategory ? fallbackCategory.name : fallbackName,
    confidence: 0.50,
    reason: `Default fallback for ${targetType}`,
  };
};

export default {
  predictCategory,
};
