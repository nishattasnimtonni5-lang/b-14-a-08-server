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
app.get('/api/studios',async(req,res)=>{
  try{
    const database =client.db("studio-space")
    const studios=database.collection("studios")
    const result=await studios.find({}).toArray()
    res.status(200).json(result)
  }
  catch(err){
    console.log(err)
    res.status(500).json({message:"Failed to fetch studios"})
  }
})
app.get('/api/studios/:id',async(req,res)=>{
  try{
const id=req.params.id;
  
  const database=client.db("studio-space")
  const studios=database.collection("studios")
  const result=await studios.findOne({id:id})
  res.json(result)
  }
  
    catch(err){
      res.status(500).json({message:"failed to fetch studios"})
    }
  


})

app.post('/api/bookings',async(req,res)=>{
  try{
  const database=client.db("studio-space")
  const bookings=database.collection("bookings")
  const result=await bookings.insertOne(req.body)
   res.status(201).json(result)
  }
   catch(err){
    console.log(err)
    res.status(500).json({message:"Failed to create bookings"})
  }
})
app.use(express.json())
app.use(cors())

app.listen(PORT,()=>{
    console.log("server is running well");
})
connectToMongoDB()