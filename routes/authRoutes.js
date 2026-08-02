import express from "express";

import { register, login, getProfile } from "../controllers/authController.js";

import {
  registerValidation,
  loginValidation,
} from "../validators/authValidation.js";

import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";

const router = express.Router();

router.post("/register", registerValidation, validate, register);

router.post("/login", loginValidation, validate, login);

router.get("/me", authMiddleware, getProfile);

export default router;
