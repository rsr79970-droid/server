import Booking from "../models/booking.js";
import Show from "../models/show.js";
import { User } from "../models/user.model.js";
import { clerkClient, getAuth } from "@clerk/express";

export const isAdmin = async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        isAdmin: false,
      });
    }

    const user = await clerkClient.users.getUser(userId);

    const isAdmin = user.privateMetadata?.role === "admin";

    res.json({
      success: true,
      isAdmin,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      isAdmin: false,
    });
  }
};

export const getDashboardData = async (req, res) => {
  try {
    const bookings = await Booking.find({ isPaid: true });

    const activeShows = await Show.find({
      showDataTime: { $gte: new Date() },
    }).populate("movie");

    const totalUser = await User.countDocuments();

    const dashboardData = {
      totalBookings: bookings.length,
      totalRevenue: bookings.reduce((acc, booking) => acc + booking.amount, 0),
      activeShows,
      totalUser,
    };

    res.json({ success: true, dashboardData });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getAllShows = async (req, res) => {
  try {
    const shows = await Show.find({
      showDataTime: { $gte: new Date() },
    }).populate("movie");

    res.json({ success: true, shows });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate("user")
      .populate({
        path: "show",
        populate: { path: "movie" },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
