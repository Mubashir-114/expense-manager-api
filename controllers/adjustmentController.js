import {
  createAdjustment,
  getAdjustments,
} from "../models/adjustmentModel.js";
import asyncHandler from "../utils/asyncHandler.js";

export const addAdjustment = asyncHandler(async (req, res) => {
  const accountId = Number(req.params.id);
  const result = await createAdjustment(req.user.id, accountId, req.body);
  const status = result.created ? 201 : 200;

  res.status(status).json({
    success: true,
    message: result.created ? "Adjustment recorded" : "Adjustment already recorded",
    data: {
      adjustment: result.adjustment,
    },
  });
});

export const getAccountAdjustments = asyncHandler(async (req, res) => {
  const accountId = Number(req.params.id);
  const result = await getAdjustments(req.user.id, accountId, req.query);

  res.json({
    success: true,
    message: "Adjustments fetched",
    data: result,
  });
});
