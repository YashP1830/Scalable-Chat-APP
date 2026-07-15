import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router";
import Chatpage from "./pages/Chatpage.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/SignUp.jsx";
import { useAuthStore } from "./store/useAuth.stores.js";
import PageLoader from "./components/PageLoader.jsx";
import { Toaster } from "react-hot-toast";

export default function App() {
  const {
    checkAuth,
    isCheckingAuth,
    authUser,
    connectSocket,
    disconnectSocket,
  } = useAuthStore();

  // 🔐 Run auth check once on app load
  useEffect(() => {
    checkAuth();
  }, []);

  // 🔌 Control socket lifecycle based on auth state
  useEffect(() => {
    if (!isCheckingAuth && authUser) {
      connectSocket();
    }

    if (!isCheckingAuth && !authUser) {
      disconnectSocket();
    }
  }, [authUser, isCheckingAuth]);

  // ⏳ Loading screen while checking auth
  if (isCheckingAuth) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-slate-900 relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]" />
      <div className="absolute top-0 -left-4 size-96 bg-pink-500 opacity-20 blur-[100px]" />
      <div className="absolute bottom-0 -right-4 size-96 bg-cyan-500 opacity-20 blur-[100px]" />

      <Routes>
        <Route
          path="/"
          element={authUser ? <Chatpage /> : <Navigate to="/login" />}
        />
        <Route
          path="/login"
          element={!authUser ? <Login /> : <Navigate to="/" />}
        />
        <Route
          path="/signup"
          element={!authUser ? <Signup /> : <Navigate to="/" />}
        />
      </Routes>

      <Toaster />
    </div>
  );
}
