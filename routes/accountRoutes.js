import express from "express";

import {
  addAccount,
  archiveSingleAccount,
  editAccount,
  getAccountActivityLog,
  getAccountBalance,
  getAllAccounts,
  getSingleAccount,
  makeDefaultAccount,
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

export default router;
