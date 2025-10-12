import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthedUser, useAuthRedirect } from '../utils/auth';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const user = useAuthedUser();
  const { logout } = useAuthRedirect() || {};
  const nav = useNavigate();

  return (
    <header className="w-full border-b border-gray-200 jiggy-header-bg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-4 select-none">
          {/* Larger logo: using text + svg icon */}
            <div className="flex items-center gap-2">
              <img src={'../logo.svg'} alt="Jiggy logo" className="h-12 w-auto" />
            </div>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="text-sm text-gray-700">{user.email}</div>
              <button
                onClick={async () => {
                  try {
                    await logout?.();
                  } finally {
                    // navigate to login regardless to refresh UI
                    nav('/login');
                  }
                }}
                className="px-3 py-1 rounded bg-white/30"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="px-3 py-1 rounded bg-white/30">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
