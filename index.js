import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";

const PORT = 5000;
const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://b-14-a-08-client.vercel.app",
    "https://b-14-a-08-client-n5a49h3ma-a-06.vercel.app",
    "https://b-14-a-08-client-im8m8jvdr-a-06.vercel.app"
  ],
  credentials: true
}));

app.all("/api/auth/{*any}", toNodeHandler(auth));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let clientPromise;

export async function connectToMongoDB() {
  try {
    if (!clientPromise) {
      clientPromise = client.connect().catch((err) => {
        clientPromise = null;
        throw err;
      });
    }

    await clientPromise;
    return client;
  } catch (err) {
    console.log("MongoDB connection error:", err);
    throw err;
  }
}

async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    if (!session) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = session.user;
    next();
  } catch (error) {
    console.log("Authentication error:", error);
    return res.status(401).json({ message: "Authentication failed" });
  }
}

function verifyJWT(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access token required" });
    }

    const token = authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.get("/api/token", requireAuth, (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is missing" });
    }

    const token = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({ token });
  } catch (error) {
    console.log("Token generation error:", error);
    res.status(500).json({ message: "Token generation failed" });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

app.get("/", (req, res) => {
  res.send("hello what");
});

app.get("/api/studios", async (req, res) => {
  try {
    const database = (await connectToMongoDB()).db("studio-space");
    const studios = database.collection("studios");
    const result = await studios.find({}).toArray();

    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to fetch studios" });
  }
});

app.get("/api/studios/:id", async (req, res) => {
  try {
    const database = (await connectToMongoDB()).db("studio-space");
    const studios = database.collection("studios");
    const result = await studios.findOne({ id: req.params.id });

    if (!result) {
      return res.status(404).json({ message: "Studio not found" });
    }

    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to fetch studio" });
  }
});

app.get("/api/my-bookings", verifyJWT, async (req, res) => {
  try {
    const database = (await connectToMongoDB()).db("studio-space");
    const bookings = database.collection("bookings");
    const studios = database.collection("studios");

    const result = await bookings
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const bookingsWithStudio = await Promise.all(
      result.map(async (booking) => {
        const studio = await studios.findOne({ id: booking.studioId });

        return {
          ...booking,
          studio
        };
      })
    );

    res.status(200).json(bookingsWithStudio);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

app.post("/api/bookings", requireAuth, async (req, res) => {
  try {
    const database = (await connectToMongoDB()).db("studio-space");
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
    res.status(500).json({ message: "Failed to create booking" });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log("server is running well");
  });
}

export default app;