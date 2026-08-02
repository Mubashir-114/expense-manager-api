import {
  getDashboardSummary,
  getMonthlySummary,
  getExpenseByCategory,
  getRecentTransactions,
} from "../models/dashboardModel.js";

import asyncHandler from "../utils/asyncHandler.js";

export const dashboard = asyncHandler(async (req, res) => {
  const summary = await getDashboardSummary(req.user.id);

  res.json({
    success: true,
    message: "Dashboard summary fetched",
    data: summary,
  });
});

export const monthlySummary = asyncHandler(async (req, res) => {
  const data = await getMonthlySummary(req.user.id);

  res.json({
    success: true,
    message: "Monthly summary fetched",
    data,
  });
});

export const categorySummary = asyncHandler(async (req, res) => {
  const data = await getExpenseByCategory(req.user.id);

  res.json({
    success: true,
    message: "Category summary fetched",
    data,
  });
});

export const recentTransactions = asyncHandler(async (req, res) => {
  const data = await getRecentTransactions(req.user.id);

  res.json({
    success: true,
    message: "Recent transactions fetched",
    data,
  });
});
