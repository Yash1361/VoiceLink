import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, CameraOff, Sparkles, Cpu, Activity, Play, Pause } from "lucide-react";
import { useBlendshapeGestures } from "./hooks/useGesture";


// MediaPipe Tasks (loaded at runtime from CDN)
// We dynamically import to avoid SSR issues and to keep this as a single-file app.

export default function FaceLandmarkerApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const faceLandmarkerConstantsRef = useRef<any>(null);
  const drawingUtilsRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const shouldTranscribeRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string>("Loading model…");
  const [blendShapes, setBlendShapes] = useState<{ name: string; score: number }[]>([]);
  const [fps, setFps] = useState<number>(0);
  const [useGPU, setUseGPU] = useState(true);
  const [lineWidth, setLineWidth] = useState(1);
  const [drawMesh, setDrawMesh] = useState(true);
  const [drawIris, setDrawIris] = useState(true);
  const [drawContours, setDrawContours] = useState(true);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);


  const videoWidth = 720; // Display width; canvas will scale to the stream size

  const gestures = [
    {
      name: "Select",
      metric: "jawOpen",
      threshold: 0.40,
      framesRequired: 3,
      onActivate: () => console.log("Select triggered!")
    },
    {
      name: "Left",
      metric: "mouthLeft",
      threshold: 0.30,
      framesRequired: 1,
      onActivate: () => console.log("Left triggered!")
    },
    {
      name: "Right",
      metric: "mouthRight",
      threshold: 0.30,
      framesRequired: 3,
      onActivate: () => console.log("Right triggered!")
    },
    {
      name: "Up",
      metric: "browOuterUpLeft",
      threshold: 0.7,
      framesRequired: 1,
      onActivate: () => console.log("Up triggered!")
    },
    {
      name: "Down",
      metric: "mouthShrugLower",
      threshold: 0.35,
      framesRequired: 1,
      onActivate: () => console.log("Down triggered!")
    },
    {
      name: "Open keyboard",
      metric: "mouthFunnel",
      threshold: 0.125,
      framesRequired: 1,
      onActivate: () => console.log("Open keyboard triggered!")
    }
  ];

  const activeGestures = useBlendshapeGestures(blendShapes, gestures);


  useBlendshapeGestures(blendShapes, gestures);



  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (err) {
      console.error(err);
      setLoadingMsg("Could not access camera. Please grant permission and refresh.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    const v = videoRef.current;
    if (v && v.srcObject) {
      const stream = v.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
  }, []);

  const ensureSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setIsSpeechSupported(false);
      return null;
    }

    setIsSpeechSupported(true);
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      const finals: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript?.trim?.() ?? "";
        if (!text) continue;
        if (result.isFinal) {
          finals.push(text);
        } else {
          interim += `${text} `;
        }
      }
      setTranscript(finals.join("\n").trim());
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error", event);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setSpeechError("Microphone access was blocked. Allow it in Safari settings and try again.");
        shouldTranscribeRef.current = false;
        recognition.stop();
        setIsTranscribing(false);
      } else {
        setSpeechError(event.error ?? "Speech recognition error");
      }
    };

    recognition.onend = () => {
      if (shouldTranscribeRef.current) {
        try {
          recognition.start();
        } catch (err) {
          console.warn("Speech recognition restart failed", err);
        }
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const startTranscription = useCallback(() => {
    const recognition = ensureSpeechRecognition();
    if (!recognition) return;

    setSpeechError(null);
    setTranscript("");
    setInterimTranscript("");
    shouldTranscribeRef.current = true;
    if (isTranscribing) return;

    try {
      recognition.start();
      setIsTranscribing(true);
    } catch (err: any) {
      if (err?.name !== "InvalidStateError") {
        console.warn("Speech recognition start failed", err);
        setSpeechError("Could not start transcription. Try again.");
      }
    }
  }, [ensureSpeechRecognition, isTranscribing]);

  const stopTranscription = useCallback(() => {
    shouldTranscribeRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (err) {
      console.warn("Speech recognition stop failed", err);
    }
    setIsTranscribing(false);
    setInterimTranscript("");
  }, []);

  const loadModel = useCallback(async () => {
    setLoadingMsg("Loading MediaPipe Tasks…");
    const vision: any = await import(
      // @ts-ignore
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
    );
    const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;
    faceLandmarkerConstantsRef.current = FaceLandmarker;

    setLoadingMsg("Loading WASM files…");
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    setLoadingMsg("Loading face landmarker model…");
    faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: useGPU ? "GPU" : "CPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });

    drawingUtilsRef.current = DrawingUtils;
    setIsReady(true);
    setLoadingMsg("");
  }, [useGPU]);

  const draw = useCallback((results: any) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results?.faceLandmarks) return;

    const DrawingUtils = drawingUtilsRef.current;
    const du = new DrawingUtils(ctx);

    const FaceLandmarkerConstants = faceLandmarkerConstantsRef.current;
    if (!FaceLandmarkerConstants) return;

    for (const landmarks of results.faceLandmarks) {
      if (drawMesh) {
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_TESSELATION, {
          color: "#C0C0C070",
          lineWidth,
        });
      }
      if (drawContours) {
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_RIGHT_EYE, { color: "#FF3030", lineWidth });
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_RIGHT_EYEBROW, { color: "#FF3030", lineWidth });
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_LEFT_EYE, { color: "#30FF30", lineWidth });
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_LEFT_EYEBROW, { color: "#30FF30", lineWidth });
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_FACE_OVAL, { color: "#E0E0E0", lineWidth });
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_LIPS, { color: "#E0E0E0", lineWidth });
      }
      if (drawIris) {
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_RIGHT_IRIS, { color: "#FF3030", lineWidth });
        du.drawConnectors(landmarks, FaceLandmarkerConstants.FACE_LANDMARKS_LEFT_IRIS, { color: "#30FF30", lineWidth });
      }
    }
  }, [drawContours, drawIris, drawMesh, lineWidth]);

  const loop = useCallback(() => {
    const v = videoRef.current!;
    const c = canvasRef.current!;
    const faceLandmarker = faceLandmarkerRef.current;

    if (!v || !c || !faceLandmarker) return;

    // Fit canvas to the incoming stream size
    const ratio = v.videoHeight / v.videoWidth || 0.5625; // fallback 16:9
    v.style.width = `${videoWidth}px`;
    v.style.height = `${videoWidth * ratio}px`;
    c.style.width = `${videoWidth}px`;
    c.style.height = `${videoWidth * ratio}px`;
    c.width = v.videoWidth;
    c.height = v.videoHeight;

    const start = performance.now();
    const results = faceLandmarker.detectForVideo(v, start);

    // Blendshapes
    const shapes = results?.faceBlendshapes?.[0]?.categories ?? [];
    if (shapes.length) {
      const mapped = shapes.map((s: any) => ({ name: s.displayName || s.categoryName, score: s.score }));
      setBlendShapes(mapped);
    }

    draw(results);

    const elapsed = performance.now() - start;
    const currentFps = elapsed > 0 ? Math.min(60, Math.round(1000 / elapsed)) : 0;
    setFps(currentFps);

    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  const start = useCallback(async () => {
    if (!isReady) {
      await loadModel();
    }
    await startCamera();
    setIsRunning(true);
    startTranscription();
    rafRef.current = requestAnimationFrame(loop);
  }, [isReady, loadModel, loop, startCamera, startTranscription]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopCamera();
    stopTranscription();
    setIsRunning(false);
  }, [stopCamera, stopTranscription]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopCamera();
      stopTranscription();
    };
  }, [stopCamera, stopTranscription]);

  // When GPU toggle changes, reload the model with new delegate
  useEffect(() => {
    // If model is already loaded and app is running, reload quietly
    const reload = async () => {
      if (!isRunning) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (faceLandmarkerRef.current) {
        try { faceLandmarkerRef.current.close?.(); } catch { }
      }
      await loadModel();
      rafRef.current = requestAnimationFrame(loop);
    };
    // We only reload if already running to avoid surprising users
    // They can also switch before starting.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    reload();
  }, [useGPU]);

  const header = (
    <div className="w-full max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-8 h-8" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Face Landmarks — Webcam</h1>
        </div>
        <div className="text-sm opacity-70">Powered by MediaPipe Tasks Vision</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {header}

      <div className="w-full max-w-6xl mx-auto px-4 pb-20">
        {/* Controls */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-2xl shadow-sm bg-white border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5" />
              <span className="font-medium">Status</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isRunning ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {isRunning ? "Running" : "Stopped"}
            </span>
          </div>
          <div className="p-4 rounded-2xl shadow-sm bg-white border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5" />
              <span className="font-medium">Delegate</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm mr-2">CPU</label>
              <input type="checkbox" className="toggle toggle-sm" checked={useGPU} onChange={(e) => setUseGPU(e.target.checked)} />
              <label className="text-sm">GPU</label>
            </div>
          </div>
          <div className="p-4 rounded-2xl shadow-sm bg-white border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Camera className="w-5 h-5" />
              <span className="font-medium">FPS</span>
            </div>
            <span className="font-mono text-sm">{fps}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          {!isRunning ? (
            <button onClick={start} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl shadow">
              <Play className="w-4 h-4" /> Start camera & detection
            </button>
          ) : (
            <button onClick={stop} className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl shadow">
              <Pause className="w-4 h-4" /> Stop
            </button>
          )}

          <div className="flex items-center gap-4 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <label className="text-sm">Line width</label>
            <input
              type="range"
              min={1}
              max={4}
              value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={drawMesh} onChange={(e) => setDrawMesh(e.target.checked)} /> Mesh
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={drawContours} onChange={(e) => setDrawContours(e.target.checked)} /> Contours
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={drawIris} onChange={(e) => setDrawIris(e.target.checked)} /> Iris
            </label>
          </div>
        </div>

        {/* Video + Canvas */}
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-black">
              <video
                ref={videoRef}
                className="block w-full h-auto object-contain [transform:rotateY(180deg)]"
                playsInline
                muted
                autoPlay
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 [transform:rotateY(180deg)] pointer-events-none"
              />
              {!isRunning && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/40 text-white flex items-center justify-center text-center p-6">
                  <div>
                    <CameraOff className="w-10 h-10 mx-auto mb-3" />
                    <p className="font-medium">Camera is off</p>
                    <p className="text-white/80 text-sm">Click “Start camera & detection” to begin.</p>
                  </div>
                </div>
              )}
            </div>
            {loadingMsg && !isReady && (
              <div className="mt-3 text-sm text-slate-600">{loadingMsg}</div>
            )}
          </div>

          {/* Blendshapes */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Blendshape Metrics</h2>
            <p className="text-sm text-slate-600 mb-4">
              Real-time expression coefficients (0.0–1.0) from the model — useful for animation or analytics.
            </p>
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {blendShapes.length === 0 && (
                <div className="text-sm text-slate-500">No face detected yet.</div>
              )}
              {blendShapes.map((b) => (
                <div key={b.name} className="grid grid-cols-[140px_1fr_48px] items-center gap-2">
                  <div className="text-right pr-2 text-xs text-slate-600 truncate">{b.name}</div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.max(0, Math.min(1, b.score)) * 100}%` }}
                    />
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums">{b.score.toFixed(3)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-sm font-semibold mb-1">Active Gestures:</h3>
            {activeGestures.length === 0 ? (
              <span className="text-slate-400 text-sm">None</span>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {activeGestures.map((g) => (
                  <span key={g} className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Transcription */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Live Transcription</h2>
          {isSpeechSupported ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-3 min-h-[160px]">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isTranscribing && isRunning ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                >
                  {isTranscribing && isRunning ? "Listening" : "Idle"}
                </span>
                {speechError ? <span className="text-rose-600">{speechError}</span> : null}
              </div>
              <div className="w-full min-h-[100px] rounded-xl bg-slate-50 p-3 border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap">
                {transcript ? (
                  <span>{transcript}</span>
                ) : (
                  <span className="text-slate-400">Speak to see the transcript in real time.</span>
                )}
                {interimTranscript && (
                  <span className="text-slate-400 block mt-2 italic">{interimTranscript}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
              Live transcription is not supported in this browser. Safari 16+ on macOS/iOS should support it when microphone access is allowed.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-10 text-xs text-slate-500">
          <p>
            This demo runs entirely in your browser using WebAssembly/WebGL via MediaPipe Tasks Vision. No video is
            uploaded.
          </p>
        </div>
      </div>
    </div>
  );
}
