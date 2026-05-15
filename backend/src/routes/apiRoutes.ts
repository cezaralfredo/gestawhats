import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import uploadConfig from "../config/upload";

import * as ApiController from "../controllers/ApiController";
import isAuthApi from "../middleware/isAuthApi";

const upload = multer(uploadConfig);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: req => req.headers["x-api-token"] as string || req.ip || "unknown",
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

const ApiRoutes = express.Router();

ApiRoutes.post("/send", apiLimiter, isAuthApi, upload.array("medias"), ApiController.index);

export default ApiRoutes;
