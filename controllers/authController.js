import bcrypt from "bcrypt";

import { createUser, findUserByEmail } from "../models/userModel.js";
import generateToken from "../utils/generateToken.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new AppError("Email already exists", 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const userId = await createUser(name, email, hashedPassword);

  const token = generateToken(userId);

  res.status(201).json({
    success: true,
    message: "Registration successful",
    data: {
      token,
      user: {
        id: userId,
        name,
        email,
      },
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = generateToken(user.id);

  res.json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    },
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: "Profile fetched",
    data: {
      user: req.user,
    },
  });
});
