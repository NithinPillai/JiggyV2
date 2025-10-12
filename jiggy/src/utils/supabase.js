import { createClient } from '@supabase/supabase-js';

// Prefer CRA env var names (REACT_APP_...) so they're available in the browser build
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY || '';

function createStubClient() {
  console.error(
    'Missing Supabase config: set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY in your .env (see .env.example)'
  );

  const notInitializedError = new Error(
    'Supabase client not initialized because REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_KEY is missing. See .env.example.'
  );

  const authStub = {
    // Return objects shaped like supabase responses so callers can handle them safely
    signInWithOAuth: async () => ({ data: null, error: notInitializedError }),
    signInWithPassword: async () => ({ data: null, error: notInitializedError }),
    signUp: async () => ({ data: null, error: notInitializedError }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getSessionFromUrl: async () => ({ data: null, error: notInitializedError }),
    onAuthStateChange: (cb) => {
      // return a subscription-like object with unsubscribe no-op
      // silently no-op; callers should handle missing sessions
      const subscription = { unsubscribe: () => {} };
      return { data: { subscription } };
    },
    // Sign-out should be a no-op in the stub (resolve without throwing)
    signOut: async () => ({ data: null, error: notInitializedError }),
  };

  return { auth: authStub };
}

const supabaseClient = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : createStubClient();

export const supabase = supabaseClient;
export default supabaseClient;
