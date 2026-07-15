import jwt from "jsonwebtoken"
import { User } from "../models/User.js"

export const protectRoute=async (req,res,next)=>{
    try {
        const token=req.cookies.jwt
        if(!token) return res.status(401).json({message:"Unauthorized:No token Found"})

        const decoded=jwt.verify(token,process.env.JWT_SECRET)

        if(!decoded) return res.status(401).json({message:"Unauthorized:Invalid Token"})
        
        const user=await User.findById(decoded.userId).select("-password")

        if(!user) return res.status(401).json({message:"No user found"})

        req.user=user   
        next()


    } catch (error) {
        console.log("Error in Protect route middleware")
        return res.status(500).json({message:"Internal server Error"})
    }
 }