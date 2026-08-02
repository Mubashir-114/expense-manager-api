import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  addTransaction,
  getAllTransactions,
  getSingleTransaction,
  editTransaction,
  removeTransaction,
  importSmsTransactions,
  getImportedSmsHashes,
} from "../controllers/transactionController.js";

import {
  transactionValidation,
  transactionIdValidation,
  transactionQueryValidation,
  importSmsValidation,
} from "../validators/transactionValidation.js";

import validate from "../middleware/validate.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", transactionValidation, validate, addTransaction);

router.post("/import-sms", importSmsValidation, validate, importSmsTransactions);

router.get("/", transactionQueryValidation, validate, getAllTransactions);

router.get("/imported-hashes", getImportedSmsHashes);

router.get("/:id", transactionIdValidation, validate, getSingleTransaction);

router.put(
  "/:id",
  transactionIdValidation,
  transactionValidation,
  validate,
  editTransaction,
);

router.delete("/:id", transactionIdValidation, validate, removeTransaction);

export default router;
