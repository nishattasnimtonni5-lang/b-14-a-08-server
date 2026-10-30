import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb';
import "dotenv/config";
const PORT=5000;
const app=express()



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
app.get('/',(req,res)=>{
 res.send("hello what")
})

app.use(express.json())
app.use(cors())

app.listen(PORT,()=>{
    console.log("server is running well");
})
connectToMongoDB()