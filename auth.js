import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const betterAuthBaseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");

if (!mongoUri) {
  throw new Error("MONGODB_URI environment variable is required");
}

const client = new MongoClient(mongoUri);

await client.connect();

const db = client.db("studio-space");

const trustedOrigins = [
  "http://localhost:3000",
  "https://b-14-a-08-client.vercel.app",
  "https://b-14-a-08-client-n5a49h3ma-a-06.vercel.app",
  "https://b-14-a-08-client-im8m8jvdr-a-06.vercel.app",
  "https://b-14-a-08-client-hortcrbpe-a-06.vercel.app",
];

export const auth = betterAuth({
  baseURL: betterAuthBaseUrl,
  trustedOrigins,
  secret: process.env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});