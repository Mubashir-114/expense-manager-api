import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  addBudget,
  getAllBudgets,
  getSingleBudget,
  editBudget,
  removeBudget,
  budgetStatus,
} from "../controllers/budgetController.js";

import {
  budgetValidation,
  budgetIdValidation,
  budgetQueryValidation,
  budgetStatusValidation,
} from "../validators/budgetValidation.js";

import validate from "../middleware/validate.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", budgetValidation, validate, addBudget);

router.get("/", budgetQueryValidation, validate, getAllBudgets);

router.get("/status", budgetStatusValidation, validate, budgetStatus);

router.get("/:id", budgetIdValidation, validate, getSingleBudget);

router.put("/:id", budgetIdValidation, budgetValidation, validate, editBudget);

router.delete("/:id", budgetIdValidation, validate, removeBudget);

export default router;
