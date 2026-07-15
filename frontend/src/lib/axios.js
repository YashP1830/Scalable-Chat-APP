import axios from "axios";

export const axiosInstance = axios.create({
    baseURL: import.meta.env.MODE === "development" 
        ? import.meta.env.VITE_API_URL // <-- Use Vite environment variable here
        : "/api",
    withCredentials: true,
})