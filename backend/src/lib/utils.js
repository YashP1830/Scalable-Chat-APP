import jwt from 'jsonwebtoken'

export const generateToken=(userId,res)=>{
    const token=jwt.sign({userId},process.env.JWT_SECRET,{
        expiresIn:"7d"
    })

    // Vercel (frontend) and Azure (backend) are different origins, so this is a
    // cross-site cookie. Browsers only send cross-site cookies when
    // SameSite=None AND Secure=true (which requires real HTTPS — see Caddy
    // setup in DEPLOY_AZURE.md). Locally, NODE_ENV isn't "production", so we
    // keep the old same-site behavior over plain http://localhost.
    //
    // NOTE: even with SameSite=None; Secure set correctly, browsers running in
    // Incognito/Private mode (and, increasingly, regular mode as third-party
    // cookies get phased out) block this cookie outright, since Azure is a
    // "third party" relative to the Vercel page. So this cookie is now only a
    // best-effort convenience for same-origin/local setups — the real
    // cross-site auth mechanism is the Bearer token returned in the response
    // body (see auth.controller.js) and checked in auth.middleware.js /
    // socketAuthMiddleware.js.
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("jwt",token,{
        maxAge:7*24*60*60*1000, //milliSecond
        httpOnly:true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd
    })

    return token
}