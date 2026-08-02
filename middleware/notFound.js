import AppError from "../utils/AppError.js";

const notFound = (req, res, next) => {
  next(new AppError("Route not found", 404));
};

export default notFound;
