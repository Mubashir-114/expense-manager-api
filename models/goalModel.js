import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";

/**
 * Normalizes DB goal row into strongly-typed JS model
 */
const formatGoalRow = (row) => {
  if (!row) return null;
  const targetAmount = Number(row.target_amount);
  const startingAmount = Number(row.starting_amount || 0);
  const contributionsTotal = Number(row.contributions_total || 0);
  const savedAmount = Number((startingAmount + contributionsTotal).toFixed(2));
  const remainingAmount = Math.max(0, Number((targetAmount - savedAmount).toFixed(2)));
  const progressPercentage = targetAmount > 0
    ? Number(Math.min(100, Math.max(0, (savedAmount / targetAmount) * 100)).toFixed(2))
    : 0;

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: row.name,
    description: row.description || null,
    targetAmount,
    currency: row.currency || "INR",
    targetDate: row.target_date ? (row.target_date instanceof Date ? row.target_date.toISOString().slice(0, 10) : String(row.target_date).slice(0, 10)) : null,
    startingAmount,
    contributionsTotal,
    savedAmount,
    remainingAmount,
    progressPercentage,
    status: row.status, // 'active' | 'completed' | 'archived'
    contributionsCount: Number(row.contributions_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Normalizes DB contribution row
 */
const formatContributionRow = (row) => {
  if (!row) return null;
  return {
    id: Number(row.id),
    goalId: Number(row.goal_id),
    userId: Number(row.user_id),
    amount: Number(row.amount),
    contributionDate: row.contribution_date ? (row.contribution_date instanceof Date ? row.contribution_date.toISOString().slice(0, 10) : String(row.contribution_date).slice(0, 10)) : null,
    note: row.note || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Creates a new savings goal for an authenticated user.
 */
export const createGoal = async (userId, data) => {
  const {
    name,
    description = null,
    targetAmount,
    currency = "INR",
    targetDate = null,
    startingAmount = 0,
  } = data;

  const [result] = await db.execute(
    `INSERT INTO savings_goals
        (user_id, name, description, target_amount, currency, target_date, starting_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      userId,
      name.trim(),
      description ? description.trim() : null,
      targetAmount,
      currency.toUpperCase(),
      targetDate || null,
      startingAmount || 0,
    ]
  );

  return getGoalById(result.insertId, userId);
};

/**
 * Retrieves all savings goals for a user with optional status filter.
 */
export const getGoals = async (userId, filters = {}) => {
  let sql = `
    SELECT g.*,
           COALESCE(SUM(c.amount), 0) AS contributions_total,
           COUNT(c.id) AS contributions_count
      FROM savings_goals g
      LEFT JOIN goal_contributions c ON c.goal_id = g.id AND c.user_id = g.user_id
     WHERE g.user_id = ?
  `;
  const params = [userId];

  if (filters.status && filters.status !== "all") {
    sql += " AND g.status = ?";
    params.push(filters.status);
  }

  sql += `
     GROUP BY g.id
     ORDER BY
       CASE g.status
         WHEN 'active' THEN 1
         WHEN 'completed' THEN 2
         WHEN 'archived' THEN 3
         ELSE 4
       END ASC,
       g.target_date IS NULL ASC,
       g.target_date ASC,
       g.created_at DESC
  `;

  const [rows] = await db.execute(sql, params);
  return rows.map(formatGoalRow);
};

/**
 * Retrieves a single goal by ID with strict user scoping.
 */
export const getGoalById = async (goalId, userId) => {
  const [rows] = await db.execute(
    `SELECT g.*,
            COALESCE(SUM(c.amount), 0) AS contributions_total,
            COUNT(c.id) AS contributions_count
       FROM savings_goals g
       LEFT JOIN goal_contributions c ON c.goal_id = g.id AND c.user_id = g.user_id
      WHERE g.id = ? AND g.user_id = ?
      GROUP BY g.id`,
    [goalId, userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return formatGoalRow(rows[0]);
};

/**
 * Updates a savings goal with strict ownership checks.
 */
export const updateGoal = async (goalId, userId, data) => {
  const existing = await getGoalById(goalId, userId);
  if (!existing) {
    throw new AppError("Savings goal not found", 404);
  }

  const updates = [];
  const params = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name.trim());
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    params.push(data.description ? data.description.trim() : null);
  }
  if (data.targetAmount !== undefined) {
    updates.push("target_amount = ?");
    params.push(data.targetAmount);
  }
  if (data.currency !== undefined) {
    updates.push("currency = ?");
    params.push(data.currency.toUpperCase());
  }
  if (data.targetDate !== undefined) {
    updates.push("target_date = ?");
    params.push(data.targetDate || null);
  }
  if (data.startingAmount !== undefined) {
    updates.push("starting_amount = ?");
    params.push(data.startingAmount);
  }
  if (data.status !== undefined) {
    updates.push("status = ?");
    params.push(data.status);
  }

  if (updates.length === 0) {
    return existing;
  }

  params.push(goalId, userId);

  await db.execute(
    `UPDATE savings_goals SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
    params
  );

  return getGoalById(goalId, userId);
};

/**
 * Deletes a savings goal and cascades its contributions.
 */
export const deleteGoal = async (goalId, userId) => {
  const [result] = await db.execute(
    "DELETE FROM savings_goals WHERE id = ? AND user_id = ?",
    [goalId, userId]
  );
  return result.affectedRows > 0;
};

/**
 * Adds a contribution to a goal.
 * Important: This does NOT withdraw funds or touch account balances.
 */
export const addContribution = async (goalId, userId, data) => {
  const goal = await getGoalById(goalId, userId);
  if (!goal) {
    throw new AppError("Savings goal not found", 404);
  }

  const { amount, contributionDate, note = null } = data;

  const [result] = await db.execute(
    `INSERT INTO goal_contributions (goal_id, user_id, amount, contribution_date, note)
     VALUES (?, ?, ?, ?, ?)`,
    [
      goalId,
      userId,
      amount,
      contributionDate || new Date().toISOString().slice(0, 10),
      note ? note.trim() : null,
    ]
  );

  // If newly reached or exceeded target, and was active, update status to completed
  const updatedGoal = await getGoalById(goalId, userId);
  if (updatedGoal.savedAmount >= updatedGoal.targetAmount && updatedGoal.status === "active") {
    await db.execute(
      "UPDATE savings_goals SET status = 'completed' WHERE id = ? AND user_id = ?",
      [goalId, userId]
    );
  }

  return getContributionById(result.insertId, goalId, userId);
};

/**
 * Retrieves paginated contributions for a goal.
 */
export const getContributions = async (goalId, userId, options = {}) => {
  const goal = await getGoalById(goalId, userId);
  if (!goal) {
    throw new AppError("Savings goal not found", 404);
  }

  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
  const offset = (page - 1) * limit;

  const [countRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM goal_contributions WHERE goal_id = ? AND user_id = ?",
    [goalId, userId]
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await db.execute(
    `SELECT * FROM goal_contributions
      WHERE goal_id = ? AND user_id = ?
      ORDER BY contribution_date DESC, id DESC
      LIMIT ? OFFSET ?`,
    [goalId, userId, limit, offset]
  );

  return {
    contributions: rows.map(formatContributionRow),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

/**
 * Retrieves a single contribution record by ID.
 */
export const getContributionById = async (contributionId, goalId, userId) => {
  const [rows] = await db.execute(
    "SELECT * FROM goal_contributions WHERE id = ? AND goal_id = ? AND user_id = ?",
    [contributionId, goalId, userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return formatContributionRow(rows[0]);
};

/**
 * Updates an existing contribution record.
 */
export const updateContribution = async (contributionId, goalId, userId, data) => {
  const existing = await getContributionById(contributionId, goalId, userId);
  if (!existing) {
    throw new AppError("Contribution record not found", 404);
  }

  const updates = [];
  const params = [];

  if (data.amount !== undefined) {
    updates.push("amount = ?");
    params.push(data.amount);
  }
  if (data.contributionDate !== undefined) {
    updates.push("contribution_date = ?");
    params.push(data.contributionDate);
  }
  if (data.note !== undefined) {
    updates.push("note = ?");
    params.push(data.note ? data.note.trim() : null);
  }

  if (updates.length > 0) {
    params.push(contributionId, goalId, userId);
    await db.execute(
      `UPDATE goal_contributions SET ${updates.join(", ")} WHERE id = ? AND goal_id = ? AND user_id = ?`,
      params
    );
  }

  // Check if status should transition based on new total
  const updatedGoal = await getGoalById(goalId, userId);
  if (updatedGoal.savedAmount >= updatedGoal.targetAmount && updatedGoal.status === "active") {
    await db.execute(
      "UPDATE savings_goals SET status = 'completed' WHERE id = ? AND user_id = ?",
      [goalId, userId]
    );
  } else if (updatedGoal.savedAmount < updatedGoal.targetAmount && updatedGoal.status === "completed") {
    await db.execute(
      "UPDATE savings_goals SET status = 'active' WHERE id = ? AND user_id = ?",
      [goalId, userId]
    );
  }

  return getContributionById(contributionId, goalId, userId);
};

/**
 * Deletes a contribution record.
 */
export const deleteContribution = async (contributionId, goalId, userId) => {
  const [result] = await db.execute(
    "DELETE FROM goal_contributions WHERE id = ? AND goal_id = ? AND user_id = ?",
    [contributionId, goalId, userId]
  );

  if (result.affectedRows > 0) {
    // If goal was completed but is now below target, reactivate
    const updatedGoal = await getGoalById(goalId, userId);
    if (updatedGoal && updatedGoal.savedAmount < updatedGoal.targetAmount && updatedGoal.status === "completed") {
      await db.execute(
        "UPDATE savings_goals SET status = 'active' WHERE id = ? AND user_id = ?",
        [goalId, userId]
      );
    }
    return true;
  }
  return false;
};

/**
 * Aggregates savings goals summary for dashboard.
 */
export const getGoalsSummary = async (userId) => {
  const goals = await getGoals(userId, { status: "all" });

  let totalTarget = 0;
  let totalSaved = 0;
  let activeGoalsCount = 0;
  let completedGoalsCount = 0;
  let archivedGoalsCount = 0;

  for (const g of goals) {
    if (g.status === "active") {
      activeGoalsCount += 1;
      totalTarget += g.targetAmount;
      totalSaved += g.savedAmount;
    } else if (g.status === "completed") {
      completedGoalsCount += 1;
      totalTarget += g.targetAmount;
      totalSaved += g.savedAmount;
    } else if (g.status === "archived") {
      archivedGoalsCount += 1;
    }
  }

  const totalRemaining = Math.max(0, Number((totalTarget - totalSaved).toFixed(2)));
  const overallProgressPercentage = totalTarget > 0
    ? Number(Math.min(100, Math.max(0, (totalSaved / totalTarget) * 100)).toFixed(2))
    : 0;

  return {
    totalTarget: Number(totalTarget.toFixed(2)),
    totalSaved: Number(totalSaved.toFixed(2)),
    totalRemaining,
    overallProgressPercentage,
    activeGoalsCount,
    completedGoalsCount,
    archivedGoalsCount,
    totalGoalsCount: goals.length,
  };
};
