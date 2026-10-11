import {
  getDashboardAnalytics,
  getMonthlySummary,
  getExpenseByCategory,
  getRecentTransactions,
  getDashboardAccountsData,
} from "../models/dashboardModel.js";

import asyncHandler from "../utils/asyncHandler.js";

export const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboardAnalytics(req.user.id, req.query);

  res.json({
    success: true,
    message: "Dashboard summary fetched",
    data,
  });
});

export const dashboardOverview = asyncHandler(async (req, res) => {
  const data = await getDashboardAnalytics(req.user.id, req.query);

  res.json({
    success: true,
    message: "Dashboard overview fetched",
    data,
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
  const data = await getExpenseByCategory(req.user.id, req.query);

  res.json({
    success: true,
    message: "Category summary fetched",
    data,
  });
});

export const recentTransactions = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const data = await getRecentTransactions(req.user.id, limit);

  res.json({
    success: true,
    message: "Recent transactions fetched",
    data,
  });
});

export const dashboardInsights = asyncHandler(async (req, res) => {
  const data = await getDashboardAnalytics(req.user.id, req.query);

  res.json({
    success: true,
    message: "Dashboard insights fetched",
    data: data.insights,
  });
});

export const accountsOverview = asyncHandler(async (req, res) => {
  const data = await getDashboardAccountsData(req.user.id);

  res.json({
    success: true,
    message: "Accounts overview fetched",
    data,
  });
});
