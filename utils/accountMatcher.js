/**
 * Matches SMS account indicators to owned user accounts with strict safety and ambiguity detection.
 * Never associates an account based on guesses alone.
 * 
 * @param {Object} params
 * @param {string|null} params.maskedAccountHint - Extracted 4-digit account number (e.g. "1234")
 * @param {string|null} params.bank - Extracted bank name (e.g. "HDFC", "SBI")
 * @param {string} params.classification - Transaction classification ('expense', 'credit_card_purchase', etc.)
 * @param {Array} params.userAccounts - Active accounts owned by the user
 * @returns {{
 *   suggestedAccountId: number|null,
 *   isAmbiguous: boolean,
 *   matchConfidence: number,
 *   candidateAccountIds: number[],
 *   reason: string
 * }}
 */
export const matchAccount = ({
  maskedAccountHint = null,
  bank = null,
  classification = "expense",
  userAccounts = [],
}) => {
  const activeAccounts = userAccounts.filter((a) => !a.status || a.status === "active");

  if (activeAccounts.length === 0) {
    return {
      suggestedAccountId: null,
      isAmbiguous: false,
      matchConfidence: 0.0,
      candidateAccountIds: [],
      reason: "No active accounts found for user",
    };
  }

  const isCreditCardTx = [
    "credit_card_purchase",
    "credit_card_repayment",
  ].includes(classification);

  // 1. Match by masked last 4 digits
  if (maskedAccountHint && /^[0-9]{4}$/.test(maskedAccountHint)) {
    let matches = activeAccounts.filter(
      (a) => a.masked_last4 === maskedAccountHint,
    );

    // If credit card transaction, narrow down to credit_card accounts if any match
    if (isCreditCardTx && matches.some((a) => a.type === "credit_card")) {
      matches = matches.filter((a) => a.type === "credit_card");
    }

    if (matches.length === 1) {
      const match = matches[0];
      return {
        suggestedAccountId: match.id,
        isAmbiguous: false,
        matchConfidence: 0.95,
        candidateAccountIds: [match.id],
        reason: `Matched account ending in ${maskedAccountHint} (${match.display_name})`,
      };
    }

    if (matches.length > 1) {
      return {
        suggestedAccountId: null,
        isAmbiguous: true,
        matchConfidence: 0.40,
        candidateAccountIds: matches.map((a) => a.id),
        reason: `Multiple owned accounts end in ${maskedAccountHint} (Ambiguous); user review required`,
      };
    }
  }

  // 2. Fallback: match by bank / institution name
  if (bank && bank !== "Unknown") {
    const bankLower = bank.toLowerCase();
    let instMatches = activeAccounts.filter((a) => {
      const inst = String(a.institution_name || "").toLowerCase();
      return inst.includes(bankLower) || bankLower.includes(inst);
    });

    if (isCreditCardTx && instMatches.some((a) => a.type === "credit_card")) {
      instMatches = instMatches.filter((a) => a.type === "credit_card");
    }

    if (instMatches.length === 1) {
      // Suggest the account but mark ambiguous so it requires user verification
      return {
        suggestedAccountId: instMatches[0].id,
        isAmbiguous: true,
        matchConfidence: 0.65,
        candidateAccountIds: [instMatches[0].id],
        reason: `Suggested by bank '${bank}' (${instMatches[0].display_name}); requires confirmation`,
      };
    }

    if (instMatches.length > 1) {
      return {
        suggestedAccountId: null,
        isAmbiguous: true,
        matchConfidence: 0.35,
        candidateAccountIds: instMatches.map((a) => a.id),
        reason: `Multiple accounts match bank '${bank}'; please select account`,
      };
    }
  }

  // 3. No match found
  return {
    suggestedAccountId: null,
    isAmbiguous: false,
    matchConfidence: 0.0,
    candidateAccountIds: [],
    reason: "No account hint identified in message",
  };
};

export default {
  matchAccount,
};
