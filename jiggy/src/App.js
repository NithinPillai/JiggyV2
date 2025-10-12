import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './utils/auth';
import Home from './pages/Home';
import Header from './components/Header';
import { Login, Signup } from './pages/AuthPages';
import SoloPlay from './pages/SoloPlay';
import AuthCallback from './pages/AuthCallback';

function PlayRouteWrapper() {
  const id = window.location.pathname.split('/').pop();
  return <SoloPlay id={id} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<><Header /><Home /></>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/play/:id" element={<PlayRouteWrapper />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

/*********************************
 * Tailwind setup notes (add to your project):
 * - Ensure Tailwind CSS is configured. The canvas preview includes Tailwind.
 * - Replace placeholder video & thumbnails with your CDN/S3 URLs.
 * - Wire up webcam with getUserMedia when ready.
 * - Hook score submission to your backend in SoloPlay's `done` block.
 *********************************/
