import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  detectTransactions,
  getAllDetectedTransactions,
  getSingleDetectedTransaction,
  editDetectedTransaction,
  confirmTransaction,
  rejectTransaction,
  batchConfirm,
  batchReject,
} from "../controllers/smartTransactionController.js";
import {
  detectValidation,
  smartTxIdValidation,
  updateSmartTxValidation,
  confirmSmartTxValidation,
  rejectSmartTxValidation,
  batchConfirmValidation,
  batchRejectValidation,
  smartTxQueryValidation,
} from "../validators/smartTransactionValidation.js";

const router = express.Router();

router.use(authMiddleware);

// Detect & classify SMS transactions
router.post("/detect", detectValidation, validate, detectTransactions);

// Batch operations
router.post("/batch/confirm", batchConfirmValidation, validate, batchConfirm);
router.post("/batch/reject", batchRejectValidation, validate, batchReject);

// Query detected transactions
router.get("/", smartTxQueryValidation, validate, getAllDetectedTransactions);

// Single transaction operations
router.get("/:id", smartTxIdValidation, validate, getSingleDetectedTransaction);
router.put("/:id", smartTxIdValidation, updateSmartTxValidation, validate, editDetectedTransaction);
router.post("/:id/confirm", smartTxIdValidation, confirmSmartTxValidation, validate, confirmTransaction);
router.post("/:id/reject", smartTxIdValidation, rejectSmartTxValidation, validate, rejectTransaction);

export default router;
