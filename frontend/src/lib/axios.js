import axios from "axios";

// Always use VITE_API_URL when it's set. Branching on import.meta.env.MODE was
// wrong here: Vercel's production build has MODE === "production", so the old
// code fell through to the relative "/api" path — which resolves against the
// Vercel domain itself, not the Azure backend, and silently broke every request.
const API_URL = import.meta.env.VITE_API_URL || "/api";

export const axiosInstance = axios.create({
    baseURL: API_URL,
    withCredentials: true,
})