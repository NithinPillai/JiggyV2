import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Page from './PageWrapper';
import Card from '../components/Card';
import { CountdownOverlay, ProgressBar } from '../components/PlayPrimitives';
import { generateSegments } from '../utils/data';
import { PrimaryButton, OutlineButton } from '../components/Buttons';

export default function SoloPlay({ id }) {
  const nav = useNavigate();
  const totalMs = 11000;
  const [count, setCount] = useState(5);
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const segments = useMemo(() => generateSegments(totalMs), []);

  useEffect(() => {
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
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const t0 = performance.now();
    const r = () => {
      const dt = performance.now() - t0;
      setElapsed(dt);
      if (dt < totalMs) requestAnimationFrame(r);
    };
    const raf = requestAnimationFrame(r);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  const done = elapsed >= totalMs;

  const score = useMemo(() => {
    const sums = { red: 0, yellow: 0, green: 0 };
    for (const s of segments) sums[s.color] += s.dur;
    const seconds = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, (v / 1000).toFixed(1)]));
    const totalScore = Math.round(sums.green * 1 + sums.yellow * 0.5);
    return { seconds, totalScore };
  }, [segments]);

  return (
    <>
      <Header />
      <Page>
        <div className="relative">
          <div className="mb-6 grid grid-cols-2 gap-10">
            <Card padded={false} className="aspect-[9/16] w-full overflow-hidden">
              <div className="flex h-full w-full items-center justify-center bg-black/80 text-white">
                <span className="text-xl">Reference Video #{id}</span>
              </div>
            </Card>

            <Card padded={false} className="aspect-[9/16] w-full overflow-hidden">
              <div className="flex h-full w-full items-center justify-center bg-gray-100">
                <span className="text-xl text-gray-500">Your Camera</span>
              </div>
            </Card>
          </div>

          {!started && <CountdownOverlay value={count} />}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>0:00</span>
          <span>0:11</span>
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
