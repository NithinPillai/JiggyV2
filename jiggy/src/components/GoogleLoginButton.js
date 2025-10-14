import React from "react";
import { supabase } from "../utils/supabase";

export default function GoogleLoginButton({ redirectTo }) {
  const handleLogin = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err) {
      console.error("Supabase OAuth error", err);
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="w-full px-4 py-2 rounded-xl border-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50"
    >
      Continue with Google
    </button>
  );
}
