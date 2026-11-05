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
const googleClientId = process.env.BETTER_AUTH_GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.BETTER_AUTH_GOOGLE_SECRET;

const socialProviders = {};
if (googleClientId && googleClientSecret) {
  socialProviders.google = {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
  };
} else {
  console.warn(
    "Google sign-in is disabled; set BETTER_AUTH_GOOGLE_CLIENT_ID and BETTER_AUTH_GOOGLE_SECRET."
  );
}

const trustedOrigins = [
  "http://localhost:3000",
  "https://b-14-a-08-client.vercel.app",
 
];

export const auth = betterAuth({
  baseURL: betterAuthBaseUrl,
  trustedOrigins,
  secret: process.env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  maxPasswordLength: 128,
  },
  socialProviders,
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});