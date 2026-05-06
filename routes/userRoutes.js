import express from "express";
import {
  getFavorites,
  getUserBookings,
  updateFavorite,
} from "../controllers/userController.js";

import { protectAuth } from "../middleware/auth.js";

const userRouter = express.Router();

userRouter.get("/bookings", protectAuth, getUserBookings);

userRouter.post("/update-favorite", protectAuth, updateFavorite);

userRouter.get("/favorites", protectAuth, getFavorites);

export default userRouter;
