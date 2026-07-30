import axios from "axios";

// Always use VITE_API_URL when it's set. Branching on import.meta.env.MODE was
// wrong here: Vercel's production build has MODE === "production", so the old
// code fell through to the relative "/api" path — which resolves against the
// Vercel domain itself, not the Azure backend, and silently broke every request.
const API_URL = import.meta.env.VITE_API_URL || "/api";

export const axiosInstance = axios.create({
    baseURL: API_URL,
    // Kept for same-origin/local dev where the auth cookie still works.
    // Cross-site (Vercel -> Azure), the Authorization header below is the
    // real auth mechanism — see the Bearer-token note in
    // backend/src/lib/utils.js.
    withCredentials: true,
})

// Attach the JWT as a Bearer token on every request. This is what actually
// authenticates cross-site requests, since Incognito / third-party-cookie
// blocking silently drops the cross-site auth cookie.
axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("chatapp_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});