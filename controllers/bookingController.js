import { inngest } from "../inngest/index.js";
import Booking from "../models/booking.js";
import Show from "../models/show.js";
import { getAuth } from "@clerk/express";
import Stripe from "stripe";

const checkSeatsAvailability = async (showId, selectedSeats) => {
  try {
    const showData = await Show.findById(showId);
    if (!showData) return false;

    const occupiedSeats = showData.occupiedSeats;
    const isAnySeatTaken = selectedSeats.some((seat) => occupiedSeats[seat]);

    return !isAnySeatTaken;
  } catch (error) {
    console.log(error.message);
    return false;
  }
};

export const createBooking = async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { showId, selectedSeats } = req.body;

    const isAvailable = await checkSeatsAvailability(showId, selectedSeats);

    if (!isAvailable) {
      return res.json({
        success: false,
        message: "Selected Seats are not available.",
      });
    }

    const showData = await Show.findById(showId).populate("movie");

    const booking = await Booking.create({
      user: userId,
      show: showId,
      amount: showData.showPrice * selectedSeats.length,
      bookedSeats: selectedSeats,
    });

    selectedSeats.forEach((seat) => {
      showData.occupiedSeats[seat] = userId;
    });

    showData.markModified("occupiedSeats");
    await showData.save();

    //Stripe Gateway Intialize
    const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

    //creating line items to for stripe
    const line_items = [{
      price_data: {
        currency: "usd",
        product_data:{
          name: showData.movie.title
        },
        unit_amount: Math.floor(booking.amount) *100
      },
      quantity: 1
    }]
const session = await stripeInstance.checkout.sessions.create({
  success_url: `${origin}/loading/my-bookings`,
  cancel_url: `${origin}/my-bookings`,
  line_items: line_items,
  mode: "payment",
  metadata: {
    bookingId: booking._id.toString(),
  },
  expires_at: Math.floor(Date.now() / 1000) + (30 * 60) // 30 minutes from now
})

  booking.paymentLink = session.url;
  await booking.save();

  await inngest.send({
    name: "app/checkpayment",
    data:{
      bookingId: booking._id.toString(),
      
    }
  })

res.json({ success: true, url: session.url });

} catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    const showData = await Show.findById(showId);

    const occupiedSeats = Object.keys(showData.occupiedSeats);

    res.json({ success: true, message: occupiedSeats });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
