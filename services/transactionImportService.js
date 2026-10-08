import {
  getCategories,
  getTransactionByHash,
  createSmsTransaction,
} from "../models/transactionModel.js";
import logger, { getSafeErrorDetails } from "../utils/logger.js";

export const isDuplicateSmsHash = (error) =>
  error?.code === "ER_DUP_ENTRY" &&
  `${error.message || ""} ${error.sqlMessage || ""}`.includes(
    "uq_transaction_sms_hash",
  );

class TransactionImportService {
  /**
   * Imports a batch of SMS parsed transactions.
   * Prevents duplicate imports using the unique `sms_hash` parameter.
   * 
   * @param {number} userId - The authenticated user's ID
   * @param {Array} transactions - The array of parsed transaction objects from the client
   * @returns {Promise<Object>} Summary of imported, skipped, and failed counts
   */
  static async importSmsTransactions(userId, transactions) {
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    // Fetch all categories from database to perform fast in-memory lookups
    const allCategories = await getCategories();

    for (const tx of transactions) {
      try {
        const {
          amount,
          type,
          merchant,
          bank,
          category,
          date,
          sender,
          reference,
          sms_hash,
          message,
        } = tx;

        // 1. Uniqueness check
        const existingTx = await getTransactionByHash(userId, sms_hash);
        if (existingTx) {
          skipped++;
          logger.info("Skipping duplicate SMS transaction.");
          continue;
        }

        // 2. Category resolution
        // Find category matching the name (case-insensitive) and the type (income vs expense)
        let resolvedCategory = allCategories.find(
          (c) =>
            c.name.toLowerCase() === category.toLowerCase() &&
            c.type === type,
        );

        // Fallback categorization if not matched
        if (!resolvedCategory) {
          if (type === "income") {
            // Find "Salary" or default to the first income category
            resolvedCategory = allCategories.find(
              (c) => c.name.toLowerCase() === "salary" && c.type === "income",
            ) || allCategories.find((c) => c.type === "income");
          } else {
            // Find "Other" or default to the first expense category
            resolvedCategory = allCategories.find(
              (c) => c.name.toLowerCase() === "other" && c.type === "expense",
            ) || allCategories.find((c) => c.type === "expense");
          }
        }

        const categoryId = resolvedCategory ? resolvedCategory.id : null;
        if (!categoryId) {
          throw new Error(`Could not resolve category ID for type: ${type}`);
        }

        // 3. Insert transaction
        // Use merchant name as the title, message body as note
        await createSmsTransaction(
          userId,
          categoryId,
          type,
          merchant, // Title
          amount,
          date,
          message, // Note
          sms_hash,
          sender,
          bank,
          reference || null,
        );

        imported++;
      } catch (error) {
        if (isDuplicateSmsHash(error)) {
          skipped++;
          logger.info("Skipping duplicate SMS transaction.");
          continue;
        }

        failed++;
        logger.error({
          message: "Failed to import SMS transaction",
          ...getSafeErrorDetails(error),
        });
      }
    }

    logger.info(
      `SMS import complete: imported=${imported}, skipped=${skipped}, failed=${failed}`,
    );

    return {
      imported,
      skipped,
      failed,
    };
  }
}

export default TransactionImportService;
