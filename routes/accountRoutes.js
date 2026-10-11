import express from "express";

import {
  addAccount,
  archiveSingleAccount,
  editAccount,
  getAccountActivityLog,
  getAccountBalance,
  getAllAccounts,
  getCreditCardInfo,
  getCreditCardPayments,
  getSingleAccount,
  makeDefaultAccount,
  repayCreditCardAccount,
  updateBillingSettings,
} from "../controllers/accountController.js";
import {
  addAdjustment,
  getAccountAdjustments,
} from "../controllers/adjustmentController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  accountCreateValidation,
  accountIdValidation,
  accountQueryValidation,
  accountUpdateValidation,
  billingUpdateValidation,
  paymentQueryValidation,
  repaymentCreateValidation,
} from "../validators/accountValidation.js";
import {
  adjustmentCreateValidation,
  adjustmentQueryValidation,
} from "../validators/adjustmentValidation.js";

const router = express.Router();

router.use(authMiddleware);
router.post("/", accountCreateValidation, validate, addAccount);
router.get("/", accountQueryValidation, validate, getAllAccounts);
router.get("/:id", accountIdValidation, validate, getSingleAccount);
router.put("/:id", accountIdValidation, accountUpdateValidation, validate, editAccount);
router.put("/:id/default", accountIdValidation, validate, makeDefaultAccount);
router.put("/:id/archive", accountIdValidation, validate, archiveSingleAccount);
router.get("/:id/balance", accountIdValidation, validate, getAccountBalance);
router.get("/:id/activity", accountIdValidation, validate, getAccountActivityLog);
router.post("/:id/adjustments", accountIdValidation, adjustmentCreateValidation, validate, addAdjustment);
router.get("/:id/adjustments", adjustmentQueryValidation, validate, getAccountAdjustments);

// Credit card management routes (Phase 3A.4)
router.get("/:id/credit-card", accountIdValidation, validate, getCreditCardInfo);
router.put("/:id/billing", accountIdValidation, billingUpdateValidation, validate, updateBillingSettings);
router.post("/:id/repay", accountIdValidation, repaymentCreateValidation, validate, repayCreditCardAccount);
router.get("/:id/payments", accountIdValidation, paymentQueryValidation, validate, getCreditCardPayments);

export default router;
