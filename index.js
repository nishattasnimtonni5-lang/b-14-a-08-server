import express from "express";
import cors from "cors";

import { pathToFileURL } from "node:url";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { MongoClient, ObjectId } from "mongodb";

const PORT = 5000;
const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://b-14-a-08-client.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
let clientPromise;
let bookingIndexPromise;

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

async function ensureBookingIndex() {
  if (!bookingIndexPromise) {
    bookingIndexPromise = (async () => {
      const database = (await connectToMongoDB()).db("studio-space");

      await database.collection("bookings").createIndex(
        { studioId: 1, date: 1, time: 1 },
        {
          unique: true,
          partialFilterExpression: {
            status: { $in: ["Pending", "Confirmed"] },
          },
          name: "unique_active_studio_booking",
        }
      );
    })().catch((error) => {
      bookingIndexPromise = null;
      throw error;
    });
  }

  return bookingIndexPromise;
}

async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
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
        email: req.user.email,
        name: req.user.name,
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
          studio,
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
    const { studioId, date, time } = req.body ?? {};

    const hasValidDate =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);

    const hasValidTime =
      typeof time === "string" && /^\d{2}:\d{2}$/.test(time);

    const hasStudioId =
      typeof studioId === "string" && studioId.trim().length > 0;

    if (!hasStudioId || !hasValidDate || !hasValidTime) {
      return res.status(400).json({
        message: "A valid studioId, date and time are required",
      });
    }

    const database = (await connectToMongoDB()).db("studio-space");
    const bookings = database.collection("bookings");

    await ensureBookingIndex();

    const existingBooking = await bookings.findOne({
      studioId,
      date,
      time,
      status: { $in: ["Pending", "Confirmed"] },
    });

    if (existingBooking) {
      return res.status(409).json({
        message: "This studio is already booked for this date and time",
      });
    }

    const bookingData = {
      studioId,
      date,
      time,
      userId: req.user.id,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await bookings.insertOne(bookingData);

    res.status(201).json({
      message: "Booking created successfully",
      bookingId: result.insertedId,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "This studio is already booked for this date and time",
      });
    }

    console.log(err);
    res.status(500).json({ message: "Failed to create booking" });
  }
});

app.post("/api/studios", verifyJWT, async (req, res) => {
  try {
    const db = (await connectToMongoDB()).db("studio-space");

    const studio = {
      ...req.body,
      id: String(Date.now()),
      price: Number(req.body.price),
      securityDeposit: Number(req.body.securityDeposit),
      maxCapacity: Number(req.body.maxCapacity),
      amenities: Array.isArray(req.body.amenities)
        ? req.body.amenities
        : [],
      overview: req.body.overview || "",
      userName: req.user.name,
      userEmail: req.user.email,
      rating: 0,
      reviews: 0,
      ownerId: req.user.id,
      createdAt: new Date(),
    };

    await db.collection("studios").insertOne(studio);

    res.status(201).json({ message: "Studio added successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to add studio" });
  }
});

app.get("/api/my-studios", verifyJWT, async (req, res) => {
  try {
    const db = (await connectToMongoDB()).db("studio-space");

    const studios = await db
      .collection("studios")
      .find({
        ownerId: req.user.id,
      })
      .toArray();

    res.send(studios);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to fetch studios" });
  }
});

app.patch("/api/studios/:id", verifyJWT, async (req, res) => {
  try {
    const db = (await connectToMongoDB()).db("studio-space");

    const updateData = {};
    const allowedFields = [
      "name",
      "category",
      "location",
      "image",
      "overview",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.price !== undefined) {
      updateData.price = Number(req.body.price);
    }

    if (req.body.securityDeposit !== undefined) {
      updateData.securityDeposit = Number(req.body.securityDeposit);
    }

    if (req.body.maxCapacity !== undefined) {
      updateData.maxCapacity = Number(req.body.maxCapacity);
    }

    if (req.body.amenities !== undefined) {
      updateData.amenities = Array.isArray(req.body.amenities)
        ? req.body.amenities
        : [];
    }

    const result = await db.collection("studios").updateOne(
      { id: req.params.id, ownerId: req.user.id },
      {
        $set: updateData,
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Studio not found" });
    }

    res.send({ message: "Studio updated successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to update studio" });
  }
});

app.delete("/api/studios/:id", verifyJWT, async (req, res) => {
  try {
    const db = (await connectToMongoDB()).db("studio-space");

    const result = await db.collection("studios").deleteOne({
      id: req.params.id,
      ownerId: req.user.id,
    });

    if (!result.deletedCount) {
      return res.status(404).json({ message: "Studio not found" });
    }

    res.send({ message: "Studio deleted successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to delete studio" });
  }
});

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (process.env.NODE_ENV !== "production" && isMainModule) {
  app.listen(PORT, () => {
    console.log("server is running well");
  });
}

app.patch("/api/bookings/:id/cancel", verifyJWT, async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const database = client.db("studio-space");
    const bookings = database.collection("bookings");

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const result = await bookings.updateOne(
      {
        _id: new ObjectId(req.params.id),
        userId: req.user.id,
        status: { $in: ["Pending", "Confirmed"] },
      },
      {
        $set: { status: "Cancelled" },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: "Booking not found or cannot be cancelled",
      });
    }

    res.status(200).json({ message: "Booking cancelled successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to cancel booking" });
  }
});

export default app;