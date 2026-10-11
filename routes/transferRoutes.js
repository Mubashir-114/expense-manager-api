import express from "express";

import {
  addTransfer,
  getAllTransfers,
  getSingleTransfer,
} from "../controllers/transferController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  transferCreateValidation,
  transferIdValidation,
  transferQueryValidation,
} from "../validators/transferValidation.js";

const router = express.Router();

router.use(authMiddleware);
router.post("/", transferCreateValidation, validate, addTransfer);
router.get("/", transferQueryValidation, validate, getAllTransfers);
router.get("/:id", transferIdValidation, validate, getSingleTransfer);

export default router;
