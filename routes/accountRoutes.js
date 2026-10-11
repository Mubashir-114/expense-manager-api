import express from "express";

import {
  addAccount,
  archiveSingleAccount,
  editAccount,
  getAllAccounts,
  getSingleAccount,
  makeDefaultAccount,
} from "../controllers/accountController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  accountCreateValidation,
  accountIdValidation,
  accountQueryValidation,
  accountUpdateValidation,
} from "../validators/accountValidation.js";

const router = express.Router();

router.use(authMiddleware);
router.post("/", accountCreateValidation, validate, addAccount);
router.get("/", accountQueryValidation, validate, getAllAccounts);
router.get("/:id", accountIdValidation, validate, getSingleAccount);
router.put("/:id", accountIdValidation, accountUpdateValidation, validate, editAccount);
router.put("/:id/default", accountIdValidation, validate, makeDefaultAccount);
router.put("/:id/archive", accountIdValidation, validate, archiveSingleAccount);

export default router;
