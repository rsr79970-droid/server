import { Inngest } from "inngest";
import { User } from "../models/user.model.js";
import Booking from "../models/booking.js";
import Show from "../models/show.js";
import nodemailer from "nodemailer";
import sendEmail from "../configs/nodemailer.js";

export const inngest = new Inngest({ id: "movie-ticket-booking" });

const syncUserCreation = inngest.createFunction(
  {
    id: "sync-user-from-clerk",
    triggers: [{ event: "clerk/user.created" }],
  },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;

    const userData = {
      _id: id,
      email: email_addresses?.[0]?.email_address,
      name: `${first_name || ""} ${last_name || ""}`.trim(),
      image: image_url,
    };

    await User.create(userData);
  },
);

const syncUserDeletion = inngest.createFunction(
  {
    id: "delete-user-with-clerk",
    triggers: [{ event: "clerk/user.deleted" }],
  },
  async ({ event }) => {
    const { id } = event.data;
    await User.findByIdAndDelete(id);
  },
);

const syncUserUpdation = inngest.createFunction(
  {
    id: "update-user-from-clerk",
    triggers: [{ event: "clerk/user.updated" }],
  },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;

    const userData = {
      _id: id,
      email: email_addresses?.[0]?.email_address,
      name: `${first_name || ""} ${last_name || ""}`.trim(),
      image: image_url,
    };

    await User.findByIdAndUpdate(id, userData);
  },
);

const releaseSeatsAndDeleteBooking = inngest.createFunction(
    {id: "release-seats-and-delete-booking"},
    {event:"app/checkpayment"},
    async ({event, step}) => {
      const tenMinutesLater = new Date(new Date(event.data.bookingTime).getTime() + 10*60*1000);
      await step.sleepUntil('wait-for-10-minutes', tenMinutesLater);

      await step.run("check-payment-status", async () => {
        const bookingId = event.data.bookingId;
        const bookingData = await Booking.findById(bookingId)

        if(!bookingData.isPaid){
          const show = await Show.findById(bookingData.show)
          bookingData.bookedSeats.forEach((seat)=> {
            delete show.occupiedSeats[seat];
          })
          show.markModified("occupiedSeats");
          await show.save();
          await Booking.findByIdAndDelete(bookingId);
        }
      })
    }

  

)


const sendBookingConfirmationEmail = inngest.createFunction(
  {id: "send-booking-confirmation-email"},
  {event: "app/show.booked"},
  async ({event, step }) => {
    const {bookingId} = event.data;
    const booking = await Booking.findById(bookingId).populate({
      path: 'show',
      populate: {path: 'movie', model: 'Movie'}
    }).populate('user');

    await sendEmail({
      to: booking.user.email,
      subject: `Payment Confirmation: "${booking.show.movie.title}" booked!`,
      body: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Hi ${booking.user.name},</h2>
    
          <p>
            Your booking for 
            <strong style="color: #F84565;">
              "${booking.show.movie.title}"
            </strong> 
            is confirmed.
          </p>
    
          <p>
            <strong>Date:</strong> ${
              new Date(booking.show.showDateTime).toLocaleDateString('en-US', {
                timeZone: 'Asia/Kolkata'
              })
            }<br/>
    
            <strong>Time:</strong> ${
              new Date(booking.show.showDateTime).toLocaleTimeString('en-US', {
                timeZone: 'Asia/Kolkata'
              })
            }
          </p>
    
          <p>Enjoy the show! 🍿</p>
    
          <p>
            Thanks for booking with us!<br/>
            — QuickShow Team
          </p>
        </div>
      `
    });

  }
)

const sendShowReminders = inngest.createFunction(
  {id: "send-show-reminders"},
  { cron: "0 */8 * * *"}
  ,async ({step}) => {
    const now = new Date();
    const in8hours = new Date(now.getTime()+ 8*60*60*1000);
    const windowStart = new Date(in8hours.getTime() - 10*60*1000);

    const reminderTasks = await step.run("prepare-reminder-tasks", async() => {
      const shows = await Show.find({
        showTime: {$gte: windowStart, $lte: in8hours},
      }).populate('movie');
      const tasks = [];

      for(const show of shows) {
        if(!show.movie || !show.occupiedSeats) continue;

        const userIds = [...new Set(Object.values(show.occupiedSeats))];
        if(userIds.length === 0) continue;

        const users = await User.find({_id: {$in: userIds}}).select("email name");

        for(const user of users) {
          tasks.push({
            userEmail: user.email,
            userName: user.name,
            movieTitle: show.movie.title,
            showTime: show.showTime
          })
        }
      }
      return tasks;
    })
    if(reminderTasks.length === 0){
      return {sent: 0, message: "No reminders to send"};
    }


    const results = await step.run("send-reminder-emails", async() => {
      return await Promise.allSettled(
        reminderTasks.map(task => sendEmail({
          to: task.userEmail,
          subject: `Reminder: "${task.movieTitle}" show in 8 hours!`,
          body: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
              <h2>Hi ${task.userName},</h2>

              <p>
                This is a friendly reminder that your show
                <strong style="color: #F84565;">
                  "${task.movieTitle}"
                </strong>
                is starting at ${new Date(task.showTime).toLocaleTimeString('en-US', {
                  timeZone: 'Asia/Kolkata'
                })}.
              </p>

              <p>Enjoy the show! 🍿</p>

              <p>
                Thanks for booking with us!<br/>
                — QuickShow Team
              </p>
            </div>
          `
        })
      )
  );
  const sent = results.filter(r => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return ({
    sent,
    failed,
    message: `Reminders sent: ${sent}, failed: ${failed}`
  })
  })
});

sendNewShowNotifications = inngest.createFunction(
  {id: "send-new-show-notifications"},
  {event: "app/show-added"},
  async ({ event }) => {
    const {movieTitle } = event.data;
    const users = await User.find({})

    for(const user of users) {
      const userEmail = user.email;
      const userName = user.name;
      const subject = `New Show Alert: "${movieTitle}"`;
      const body = `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Hi ${userName},</h2>
        <p>We've just added a new show to our library:</p>
        <h3 style="color: #F84565;">"${movieTitle}"</h3>
        <p>Visit our website</p>
        <br/>
        <p>Thanks,<br/>QuickShow Team</p>
        </div>`;

    await sendEmail({
      to: userEmail,
      subject,
      body,
        });
    
    }
    return { message: "Notification sent."}
  }

)

export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdation, releaseSeatsAndDeleteBooking, sendBookingConfirmationEmail, sendShowReminders, sendNewShowNotifications];
