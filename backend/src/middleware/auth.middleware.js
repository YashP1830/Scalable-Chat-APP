import jwt from "jsonwebtoken"
import { User } from "../models/User.js"

export const protectRoute=async (req,res,next)=>{
    try {
        // Prefer the Authorization header (Bearer token) — this is what the
        // frontend actually relies on across origins, since third-party/
        // cross-site cookies get silently dropped in Incognito and by
        // browsers phasing out third-party cookies generally. Cookie stays
        // as a fallback for same-origin/local dev where it still works fine.
        const authHeader=req.headers.authorization
        const headerToken=authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
        const token=headerToken || req.cookies.jwt
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