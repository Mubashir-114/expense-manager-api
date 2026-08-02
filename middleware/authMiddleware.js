import jwt from "jsonwebtoken";

import { findUserById } from "../models/userModel.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";

const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Access denied. No token provided.", 401);
  }

  const token = authHeader.split(" ")[1];

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const user = await findUserById(decoded.id);

  if (!user) {
    throw new AppError("User not found.", 401);
  }

  req.user = user;

  next();
});

export default authMiddleware;
