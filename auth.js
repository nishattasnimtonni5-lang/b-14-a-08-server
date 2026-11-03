import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";



const client = new MongoClient(process.env.MONGODB_URI);

await client.connect();

const db = client.db("studio-space");

export const auth = betterAuth({
   baseURL: "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: true,
  },
});