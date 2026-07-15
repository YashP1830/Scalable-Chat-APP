import mongoose  from "mongoose";

const UserSchema= new mongoose.Schema({
    email:{
        type:String,
        require:true,
        unique:true
    },
    fullName:{
        type:String,
        required:true,
        unique:true
    },
    password:{
        type:String,
        required:true,
        minlength:6
    },
    profilepic:{
        type:String,
        default:""
    }

},{timestamps:true})

export const User=mongoose.model("User",UserSchema)