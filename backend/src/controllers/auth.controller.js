import { User } from "../models/User.js";
import bcrypt from "bcryptjs"
import { generateToken } from "../lib/utils.js";
import { SendWelcomeEmail } from "../email/emailHandelers.js";
import "dotenv/config"
import cloudinary from "../lib/cloudinary.js";
export const signup=async (req, res) => {
   const {fullName,email,password}=req.body
    try {
    
       if(!fullName || !email || !password)
       {
          return res.status(400).json({message:"All fields are required"})
       }
       if(password.length <6)
          {
            return res.status(400).json({message:"Passowrd should be of atleast 6 characters"})
          }
        
           // check if emailis valid: regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: "Invalid email format" });
        }
    
        const user=await User.findOne({email});
    
        if(user){
            return res.status(400).json({message:"The Email already exist"})
        } 
    
         const salt=await bcrypt.genSalt(10)
         const hasedPassword=await bcrypt.hash(password,salt)
         
         const newUser= new User({
            fullName,
            email,
            password:hasedPassword
         })
    
         if(newUser)
         {
            const savedUser=await newUser.save()
            generateToken(newUser._id,res);
            
    
            res.status(201).json({
                _id:newUser._id,
                fullName:newUser.fullName,
                email:newUser.email,
                profilepic:newUser.profilepic
            })

            try {
                await SendWelcomeEmail(savedUser.email,savedUser.fullName,process.env.CLIENT_URL)
            } catch (error) {
                
            }
         }
         else{
            res.status(400).json({meassage:"Invalid User"})
         }
    } catch (error) {
        console.log("Error in signup",error)
        res.status(500).json({message:"Internal server error"})
    }

    
 };

 export const login=async (req,res) =>{
    const {email,password}= req.body
    if(!email || !password)
    {
        return res.status(400).json({meassage:"Please enter and E-mail and Password"})
    }
    try {
        const user=await User.findOne({email})
        if(!user) return res.status(400).json({message:"Invalid Credential"})
            //never them
        const isPasswordcorrect=await bcrypt.compare(password,user.password)
        if(!isPasswordcorrect) return res.status(400).json({message:"Invalid Credential"})
        
        generateToken(user._id,res)
        res.status(201).json({
                _id:user._id,
                fullName:user.fullName,
                email:user.email,
                profilepic:user.profilepic
            })

    } catch (error) {
        console.error("Error in login controller",error)
        return res.status(500).json({message:"Internal Server Error"})

    }
 }

 export const logout=async (__,res) =>{
        res.cookie("jwt","",{maxAge:0})
        res.status(200).json({message:"The user is Logout Successfully"})
 }

 export const updateprofile=async (req,res)=>{
    try {
        const {profilePic}=req.body
        if(!profilePic) return res.status(400).json({message:"Profile pic is required"})
        
        const userId=req.user._id
        const uploadResponse=await cloudinary.uploader.upload(profilePic)
        const UpdatedUSER=await User.findByIdAndUpdate(userId,{profilepic:uploadResponse.secure_url},{new:true})

        return res.status(200).json(UpdatedUSER)

    } catch (error) {
        console.error("Error in Profiel Updating controller",error)
        return res.status(500).json({message:"Internal Server Error"})
    }
 }

 