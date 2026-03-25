import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config();

const connectDB = async () => {
    try {
        const MONGODB_URI = process.env.MONGODB_URI
        await mongoose.connect(MONGODB_URI)
        console.log("Database sucessfully connected");
        
    } catch (error) {
        console.log("Connection error",error.message)
    }
}

export default connectDB