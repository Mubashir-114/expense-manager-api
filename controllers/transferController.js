import {
  createTransfer,
  getTransferById,
  getTransfers,
} from "../models/transferModel.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const addTransfer = asyncHandler(async (req, res) => {
  const result = await createTransfer(req.user.id, req.body);
  const status = result.created ? 201 : 200;

  res.status(status).json({
    success: true,
    message: result.created ? "Transfer completed" : "Transfer already recorded",
    data: {
      transfer: result.transfer,
    },
  });
});

export const getAllTransfers = asyncHandler(async (req, res) => {
  const result = await getTransfers(req.user.id, req.query);

  res.json({
    success: true,
    message: "Transfers fetched",
    data: result,
  });
});

export const getSingleTransfer = asyncHandler(async (req, res) => {
  const transfer = await getTransferById(req.params.id, req.user.id);
  if (!transfer) {
    throw new AppError("Transfer not found", 404);
  }

  res.json({
    success: true,
    message: "Transfer fetched",
    data: {
      transfer,
    },
  });
});
