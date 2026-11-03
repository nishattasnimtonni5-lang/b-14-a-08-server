import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import "dotenv/config";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";

const PORT = 5000;
const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://b-14-a-08-client-n5a49h3ma-a-06.vercel.app"
  ],
  credentials: true
}));

app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    req.user = session.user;
    next();
  } catch (error) {
    console.log("Session verification error:", error);
    return res.status(401).json({
      message: "Authentication failed"
    });
  }
}

app.get('/api/me', requireAuth, (req, res) => {
  res.status(200).json({
    user: req.user,
  });
});

app.get('/', (req, res) => {
  res.send("hello what");
});

app.get('/api/studios', async (req, res) => {
  try {
    const database = client.db("studio-space");
    const studios = database.collection("studios");
    const result = await studios.find({}).toArray();
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Failed to fetch studios"
    });
  }
});

app.get('/api/my-bookings', requireAuth, async (req, res) => {
  try {
    const database = client.db("studio-space");
    const bookings = database.collection("bookings");
    const studios = database.collection("studios");

    const result = await bookings
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const bookingsWithStudio = await Promise.all(
      result.map(async (booking) => {
        const studio = await studios.findOne({
          id: booking.studioId
        });

        return {
          ...booking,
          studio
        };
      })
    );

    res.status(200).json(bookingsWithStudio);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Failed to fetch bookings"
    });
  }
});

app.get('/api/studios/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const database = client.db("studio-space");
    const studios = database.collection("studios");
    const result = await studios.findOne({ id: id });
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Failed to fetch studios"
    });
  }
});

app.post('/api/bookings', requireAuth, async (req, res) => {
  try {
    const database = client.db("studio-space");
    const bookings = database.collection("bookings");

    const bookingData = {
      studioId: req.body.studioId,
      date: req.body.date,
      time: req.body.time,
      userId: req.user.id,
      status: "Pending",
      createdAt: new Date()
    };

    const result = await bookings.insertOne(bookingData);

    res.status(201).json({
      message: "Booking created successfully",
      bookingId: result.insertedId
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Failed to create bookings"
    });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log("server is running well");
  });
}

connectToMongoDB();

export default app;