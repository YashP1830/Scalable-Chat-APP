import mongoose from 'mongoose'

export const connectDB=async ()=>{
        try {
             const conn= await mongoose.connect(process.env.MONGODB_URI)
             console.log("MONGODB is connected Successfully :",conn.connection.host)
             const {MONGODB_URI}=process.env
             if(!MONGODB_URI) throw new Error("MONGODB URI is not set")
        } catch (error) {
            console.log("Error connecting to MONGODB:",error)
            process.exit(1) //1 status code is failed and 0 is success
        }
}