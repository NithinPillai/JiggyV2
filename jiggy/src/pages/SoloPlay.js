import React, { useEffect, useMemo, useState, useRef } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Page from "./PageWrapper";
import Card from "../components/Card";
import { CountdownOverlay, ProgressBar } from "../components/PlayPrimitives";
import { generateSegments } from "../utils/data";
import { PrimaryButton, OutlineButton } from "../components/Buttons";
import { supabase } from "../utils/supabase";

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
  const overlayRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const [showUnmutePrompt, setShowUnmutePrompt] = useState(false);
  const [segments, setSegments] = useState([]); // for <ProgressBar />
  const segmentsRef = useRef([]); // { start, dur, color }[]
  const csvFramesRef = useRef(null); // [{ time_ms: number, points: Map(landmarkId -> {x,y,z}) }, ...]
  const [csvReady, setCsvReady] = useState(false);
  const startedRef = useRef(false);
  const csvReadyRef = useRef(false);
  const bucketsRef = useRef({ green: 0, yellow: 0, red: 0 });

  // Track current color segment to accumulate deltas
  const phaseRef = useRef({ lastColor: null, lastMs: null });

  // Optional: mirror in state for UI (seconds + score)
  const [phaseSeconds, setPhaseSeconds] = useState({
    green: 0,
    yellow: 0,
    red: 0,
  });
  const BLAZEPOSE_CONNECTIONS = [
    // Torso
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],

    // Left arm
    [11, 13],
    [13, 15],
    // Right arm
    [12, 14],
    [14, 16],

    // Left leg
    [23, 25],
    [25, 27],
    // Right leg
    [24, 26],
    [26, 28],

    // Feet (ankle ↔ heel ↔ foot index)
    [27, 29],
    [29, 31],
    [27, 31], // left: ankle-heel-foot
    [28, 30],
    [30, 32],
    [28, 32], // right: ankle-heel-foot
    // Optional extra to make a small triangle on each foot
    [29, 31],
    [30, 32],

    // Hands (wrist → pinky/index/thumb + small triangle)
    // Left hand: wrist=15, pinky=17, index=19, thumb=21
    [15, 17],
    [15, 19],
    [15, 21],
    [17, 19],
    [19, 21],
    [21, 17],

    // Right hand: wrist=16, pinky=18, index=20, thumb=22
    [16, 18],
    [16, 20],
    [16, 22],
    [18, 20],
    [20, 22],
    [22, 18],
  ];
  const BODY_START = 11;
  const BODY_END = 32;
  const BODY_CONNECTIONS = BLAZEPOSE_CONNECTIONS.filter(
    ([a, b]) =>
      a >= BODY_START && b >= BODY_START && a <= BODY_END && b <= BODY_END,
  );

  // === Config ===
  // If you visually mirror the <video> (e.g., CSS scaleX(-1) for front cam), set this true so we mirror the overlay too.
  const MIRROR = true; // always mirror the video element and overlay
  function toConnectionPairs(CONN) {
    if (Array.isArray(CONN) && Array.isArray(CONN[0])) return CONN;
    const out = [];
    if (CONN && typeof CONN.length === "number") {
      for (let k = 0; k + 1 < CONN.length; k += 2)
        out.push([CONN[k], CONN[k + 1]]);
    }
    return out;
  }

  // How close (degrees) a live joint must be to the reference to count as "accepted"
  const ANGLE_TOL = 15; // tweak to taste
  useEffect(() => {
    // A single function we can call from anywhere to accumulate time + segments.
    // It uses the *reference video clock* (nowMs).
    function accumulatePhaseImpl(nowMs, color) {
      const s = phaseRef.current;
      const buckets = bucketsRef.current;

      // First sample
      if (s.lastMs == null) {
        s.lastMs = nowMs;
        s.lastColor = color;
        return;
      }

      // If time went backwards (scrub), restart accumulation from here
      if (nowMs < s.lastMs) {
        s.lastMs = nowMs;
        s.lastColor = color;
        // Optionally reset segments if you support scrubbing:
        // segmentsRef.current = [];
        // setSegments([]);
        return;
      }

      // Elapsed since last sample
      const dt = nowMs - s.lastMs;
      if (dt <= 0) {
        // nothing to add
        s.lastMs = nowMs;
        s.lastColor = color;
        return;
      }

      // 1) Buckets (seconds UI)
      if (s.lastColor) {
        buckets[s.lastColor] += dt;
      }

      // 2) Segments (progress bar)
      const segs = segmentsRef.current;
      if (!segs.length) {
        // start first segment at lastMs
        segs.push({ start: s.lastMs, dur: dt, color: s.lastColor || color });
      } else {
        const last = segs[segs.length - 1];
        if (s.lastColor === last.color) {
          // same color → extend
          last.dur += dt;
        } else {
          // color changed → close previous and start new one
          segs.push({ start: s.lastMs, dur: dt, color: s.lastColor || color });
        }
      }

      // If color changed, next dt will contribute to new color
      s.lastMs = nowMs;
      s.lastColor = color;

      // Push to state (renders the bar)
      setSegments([...segs]);
    }

    // expose it via ref so we can call in onEnded safely
    accumulatePhaseRef.current = accumulatePhaseImpl;
  }, []);
  const accumulatePhaseRef = useRef(() => {});
  function colorFromAccepted(accepted) {
    if (accepted > 4) return "green";
    if (accepted > 2) return "yellow";
    return "red";
  }

  function accumulatePhase(nowMs, color) {
    accumulatePhaseRef.current(nowMs, color);
  }

  // The 6 joints you want to score, in CSV header order
  const JOINT_KEYS = [
    "right_elbow",
    "left_elbow",
    "right_knee",
    "left_knee",
    "right_shoulder",
    "left_shoulder",
  ];

  // indices for angle calc (a,b,c means angle at b using points a-b-c)
  const IDX = {
    // match your Python mapping (note: BlazePose indices)
    right_elbow: [12, 14, 16], // shoulder, elbow, wrist
    left_elbow: [11, 13, 15],
    right_knee: [24, 26, 28], // hip, knee, ankle
    left_knee: [23, 25, 27],
    right_shoulder: [14, 12, 24], // elbow, shoulder, hip
    left_shoulder: [13, 11, 23],
  };

  // --- helpers (top-level in SoloPlay) ---
  function scoreToStars(totalScore, totalMs) {
    if (!totalMs) return 0;
    const maxScore = totalMs / 1000; // all-green seconds
    const ratio = Math.max(0, Math.min(1, totalScore / maxScore));
    return Math.round(ratio * 5 * 2) / 2; // nearest 0.5
  }

  function starsLabel(stars) {
    if (stars >= 4.5) return "Excellent";
    if (stars >= 3.5) return "Great";
    if (stars >= 2.5) return "Good";
    if (stars >= 1.5) return "Fair";
    if (stars > 0) return "Needs Work";
    return "No Score";
  }

  // Simple visual using Unicode (no extra deps)
  function StarRating({ value }) {
    const stars = Math.max(0, Math.min(5, value));
    const full = Math.floor(stars);
    const half = stars - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return (
      <div className="flex items-center gap-1 text-amber-400 text-2xl leading-none">
        {"★".repeat(full)}
        {half ? "☆".slice(0, 0) || "⯪" : "" /* fallback half glyph */}
        {half ? "⯨" /* half-star fallback */ : ""}
        {"☆".repeat(empty)}
        {/* If your fonts don’t have half-star, swap to SVG below */}
      </div>
    );
  }

  function StarIcon({ fill = 1 }) {
    // fill: 1 = full, 0.5 = half, 0 = empty
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="inline-block">
        <defs>
          <linearGradient id="half">
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          d="M12 2l3.09 6.26 6.91.99-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 6.91-.99L12 2z"
          fill={
            fill === 1 ? "currentColor" : fill === 0.5 ? "url(#half)" : "none"
          }
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  function StarRating({ value }) {
    const full = Math.floor(value);
    const half = value - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return (
      <div className="flex items-center gap-[2px] text-amber-400">
        {Array.from({ length: full }, (_, i) => (
          <StarIcon key={"f" + i} fill={1} />
        ))}
        {half ? <StarIcon fill={0.5} /> : null}
        {Array.from({ length: empty }, (_, i) => (
          <StarIcon key={"e" + i} fill={0} />
        ))}
      </div>
    );
  }

  // basic 2D angle helper (degrees)
  function angleDeg(a, b, c) {
    // angle at b between vectors ba and bc
    const bax = a.x - b.x,
      bay = a.y - b.y;
    const bcx = c.x - b.x,
      bcy = c.y - b.y;
    const dot = bax * bcx + bay * bcy;
    const nb = Math.hypot(bax, bay) * Math.hypot(bcx, bcy);
    if (!isFinite(nb) || nb === 0) return 181;
    const cos = Math.min(1, Math.max(-1, dot / nb));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  // Map your id to a CSV file name in assets/csv.
  // Adjust if your id format differs.
  function csvNameFromId(id) {
    // e.g. "video_3.mp4" => "video_3_pose_angles.csv"
    const base = String(id).replace(/\.[^/.]+$/, ""); // drop extension
    const stem = base.startsWith("video_") ? base : `video_${base}`;
    return `${stem}_pose_angles.csv`;
  }

  // Robust CSV parser for your schema; returns sorted frames.
  // points: Map(landmarkId -> {x,y,z}) with NaNs skipped.
  function parsePoseCsv(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines[0].split(",");

    const timeIdx = headers.indexOf("time_ms");

    // angle column indexes
    const angleIdx = Object.fromEntries(
      JOINT_KEYS.map((k) => [k, headers.indexOf(k)]),
    );

    // landmark columns
    const lmkCols = {};
    headers.forEach((h, idx) => {
      const m = /^lmk_(\d+)_([xyz])$/i.exec(h.trim());
      if (m) {
        const id = +m[1];
        const axis = m[2].toLowerCase();
        (lmkCols[id] ??= {})[axis] = idx;
      }
    });

    const frames = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (!cols.length) continue;

      const time_ms = timeIdx >= 0 ? +cols[timeIdx] : i - 1;

      // angles
      const angles = {};
      for (const k of JOINT_KEYS) {
        const idx = angleIdx[k];
        const raw = idx >= 0 ? cols[idx] : "181";
        const v = raw === "" ? 181 : +raw;
        angles[k] = Number.isFinite(v) ? v : 181;
      }

      // landmarks
      const points = new Map();
      for (const idStr in lmkCols) {
        const id = +idStr;
        const { x: xi, y: yi, z: zi } = lmkCols[id];
        if (xi == null || yi == null) continue;
        const xs = cols[xi],
          ys = cols[yi],
          zs = zi != null ? cols[zi] : undefined;
        const x = xs === "" || xs?.toLowerCase?.() === "nan" ? NaN : +xs;
        const y = ys === "" || ys?.toLowerCase?.() === "nan" ? NaN : +ys;
        const z =
          zs == null || zs === "" || zs?.toLowerCase?.() === "nan" ? 0 : +zs;
        if (Number.isFinite(x) && Number.isFinite(y))
          points.set(id, { x, y, z });
      }

      frames.push({ time_ms, angles, points });
    }

    frames.sort((a, b) => a.time_ms - b.time_ms);
    return frames;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCsv() {
      setCsvReady(false);
      csvFramesRef.current = null;

      try {
        const csvName = csvNameFromId(id);
        const { data, error } = await supabase.storage
          .from("assets")
          .download(`csv/${csvName}`);

        if (error) {
          console.warn("CSV download failed:", error.message || error);
          return;
        }

        const text = await data.text();
        const frames = parsePoseCsv(text);

        if (!cancelled) {
          csvFramesRef.current = frames;
          setCsvReady(true);
        }
      } catch (e) {
        console.warn("CSV load/parse error:", e);
      }
    }

    loadCsv();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Start webcam
  useEffect(() => {
    let mounted = true;
    let localStream = null;

    async function startCamera() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (!mounted) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (cameraRef.current) cameraRef.current.srcObject = localStream;
        setCameraStream(localStream);
      } catch (e) {
        console.warn("Could not start camera", e);
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (cameraRef.current) cameraRef.current.srcObject = null;
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try {
        poseLandmarkerRef.current?.close?.();
      } catch {}
    };
  }, []);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);
  useEffect(() => {
    csvReadyRef.current = csvReady;
  }, [csvReady]);

  // Create Pose Landmarker (VIDEO mode)
  useEffect(() => {
    let mounted = true;

    async function createPoseLandmarker() {
      const version = "0.10.0";
      const wasmPath = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`;
      const localModelPath = "/models/pose_landmarker_heavy.task";
      try {
        const vision = await FilesetResolver.forVisionTasks(wasmPath);
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: localModelPath, delegate: "GPU" }, // GPU ok; CPU also fine
          runningMode: "VIDEO",
          numPoses: 1,
          outputSegmentationMasks: false, // landmarks only for this overlay
        });
        if (!mounted) {
          try {
            landmarker.close?.();
          } catch {}
          return;
        }
        poseLandmarkerRef.current = landmarker;
      } catch (e) {
        console.warn("Failed to create PoseLandmarker", e);
      }
    }

    createPoseLandmarker();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    const iv = setInterval(() => {
      const { green, yellow, red } = bucketsRef.current;
      setPhaseSeconds({
        green: +(green / 1000).toFixed(1),
        yellow: +(yellow / 1000).toFixed(1),
        red: +(red / 1000).toFixed(1),
      });
    }, 250); // UI refresh rate; tweak
    return () => clearInterval(iv);
  }, [started]);

  // Prediction loop: draw landmarks with correct object-cover + DPR + optional mirroring
  useEffect(() => {
    let rafId = null;

    function predictWebcam() {
      const video = cameraRef.current;
      const canvas = overlayRef.current;
      const landmarker = poseLandmarkerRef.current;

      if (!video || !canvas || !landmarker) {
        rafId = requestAnimationFrame(predictWebcam);
        return;
      }

      if (video.readyState < 2) {
        rafId = requestAnimationFrame(predictWebcam);
        return;
      }

      // CSS pixel size of the overlay box
      const rect = canvas.getBoundingClientRect();
      const dstW = Math.max(1, rect.width);
      const dstH = Math.max(1, rect.height);

      // Internal pixel size for crisp rendering
      const DPR = Math.max(1, window.devicePixelRatio || 1);
      const needW = Math.round(dstW * DPR);
      const needH = Math.round(dstH * DPR);
      if (canvas.width !== needW) canvas.width = needW;
      if (canvas.height !== needH) canvas.height = needH;

      const ctx = canvas.getContext("2d");
      // Draw in CSS pixels; the browser will scale canvas bitmap by DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, dstW, dstH);

      const ts = performance.now();
      try {
        function coverTransform(srcW, srcH, dstW, dstH) {
          const scale = Math.max(dstW / srcW, dstH / srcH); // object-cover
          const offsetX = (dstW - srcW * scale) / 2;
          const offsetY = (dstH - srcH * scale) / 2;
          return { scale, offsetX, offsetY };
        }

        landmarker.detectForVideo(video, performance.now(), (result) => {
          const canvas = overlayRef.current;
          const ctx = canvas.getContext("2d");

          const rect = canvas.getBoundingClientRect();
          const dstW = rect.width;
          const dstH = rect.height;

          const DPR = Math.max(1, window.devicePixelRatio || 1);
          if (canvas.width !== Math.round(dstW * DPR))
            canvas.width = Math.round(dstW * DPR);
          if (canvas.height !== Math.round(dstH * DPR))
            canvas.height = Math.round(dstH * DPR);
          ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
          ctx.clearRect(0, 0, dstW, dstH);

          // --- PREP MAPPINGS (live vs csv) ---
          const liveSrcW = cameraRef.current.videoWidth || 1;
          const liveSrcH = cameraRef.current.videoHeight || 1;
          const {
            scale: liveScale,
            offsetX: liveOffX,
            offsetY: liveOffY,
          } = coverTransform(liveSrcW, liveSrcH, dstW, dstH);

          // For CSV, use the REFERENCE video’s intrinsic size:
          const refSrcW =
            (videoRef.current && videoRef.current.videoWidth) || liveSrcW;
          const refSrcH =
            (videoRef.current && videoRef.current.videoHeight) || liveSrcH;
          const {
            scale: csvScale,
            offsetX: csvOffX,
            offsetY: csvOffY,
          } = coverTransform(refSrcW, refSrcH, dstW, dstH);

          ctx.save();
          if (MIRROR) {
            ctx.translate(dstW, 0);
            ctx.scale(-1, 1);
          }

          // --- LIVE LANDMARKS ---
          // --- LIVE LANDMARKS ---
          const lm = result.landmarks?.[0];
          let accepted = 0;

          if (lm && lm.length) {
            // compute live angles
            const liveAngles = {};
            for (const k of JOINT_KEYS) {
              const [ia, ib, ic] = IDX[k];
              const a = lm[ia],
                b = lm[ib],
                c = lm[ic];
              const va = a?.visibility ?? 1,
                vb = b?.visibility ?? 1,
                vc = c?.visibility ?? 1;
              // match your Python: if any vis < 0.6 -> 181
              if (va < 0.6 || vb < 0.6 || vc < 0.6 || !a || !b || !c) {
                liveAngles[k] = 181;
              } else {
                // use normalized x,y for angle calc
                liveAngles[k] = angleDeg(
                  { x: a.x, y: a.y },
                  { x: b.x, y: b.y },
                  { x: c.x, y: c.y },
                );
              }
            }

            // find nearest CSV frame (you already have t, frames, idx logic below for CSV points)
            let frameAngles = null;
            if (
              startedRef.current &&
              csvReadyRef.current &&
              csvFramesRef.current?.length
            ) {
              const frames = csvFramesRef.current;
              const t = videoRef.current
                ? Math.round((videoRef.current.currentTime || 0) * 1000)
                : elapsed;
              let lo = 0,
                hi = frames.length - 1;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (frames[mid].time_ms < t) lo = mid + 1;
                else hi = mid;
              }
              let idx = lo;
              if (
                idx > 0 &&
                Math.abs(frames[idx - 1].time_ms - t) <=
                  Math.abs(frames[idx].time_ms - t)
              )
                idx--;
              frameAngles = frames[idx]?.angles || null;
            }

            // score "accepted"
            if (frameAngles) {
              let acc = 0;
              for (const k of JOINT_KEYS) {
                const refA = frameAngles[k];
                const liveA = liveAngles[k];
                if (refA === 181) {
                  // reference doesn't have this joint -> auto-accept
                  acc++;
                } else if (liveA !== 181) {
                  // both exist -> compare
                  if (Math.abs(refA - liveA) <= ANGLE_TOL) acc++;
                }
                // else liveA==181 -> do nothing
              }
              accepted = acc;
            }

            // Use reference video clock for scoring (keeps CSV + scoring in sync)
            const t = videoRef.current
              ? Math.round((videoRef.current.currentTime || 0) * 1000)
              : elapsed;

            // Current color from accepted
            const liveColor = colorFromAccepted(accepted);

            // Only accumulate after START (so pre-countdown frames don’t count)
            if (startedRef.current) {
              accumulatePhase(t, liveColor);
            }

            // Choose stroke based on accepted (keep your existing colors)
            let stroke = "#ff3b30"; // red
            if (accepted > 4)
              stroke = "#39ff14"; // green
            else if (accepted > 2) stroke = "#ffd60a"; // yellow

            // draw live connectors (body only) in chosen color
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.strokeStyle = stroke;

            for (const [i, j] of BODY_CONNECTIONS) {
              const a = lm[i],
                b = lm[j];
              if (!a || !b) continue;
              const ax = liveOffX + a.x * liveSrcW * liveScale;
              const ay = liveOffY + a.y * liveSrcH * liveScale;
              const bx = liveOffX + b.x * liveSrcW * liveScale;
              const by = liveOffY + b.y * liveSrcH * liveScale;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();
            }

            // points (body only) – optional; keep your color if you like
            ctx.fillStyle = stroke;
            for (let i = BODY_START; i <= BODY_END; i++) {
              const p = lm[i];
              if (!p) continue;
              const x = liveOffX + p.x * liveSrcW * liveScale;
              const y = liveOffY + p.y * liveSrcH * liveScale;
              ctx.beginPath();
              ctx.arc(x, y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // --- CSV LANDMARKS ---
          const canDrawCsv =
            startedRef.current &&
            csvReadyRef.current &&
            csvFramesRef.current?.length;
          if (canDrawCsv) {
            const frames = csvFramesRef.current;
            const t = videoRef.current
              ? Math.round((videoRef.current.currentTime || 0) * 1000)
              : elapsed;

            // nearest-frame search (unchanged) ...
            let lo = 0,
              hi = frames.length - 1;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (frames[mid].time_ms < t) lo = mid + 1;
              else hi = mid;
            }
            let idx = lo;
            if (
              idx > 0 &&
              Math.abs(frames[idx - 1].time_ms - t) <=
                Math.abs(frames[idx].time_ms - t)
            )
              idx--;

            const f = frames[idx];
            if (f) {
              ctx.setLineDash([8, 6]);
              ctx.lineWidth = 3;
              ctx.strokeStyle = "rgba(255,255,255,0.95)";

              for (const [i, j] of BLAZEPOSE_CONNECTIONS) {
                const a = f.points.get(i),
                  b = f.points.get(j);
                if (!a || !b) continue;
                const ax = csvOffX + a.x * refSrcW * csvScale;
                const ay = csvOffY + a.y * refSrcH * csvScale;
                const bx = csvOffX + b.x * refSrcW * csvScale;
                const by = csvOffY + b.y * refSrcH * csvScale;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
              }
              ctx.setLineDash([]);
            }
          }

          ctx.restore();
        });
      } catch (e) {
        // swallow per-frame errors
      }

      rafId = requestAnimationFrame(predictWebcam);
    }

    rafId = requestAnimationFrame(predictWebcam);
    rafRef.current = rafId;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafRef.current = null;
    };
  }, []);

  // Countdown → start reference video playback
  useEffect(() => {
    if (!countdownActive || started) return;
    const t = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(t);
          setStarted(true);
          // reset trackers
          bucketsRef.current = { green: 0, yellow: 0, red: 0 };
          phaseRef.current = { lastColor: null, lastMs: null };
          segmentsRef.current = [];
          setSegments([]);
          setPhaseSeconds({ green: 0, yellow: 0, red: 0 });
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [started, countdownActive]);

  // Regenerate segments when ref video duration known
  useEffect(() => {
    if (totalMs > 0) setSegments(generateSegments(totalMs));
    else setSegments([]);
  }, [totalMs]);

  function formatMs(ms) {
    if (!ms || ms <= 0) return "0:00";
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Load reference video from Supabase
  useEffect(() => {
    let mounted = true;
    let objectUrl = null;

    async function loadRef() {
      try {
        const { data, error } = await supabase.storage
          .from("assets")
          .download(`videos/${id}`);
        if (error) {
          console.error("Failed to download reference video", error);
          if (mounted) setVideoError(error.message || JSON.stringify(error));
          return;
        }
        objectUrl = URL.createObjectURL(data);
        if (mounted) setVideoUrl(objectUrl);
      } catch (e) {
        console.error("Error loading reference video", e);
        if (mounted) setVideoError(e.message || String(e));
      }
    }

    loadRef();
    return () => {
      mounted = false;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      }
    };
  }, [id]);

  // Autoplay/unmute prompt for reference video
  useEffect(() => {
    if (!started || !videoRef.current) return;
    try {
      videoRef.current.muted = false;
    } catch {}
    const p = videoRef.current.play();
    if (p?.catch) {
      p.catch(() => {
        try {
          videoRef.current.muted = true;
          const p2 = videoRef.current.play();
          p2?.catch?.(() => {});
        } catch {}
        setShowUnmutePrompt(true);
      });
    }
  }, [started, videoUrl]);

  const done = elapsed >= totalMs;

  const score = useMemo(() => {
    // keep your existing seconds (already in phaseSeconds)
    const totalScore = Math.round(
      phaseSeconds.green * 1 + phaseSeconds.yellow * 0.5,
    );
    const stars = scoreToStars(totalScore, totalMs);
    const label = starsLabel(stars);
    // no totalScore in the returned object anymore
    return { seconds: phaseSeconds, stars, label };
  }, [phaseSeconds, totalMs]);

  // Scroll viewport down past header
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const header = document.querySelector("header");
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        window.scrollTo({ top: headerHeight + 8, behavior: "smooth" });
      } catch {}
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Header />
      <Page>
        <div className="relative">
          <div
            className="mb-4 grid gap-6"
            style={{ gridTemplateColumns: "1fr 220px 1fr" }}
          >
            {/* Left: Webcam + Overlay */}
            <Card
              padded={false}
              className="aspect-[2/3] w-full overflow-hidden"
            >
              <div className="relative h-full w-full bg-gray-100">
                <video
                  ref={cameraRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover" // keep cover; our mapping compensates
                  style={{
                    zIndex: 1,
                    transform: MIRROR ? "scaleX(-1)" : undefined,
                  }}
                />
                <canvas
                  ref={overlayRef}
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  style={{ zIndex: 20 }}
                />
              </div>
            </Card>

            {/* Center: Controls / Countdown */}
            <div className="relative flex items-center justify-center">
              {!countdownActive && !started && (
                <PrimaryButton onClick={() => setCountdownActive(true)}>
                  START
                </PrimaryButton>
              )}
              {!started && countdownActive && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <CountdownOverlay value={count} />
                </div>
              )}
            </div>

            {/* Right: Reference Video */}
            <Card
              padded={false}
              className="aspect-[2/3] w-full overflow-hidden"
            >
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
                      if (d && isFinite(d) && d > 0) {
                        const ms = Math.round(d * 1000);
                        setTotalMs(ms);
                        setSegments(generateSegments(ms));
                        setElapsed(0);
                      }
                    }}
                    onTimeUpdate={(e) =>
                      setElapsed(Math.round(e.currentTarget.currentTime * 1000))
                    }
                    onEnded={() => {
                      const durMs = Math.round(
                        (videoRef.current?.duration || 0) * 1000,
                      );

                      if (startedRef.current) {
                        // One last accumulate to the final timestamp using the current color
                        const c = phaseRef.current.lastColor || "red";
                        accumulatePhaseRef.current(durMs, c);
                      }

                      // Update the seconds UI
                      const { green, yellow, red } = bucketsRef.current;
                      setPhaseSeconds({
                        green: +(green / 1000).toFixed(1),
                        yellow: +(yellow / 1000).toFixed(1),
                        red: +(red / 1000).toFixed(1),
                      });

                      setElapsed(durMs);
                    }}
                  />
                ) : videoError ? (
                  <div className="text-sm text-red-300">
                    Unable to load reference video
                  </div>
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
                            p?.catch?.(() => {});
                          }
                        } catch {}
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

            {/* Stars only */}
            <div className="mt-1 flex items-center gap-3">
              <StarRating value={score.stars} />
              <span className="text-sm text-gray-600">
                {score.stars.toFixed(1)} / 5 — {score.label}
              </span>
            </div>

            {/* Seconds breakdown */}
            <p className="mt-3 text-sm text-gray-700">
              Green seconds: <b>{score.seconds.green}s</b> — Yellow:{" "}
              <b>{score.seconds.yellow}s</b> — Red: <b>{score.seconds.red}s</b>
            </p>

            <div className="mt-4 flex gap-3">
              <PrimaryButton onClick={() => nav("/")}>
                Back to Dances
              </PrimaryButton>
              <OutlineButton onClick={() => window.location.reload()}>
                Retry
              </OutlineButton>
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}
