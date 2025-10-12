import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Page from './PageWrapper';
import Card from '../components/Card';
import { TextInput } from '../components/Primitives';
import { PrimaryButton } from '../components/Buttons';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { supabase } from '../utils/supabase';
import { useAuthRedirect } from '../utils/auth';

export const AuthLayout = ({ title, children, footer }) => (
  <div className="flex min-h-[70vh] items-center justify-center">
    <Card className="w-full max-w-md">
      <h1 className="mb-6 text-center text-2xl font-extrabold tracking-wider">{title}</h1>
      <div className="space-y-4">{children}</div>
      {footer}
    </Card>
  </div>
);

export function Login() {
  const nav = useNavigate();
  const { login } = useAuthRedirect();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async () => {
    setLoading(true);
    setError('');
    console.log('[Auth] handleEmailLogin start', { email });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[Auth] signInWithPassword response', { data, error });
      setLoading(false);
      if (error) {
        console.error('Sign-in error', error.message || error);
        setError(error.message || String(error));
        return;
      }

      const user = data?.user ?? data?.session?.user ?? null;
      if (!user) {
        setError('Sign-in succeeded but user was not returned.');
        return;
      }

      // update local auth state
      login?.(user);
      nav('/');
    } catch (err) {
      setLoading(false);
      console.error('Sign-in exception', err);
      setError(err.message || String(err));
    }
  };
  const handleForgotPassword = async () => {
    const targetEmail = window.prompt('Enter the email to send password reset to:', email || '');
    if (!targetEmail) return;
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(targetEmail, { redirectTo: `${window.location.origin}/auth/callback` });
      setLoading(false);
      if (error) {
        console.error('Reset password error', error);
        setError(error.message || String(error));
        return;
      }
      // Inform the user to check their inbox
      setError('Password reset email sent. Check your inbox.');
    } catch (err) {
      setLoading(false);
      console.error('Reset password exception', err);
      setError(err.message || String(err));
    }
  };
  return (
    <>
      <Header />
      <Page>
        <AuthLayout
          title="LOG IN"
          footer={
            <div className="mt-6 text-center text-sm text-gray-500">
              <Link to="/signup" className="underline">Create Account</Link>
            </div>
          }
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Email</label>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="something@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Password</label>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <div className="mt-1 text-right text-xs text-gray-500">Forgot Password</div>
          <div className="mt-1 text-right text-xs">
            <button onClick={handleForgotPassword} className="text-indigo-600 underline text-xs">Forgot Password</button>
          </div>
          </div>
          <PrimaryButton className="w-full" onClick={handleEmailLogin} disabled={loading}>{loading ? 'Signing in...' : 'LOGIN'}</PrimaryButton>
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
          <div className="mt-2"><GoogleLoginButton /></div>
        </AuthLayout>
      </Page>
    </>
  );
}

export function Signup() {
  const nav = useNavigate();
  const { login } = useAuthRedirect();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleSignup = async () => {
    if (password !== confirm) {
      console.error('Passwords do not match');
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    console.log('[Auth] handleSignup start', { email });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      console.log('[Auth] signUp response', { data, error });
      setLoading(false);
      if (error) {
        console.error('Sign-up error', error.message || error);
        setError(error.message || String(error));
        return;
      }

      const user = data?.user ?? data?.session?.user ?? null;
      // supabase often requires email confirmation; if user is present we sign them in locally
      if (user) login?.(user);
      nav('/');
    } catch (err) {
      setLoading(false);
      console.error('Sign-up exception', err);
      setError(err.message || String(err));
    }
  };
  return (
    <>
      <Header />
      <Page>
        <AuthLayout
          title="SIGN UP"
          footer={
            <div className="mt-6 text-center text-sm text-gray-500">
              <Link to="/login" className="underline">Go to Login</Link>
            </div>
          }
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Email</label>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="something@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Password</label>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Confirm Password</label>
            <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
          </div>
          <PrimaryButton className="w-full" onClick={handleSignup} disabled={loading}>{loading ? 'Creating...' : 'CREATE ACCOUNT'}</PrimaryButton>
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
          <div className="mt-2"><GoogleLoginButton /></div>
        </AuthLayout>
      </Page>
    </>
  );
}

