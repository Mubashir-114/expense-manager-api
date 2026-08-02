import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  getSummary,
  getMonthly,
  getCategory,
  getTrends,
  getCashflow,
  exportReport,
} from "../controllers/reportController.js";
import { reportValidation, exportValidation } from "../validators/reportValidation.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/summary", reportValidation, validate, getSummary);
router.get("/monthly", reportValidation, validate, getMonthly);
router.get("/category", reportValidation, validate, getCategory);
router.get("/trends", reportValidation, validate, getTrends);
router.get("/cashflow", reportValidation, validate, getCashflow);
router.get("/export", exportValidation, validate, exportReport);

export default router;
