import {
  createBudget,
  getBudgets,
  getBudgetById,
  updateBudget,
  deleteBudget,
  categoryExists,
  budgetExists,
  getBudgetStatus,
} from "../models/budgetModel.js";

import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";

const validateBudgetCategory = async (categoryId) => {
  const category = await categoryExists(categoryId);

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  if (category.type !== "expense") {
    throw new AppError("Budgets can only be created for expense categories", 400);
  }

  return category;
};

export const addBudget = asyncHandler(async (req, res) => {
  const { categoryId, amount, month, year } = req.body;

  await validateBudgetCategory(categoryId);

  const existingBudget = await budgetExists(
    req.user.id,
    categoryId,
    month,
    year,
  );

  if (existingBudget) {
    throw new AppError(
      "Budget already exists for this category, month, and year",
      409,
    );
  }

  const budgetId = await createBudget(
    req.user.id,
    categoryId,
    amount,
    month,
    year,
  );

  const budget = await getBudgetById(budgetId, req.user.id);

  res.status(201).json({
    success: true,
    message: "Budget created",
    data: {
      budget,
    },
  });
});

export const getAllBudgets = asyncHandler(async (req, res) => {
  const budgets = await getBudgets(req.user.id, req.query);

  res.json({
    success: true,
    message: "Budgets fetched",
    data: {
      budgets,
    },
  });
});

export const getSingleBudget = asyncHandler(async (req, res) => {
  const budget = await getBudgetById(req.params.id, req.user.id);

  if (!budget) {
    throw new AppError("Budget not found", 404);
  }

  res.json({
    success: true,
    message: "Budget fetched",
    data: {
      budget,
    },
  });
});

export const editBudget = asyncHandler(async (req, res) => {
  const budget = await getBudgetById(req.params.id, req.user.id);

  if (!budget) {
    throw new AppError("Budget not found", 404);
  }

  const { categoryId, amount, month, year } = req.body;

  await validateBudgetCategory(categoryId);

  const existingBudget = await budgetExists(
    req.user.id,
    categoryId,
    month,
    year,
    req.params.id,
  );

  if (existingBudget) {
    throw new AppError(
      "Budget already exists for this category, month, and year",
      409,
    );
  }

  await updateBudget(req.params.id, req.user.id, categoryId, amount, month, year);

  const updatedBudget = await getBudgetById(req.params.id, req.user.id);

  res.json({
    success: true,
    message: "Budget updated",
    data: {
      budget: updatedBudget,
    },
  });
});

export const removeBudget = asyncHandler(async (req, res) => {
  const deleted = await deleteBudget(req.params.id, req.user.id);

  if (!deleted) {
    throw new AppError("Budget not found", 404);
  }

  res.json({
    success: true,
    message: "Budget deleted",
    data: null,
  });
});

export const budgetStatus = asyncHandler(async (req, res) => {
  const date = new Date();
  const month = req.query.month || date.getMonth() + 1;
  const year = req.query.year || date.getFullYear();

  const budgets = await getBudgetStatus(req.user.id, month, year);

  res.json({
    success: true,
    message: "Budget status fetched",
    data: {
      month: Number(month),
      year: Number(year),
      budgets,
    },
  });
});
