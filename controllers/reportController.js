import asyncHandler from "../utils/asyncHandler.js";
import AppError from "../utils/AppError.js";
import {
  getReportSummary,
  getMonthlyReport,
  getCategoryReport,
  getTrendsReport,
  getCashflowReport,
  getExportData,
} from "../models/reportModel.js";

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await getReportSummary(req.user.id, req.query);

  const totalIncome = Number(summary.totalIncome);
  const totalExpense = Number(summary.totalExpense);
  const netBalance = Number((totalIncome - totalExpense).toFixed(2));
  const savingsRate = totalIncome > 0 ? Number(((netBalance / totalIncome) * 100).toFixed(2)) : 0;
  const totalTransactions = Number(summary.totalTransactions);

  res.json({
    success: true,
    message: "Report summary fetched",
    data: {
      totalIncome,
      totalExpense,
      netBalance,
      savingsRate,
      totalTransactions,
    },
  });
});

export const getMonthly = asyncHandler(async (req, res) => {
  const rows = await getMonthlyReport(req.user.id, req.query);

  const data = rows.map((row) => ({
    year: Number(row.year),
    month: Number(row.month),
    monthName: row.monthName,
    income: Number(row.income),
    expense: Number(row.expense),
    balance: Number((Number(row.income) - Number(row.expense)).toFixed(2)),
  }));

  res.json({
    success: true,
    message: "Monthly report fetched",
    data,
  });
});

export const getCategory = asyncHandler(async (req, res) => {
  const rows = await getCategoryReport(req.user.id, req.query);

  const data = rows.map((row) => {
    const budget = Number(row.budget);
    const spent = Number(row.spent);
    const remaining = Number((budget - spent).toFixed(2));
    const percentage = budget > 0 ? Number(((spent / budget) * 100).toFixed(2)) : 0;

    return {
      categoryId: Number(row.categoryId),
      category: row.category,
      budget,
      spent,
      remaining,
      percentage,
    };
  });

  res.json({
    success: true,
    message: "Category report fetched",
    data,
  });
});

export const getTrends = asyncHandler(async (req, res) => {
  const rows = await getTrendsReport(req.user.id, req.query);

  const data = rows.map((row) => ({
    year: Number(row.year),
    month: Number(row.month),
    monthName: row.monthName,
    income: Number(row.income),
    expense: Number(row.expense),
  }));

  res.json({
    success: true,
    message: "Trends report fetched",
    data,
  });
});

export const getCashflow = asyncHandler(async (req, res) => {
  const rows = await getCashflowReport(req.user.id, req.query);

  let balance = 0;
  const data = rows.map((row) => {
    const amount = Number(row.amount);
    if (row.type === "income") {
      balance += amount;
    } else if (row.type === "expense") {
      balance -= amount;
    }

    return {
      id: Number(row.id),
      title: row.title,
      category: row.category,
      amount,
      type: row.type,
      date: row.date,
      runningBalance: Number(balance.toFixed(2)),
    };
  });

  res.json({
    success: true,
    message: "Cashflow report fetched",
    data,
  });
});

export const exportReport = asyncHandler(async (req, res) => {
  const rows = await getExportData(req.user.id, req.query);
  const format = req.query.format ? req.query.format.toLowerCase() : "csv";

  if (format === "json") {
    return res.json({
      success: true,
      message: "Export data fetched",
      data: rows.map((row) => ({
        id: Number(row.id),
        date: row.transaction_date,
        type: row.type,
        category: row.category,
        title: row.title,
        amount: Number(row.amount),
        note: row.note,
      })),
    });
  }

  // Generate downloadable CSV
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ["Transaction ID", "Date", "Type", "Category", "Title", "Amount", "Note"];
  const csvRows = rows.map((tx) => [
    tx.id,
    tx.transaction_date ? new Date(tx.transaction_date).toISOString().split("T")[0] : "",
    tx.type,
    tx.category,
    tx.title,
    tx.amount,
    tx.note || "",
  ]);

  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...csvRows.map((r) => r.map(escapeCSV).join(",")),
  ].join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="report_${Date.now()}.csv"`);
  res.send(csvContent);
});
