import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Page from './PageWrapper';
import Card from '../components/Card';
import { CountdownOverlay, ProgressBar } from '../components/PlayPrimitives';
import { generateSegments } from '../utils/data';
import { PrimaryButton, OutlineButton } from '../components/Buttons';
import { supabase } from '../utils/supabase';

export default function SoloPlay({ id }) {
  const nav = useNavigate();
  const [totalMs, setTotalMs] = useState(0);
  const [count, setCount] = useState(5);
  const [started, setStarted] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [showUnmutePrompt, setShowUnmutePrompt] = useState(false);
  const [segments, setSegments] = useState(() => generateSegments(totalMs));

  useEffect(() => {
    if (!countdownActive) return;
    if (started) return;
    const t = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(t);
          setStarted(true);
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [started, countdownActive]);

  // (handlers are attached directly to the <video> element via props)

  // regenerate segments when totalMs changes
  useEffect(() => {
    if (totalMs > 0) setSegments(generateSegments(totalMs));
    else setSegments([]);
  }, [totalMs]);

  function formatMs(ms) {
    if (!ms || ms <= 0) return '0:00';
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // download the reference video and create object URL
  useEffect(() => {
    let mounted = true;
    let objectUrl = null;
    async function loadRef() {
      try {
        const { data, error } = await supabase.storage.from('assets').download(`videos/${id}`);
        if (error) {
          console.error('Failed to download reference video', error);
          if (mounted) setVideoError(error.message || JSON.stringify(error));
          return;
        }
  objectUrl = URL.createObjectURL(data);
  if (mounted) setVideoUrl(objectUrl);
      } catch (e) {
        console.error('Error loading reference video', e);
        if (mounted) setVideoError(e.message || String(e));
      }
    }
    loadRef();
    return () => {
      mounted = false;
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      }
    };
  }, [id]);

  // try to get the webcam stream and attach to cameraRef
  useEffect(() => {
    let mounted = true;
    let localStream = null;
    async function startCamera() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!mounted) {
          localStream.getTracks().forEach(t => t.stop());
          return;
        }
        setCameraStream(localStream);
        if (cameraRef.current) cameraRef.current.srcObject = localStream;
      } catch (e) {
        console.warn('Could not start camera', e);
      }
    }
    startCamera();
    return () => {
      mounted = false;
      if (cameraRef.current) cameraRef.current.srcObject = null;
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // when countdown finishes, start playing the reference video
  useEffect(() => {
    if (!started) return;
    if (!videoRef.current) return;
    // Try to play with sound first (user pressed START earlier). Some browsers
    // may still block autoplay with audio; if that happens show an unmute prompt.
    try {
      videoRef.current.muted = false;
    } catch (e) {
      // ignore
    }
    const p = videoRef.current.play();
    if (p && p.catch) {
      p.catch((e) => {
        console.warn('Autoplay with audio blocked, falling back to muted playback:', e);
        try {
          videoRef.current.muted = true;
          const p2 = videoRef.current.play();
          if (p2 && p2.catch) p2.catch(() => {});
        } catch (e2) {}
        setShowUnmutePrompt(true);
      });
    }
  }, [started, videoUrl]);

  const done = elapsed >= totalMs;

  const score = useMemo(() => {
    const sums = { red: 0, yellow: 0, green: 0 };
    for (const s of segments) sums[s.color] += s.dur;
    const seconds = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, (v / 1000).toFixed(1)]));
    const totalScore = Math.round(sums.green * 1 + sums.yellow * 0.5);
    return { seconds, totalScore };
  }, [segments]);

  // scroll the window down past the header so the play area is visible
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const header = document.querySelector('header');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        // smooth scroll past the header, with a small offset
        window.scrollTo({ top: headerHeight + 8, behavior: 'smooth' });
      } catch (e) {
        // ignore
      }
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Header />
      <Page>
        {/* scroll past the header on mount so the play area is visible on laptop screens */}
        <div className="relative">
          {/* 3-column layout: camera | controls | reference */}
          <div className="mb-4 grid gap-6" style={{ gridTemplateColumns: '1fr 220px 1fr' }}>
            <Card padded={false} className="aspect-[2/3] w-full overflow-hidden">
              <div className="relative h-full w-full bg-gray-100">
                <video ref={cameraRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                {/* recording indicator removed as requested */}
              </div>
            </Card>

            <div className="relative flex items-center justify-center">
              {/* center column: show Start button or countdown overlay */}
              {!countdownActive && !started && (
                <PrimaryButton onClick={() => setCountdownActive(true)}>START</PrimaryButton>
              )}

              {!started && countdownActive && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <CountdownOverlay value={count} />
                </div>
              )}
            </div>

            <Card padded={false} className="aspect-[2/3] w-full overflow-hidden">
              <div className="flex h-full w-full items-center justify-center bg-black/80 text-white">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="h-full w-full object-cover"
                    playsInline
                    muted
                    controls={false}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      console.debug('reference video loadedmetadata duration(s):', d);
                      if (d && isFinite(d) && d > 0) {
                        const ms = Math.round(d * 1000);
                        setTotalMs(ms);
                        setSegments(generateSegments(ms));
                        setElapsed(0);
                      }
                    }}
                    onTimeUpdate={(e) => setElapsed(Math.round(e.currentTarget.currentTime * 1000))}
                    onEnded={() => setElapsed(Math.round((videoRef.current?.duration || 0) * 1000))}
                  />
                ) : videoError ? (
                  <div className="text-sm text-red-300">Unable to load reference video</div>
                ) : (
                  <div className="text-xl">Loading reference…</div>
                )}
                {showUnmutePrompt && (
                  <div className="absolute inset-0 flex items-end justify-center p-4 pointer-events-none">
                    <button
                      className="pointer-events-auto rounded bg-white/90 px-3 py-1 text-sm font-semibold"
                      onClick={() => {
                        try {
                          if (videoRef.current) {
                            videoRef.current.muted = false;
                            const p = videoRef.current.play();
                            if (p && p.catch) p.catch(() => {});
                          }
                        } catch (e) {}
                        setShowUnmutePrompt(false);
                      }}
                    >
                      Unmute
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{formatMs(elapsed)}</span>
          <span>{formatMs(totalMs)}</span>
        </div>
  <ProgressBar segments={segments} elapsed={elapsed} total={totalMs} />

        

        {done && (
          <Card className="mt-8">
            <h3 className="mb-2 text-xl font-bold">Great job! 🎉</h3>
            <p className="text-sm text-gray-700">
              Green seconds: <b>{score.seconds.green}s</b> — Yellow seconds: <b>{score.seconds.yellow}s</b> — Red seconds: <b>{score.seconds.red}s</b>
            </p>
            <p className="mt-2 text-lg font-semibold">Score: {score.totalScore}</p>
            <div className="mt-4 flex gap-3">
              <PrimaryButton onClick={() => nav('/')}>Back to Dances</PrimaryButton>
              <OutlineButton onClick={() => window.location.reload()}>Retry</OutlineButton>
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}
