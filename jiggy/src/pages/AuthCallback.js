import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    async function handle() {
      try {
        // First try to parse tokens from the URL and store session
        console.log('[AuthCallback] attempting getSessionFromUrl with location:', window.location.href);

        if (supabase?.auth && typeof supabase.auth.getSessionFromUrl === 'function') {
          const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
          console.log('[AuthCallback] getSessionFromUrl result', { data, error });

          // If we got a session, go home
          const session = data?.session ?? null;
          if (session) {
            setMessage('Sign-in successful, redirecting...');
            navigate('/');
            return;
          }
        } else {
          console.warn('[AuthCallback] supabase.auth.getSessionFromUrl is not available; falling back to manual hash parsing');
          // Fallback: parse the hash for tokens and try to set the session manually
          const hash = window.location.hash?.replace(/^#/, '');
          const params = new URLSearchParams(hash || '');
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          console.log('[AuthCallback] parsed hash tokens', { access_token: !!access_token, refresh_token: !!refresh_token });

          if (access_token) {
            if (supabase?.auth && typeof supabase.auth.setSession === 'function') {
              try {
                const { data: setData, error: setError } = await supabase.auth.setSession({ access_token, refresh_token });
                console.log('[AuthCallback] setSession result', { setData, setError });
                if (setData?.session) {
                  setMessage('Sign-in successful (via manual setSession), redirecting...');
                  navigate('/');
                  return;
                }
              } catch (setErr) {
                console.error('[AuthCallback] error calling setSession fallback', setErr);
              }
            } else {
              console.warn('[AuthCallback] supabase.auth.setSession not available; cannot complete manual session set');
            }
          }
        }

        // Fallback: maybe Supabase already created a session for us, try to fetch it
        if (supabase?.auth && typeof supabase.auth.getSession === 'function') {
          const { data: sessionData } = await supabase.auth.getSession();
          console.log('[AuthCallback] getSession fallback result', { sessionData });
          if (sessionData?.session) {
            setMessage('Sign-in successful (via stored session), redirecting...');
            navigate('/');
            return;
          }
        }

        // If we reach here, no session found. Show an informative message.
        setMessage('No session found after OAuth. Please try signing in again.');
        console.warn('[AuthCallback] no session found. URL:', window.location.href);
      } catch (err) {
        console.error('[AuthCallback] exception', err);
        setMessage('Sign-in failed — check console for details.');
        // keep the user on this page so they can retry from the UI
      }
    }
    handle();
  }, [navigate]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="text-lg font-medium">{message}</div>
      <div className="mt-4 text-sm text-gray-600">If you see this message for more than a few seconds, check the browser console and network tab for redirect errors.</div>
    </div>
  );
}
