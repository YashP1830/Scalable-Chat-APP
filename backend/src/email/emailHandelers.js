import { resendClient, sender } from "../lib/resend.js"
import { createWelcomeEmailTemplate } from "./emailTemplates.js"

export const SendWelcomeEmail=async (email,name,clientURL)=>{
        const {data,error}=resendClient.emails.send({
            from:`${sender.name} <${sender.email}>`,
            to:email,
            subject:"Welecome CHAT APP",
            html:createWelcomeEmailTemplate(name,clientURL)
        })

        if(error)
        {
            console.error("ERROR IN SENDING THE EMAIL")
            throw new Error("Failed to send welcome to EMAIL")
        }

        console.log("Welcome EMAIL sent Successfully :",data)
}