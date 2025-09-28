import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CameraOff, Sparkles, Activity, Play, Pause, X } from "lucide-react";
import { useBlendshapeGestures } from "./hooks/useGesture";


// MediaPipe Tasks (loaded at runtime from CDN)
// We dynamically import to avoid SSR issues and to keep this as a single-file app.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
const SUGGEST_ENDPOINT = `${API_BASE_URL}/suggest`;

const speakText = (text: string) => {
  if (!text) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("Speech synthesis is not supported in this browser.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
};

type SuggestionNode = {
  word: string;
  next?: SuggestionNode[];
};

type NavigatorGridOption =
  | { type: "word"; label: string }
  | { type: "submit"; label: "Submit Response" };

export default function FaceLandmarkerApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const faceLandmarkerConstantsRef = useRef<any>(null);
  const drawingUtilsRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const shouldTranscribeRef = useRef(false);
  const videoAspectRatioRef = useRef<number | null>(null);

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
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [navigatorOptions, setNavigatorOptions] = useState<string[]>(["Start Typing"]);
  const [responseWords, setResponseWords] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<SuggestionNode[]>([]);

  const columns = Math.min(3, Math.max(1, navigatorOptions.length));
  const prevActiveGesturesRef = useRef<string[]>([]);

  const responseText = useMemo(() => responseWords.join(" "), [responseWords]);
  const trimmedResponse = useMemo(() => responseText.trim(), [responseText]);
  const gridOptions = useMemo<NavigatorGridOption[]>(
    () => [
      ...navigatorOptions.map((word) => ({ type: "word" as const, label: word })),
      { type: "submit" as const, label: "Submit Response" },
    ],
    [navigatorOptions]
  );

  const resetNavigator = useCallback(() => {
    setNavigatorOptions(["Start Typing"]);
    setResponseWords([]);
    setCurrentSuggestions([]);
    setIsLoadingSuggestions(false);
    setCurrentWordIndex(0);
  }, []);
  const gestures = useMemo(() => [
  {
    name: "Select",
    metrics: [
      { name: "jawOpen", threshold: 0.4, comparison: ">" },
    ],
    framesRequired: 1,
    onActivate: () => console.log("Select triggered!")
  },
  {
    name: "Left",
    metrics: [
      { name: "mouthLeft", threshold: 0.50, comparison: ">" }
    ],
    framesRequired: 1,
    onActivate: () => console.log("Left triggered!")
  },
  {
    name: "Right",
    metrics: [
      { name: "mouthRight", threshold: 0.50 , comparison: ">" },
    ],
    framesRequired: 1,
    onActivate: () => console.log("Right triggered!")
  },
  {
    name: "Up",
    metrics: [
      { name: "browOuterUpLeft", threshold: 0.7, comparison: ">" }
    ],
    framesRequired: 1,
    onActivate: () => console.log("Up triggered!")
  },
  {
    name: "Down",
    metrics: [
      { name: "browDownLeft", threshold: 0.025, comparison: ">" },
      { name: "browDownRight", threshold: 0.025, comparison: ">" }
    ],
    framesRequired: 1,
    onActivate: () => console.log("Down triggered!")
  },
  {
    name: "Open keyboard",
    metrics: [
      { name: "mouthSmileLeft", threshold: 0.5, comparison: ">" },
      { name: "jawOpen", threshold: 0.15, comparison: "<"},
    ],
    framesRequired: 1,
    onActivate: () => console.log("Open keyboard triggered!")
  },
  {
    name: "Left Wink",
    metrics: [
      { name: "eyeBlinkLeft", threshold: 0.4, comparison: ">" as const },
      { name: "eyeBlinkRight", threshold: 0.3, comparison: "<" as const },
    ],
    framesRequired: 1,
    onActivate: () => console.log("😉 Left Wink detected!"),
  },
  {
    name: "Right Wink",
    metrics: [
      { name: "eyeBlinkRight", threshold: 0.4, comparison: ">" as const },
      { name: "eyeBlinkLeft", threshold: 0.3, comparison: "<" as const },
    ],
    framesRequired: 1,
    onActivate: () => console.log("😉 Right Wink detected!"),
  },
], []);

  const activeGestures = useBlendshapeGestures(blendShapes, gestures);
  const totalOptions = gridOptions.length;

  useEffect(() => {
    setCurrentWordIndex(0);
  }, [navigatorOptions]);

  const isSelectActive = activeGestures.includes("Select");



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

  const handleSubmitResponse = useCallback(() => {
    if (!trimmedResponse) {
      return;
    }

    speakText(trimmedResponse);
    setTranscript("");
    setInterimTranscript("");
    resetNavigator();

    stopTranscription();
    if (isRunning && isSpeechSupported) {
      startTranscription();
    }
  }, [isRunning, isSpeechSupported, resetNavigator, startTranscription, stopTranscription, trimmedResponse]);

  const handleSelectGesture = useCallback(async () => {
    if (gridOptions.length === 0) return;

    const safeIndex = Math.min(currentWordIndex, Math.max(0, gridOptions.length - 1));
    const selected = gridOptions[safeIndex];
    if (!selected) return;

    if (selected.type === "submit") {
      if (trimmedResponse) {
        handleSubmitResponse();
      }
      return;
    }

    const currentOption = selected.label.trim();
    const normalizedOption = currentOption.toLowerCase();

    if (!currentOption || normalizedOption === "loading responses...") {
      return;
    }

    if (isLoadingSuggestions) {
      return;
    }

    if (normalizedOption === "start typing") {
      const questionText = [transcript, interimTranscript].filter(Boolean).join(" ").trim();

      setIsLoadingSuggestions(true);
      setNavigatorOptions(["Loading Responses..."]);
      setCurrentSuggestions([]);
      setCurrentWordIndex(0);

      stopTranscription();

      try {
        const response = await fetch(SUGGEST_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: questionText,
            partial_answer: "",
            suggestions_count: 5,
          }),
        });

        if (!response.ok) {
          throw new Error(`Suggestion request failed: ${response.status}`);
        }

        const payload = await response.json();
        const rawSuggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];

        const normalizeNode = (node: any): SuggestionNode | null => {
          if (!node || typeof node.word !== "string") return null;
          const word = node.word.trim();
          if (!word) return null;
          const nextRaw = Array.isArray(node.next) ? node.next : [];
          const next = nextRaw
            .map((child: any) => normalizeNode(child))
            .filter(Boolean) as SuggestionNode[];
          return { word, next };
        };

        const normalized = rawSuggestions
          .map((node: any) => normalizeNode(node))
          .filter(Boolean) as SuggestionNode[];

        if (normalized.length > 0) {
          setCurrentSuggestions(normalized);
          setNavigatorOptions(normalized.map((node) => node.word));
        } else {
          setNavigatorOptions(["No suggestions available", "Start Typing"]);
          setCurrentSuggestions([]);
        }
      } catch (err) {
        console.error("Failed to load suggestions", err);
        setNavigatorOptions(["Unable to load responses", "Start Typing"]);
        setCurrentSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }

      return;
    }

    if (currentSuggestions.length === 0) {
      return;
    }

    const selectedNode = currentSuggestions[safeIndex];
    if (!selectedNode || !selectedNode.word) {
      return;
    }

    setResponseWords((prev) => [...prev, selectedNode.word]);

    const nextSuggestions = selectedNode.next ?? [];

    if (nextSuggestions.length > 0) {
      setCurrentSuggestions(nextSuggestions);
      setNavigatorOptions(nextSuggestions.map((node) => node.word));
    } else {
      setCurrentSuggestions([]);
      setNavigatorOptions(["Start Typing"]);
    }
  }, [currentSuggestions, currentWordIndex, gridOptions, handleSubmitResponse, interimTranscript, isLoadingSuggestions, navigatorOptions, stopTranscription, transcript, trimmedResponse]);

  useEffect(() => {
    const prev = prevActiveGesturesRef.current;
    const newlyActivated = activeGestures.filter((gesture) => !prev.includes(gesture));

    if (newlyActivated.length > 0) {
      newlyActivated.forEach((gesture) => {
        if (gesture === "Select") {
          handleSelectGesture();
          return;
        }

        setCurrentWordIndex((current) => {
          const lastIndex = totalOptions - 1;
          switch (gesture) {
            case "Right": {
              if (current === lastIndex) return current;
              const next = current + 1;
              return next >= navigatorOptions.length ? current : next;
            }
            case "Left": {
              if (current === lastIndex) return current; // Submit behaves like single column
              const isStartOfRow = current % columns === 0;
              return isStartOfRow ? current : current - 1;
            }
            case "Down": {
              if (current === lastIndex) return current;
              const next = current + columns;
              if (next < navigatorOptions.length) {
                return next;
              }
              return lastIndex;
            }
            case "Up": {
              if (current === lastIndex) {
                if (navigatorOptions.length === 0) return current;
                const lastWordIndex = navigatorOptions.length - 1;
                const lastRowStart = Math.max(0, Math.floor(lastWordIndex / columns) * columns);
                const lastRowLength = navigatorOptions.length - lastRowStart;
                const submitColumn = current % columns;
                const columnInLastRow = Math.min(submitColumn, Math.max(0, lastRowLength - 1));
                return lastRowStart + columnInLastRow;
              }
              const next = current - columns;
              return next >= 0 ? next : current;
            }
            default:
              return current;
          }
        });
      });
    }

    prevActiveGesturesRef.current = activeGestures;
  }, [activeGestures, columns, handleSelectGesture, navigatorOptions, totalOptions]);

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
    const inputWidth = v.videoWidth;
    const inputHeight = v.videoHeight;

    if (!inputWidth || !inputHeight) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const streamRatio = inputWidth / inputHeight;

    if (!videoAspectRatioRef.current || Math.abs(videoAspectRatioRef.current - streamRatio) > 0.001) {
      videoAspectRatioRef.current = streamRatio;
      setVideoAspectRatio(streamRatio);
    }

    const container = videoContainerRef.current;
    const displayWidth = container?.clientWidth || v.clientWidth || inputWidth;
    const displayHeight = container?.clientHeight || v.clientHeight || displayWidth / streamRatio;

    c.style.width = `${displayWidth}px`;
    c.style.height = `${displayHeight}px`;
    c.width = inputWidth;
    c.height = inputHeight;

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
    resetNavigator();
    setIsRunning(true);
    startTranscription();
    rafRef.current = requestAnimationFrame(loop);
  }, [isReady, loadModel, loop, resetNavigator, startCamera, startTranscription]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopCamera();
    stopTranscription();
    setIsRunning(false);
    resetNavigator();
  }, [resetNavigator, stopCamera, stopTranscription]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopCamera();
      stopTranscription();
    };
  }, [stopCamera, stopTranscription]);


  const header = (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-8 h-8" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">VoiceLink</h1>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-sm opacity-70 hidden sm:inline">Powered by MediaPipe Tasks Vision</span>
          <button
            onClick={() => setIsDebugOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700"
          >
            Debug
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {header}

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          {!isRunning ? (
            <button onClick={start} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl shadow">
              <Play className="w-4 h-4" /> Start camera & detection
            </button>
          ) : (
            <button onClick={stop} className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl shadow">
              <Pause className="w-4 h-4" /> Stop
            </button>
          )}
          
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <Activity className="w-5 h-5" />
            <span className="font-medium">Status</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isRunning ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {isRunning ? "Running" : "Stopped"}
            </span>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <Camera className="w-5 h-5" />
            <span className="font-medium">FPS</span>
            <span className="font-mono text-sm">{fps}</span>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] items-start">
          <div className="space-y-4">
            <div
              ref={videoContainerRef}
              className="relative w-full max-w-[720px] aspect-video rounded-2xl overflow-hidden border border-slate-200 bg-black"
              style={{ aspectRatio: videoAspectRatio ?? undefined }}
            >
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-contain [transform:rotateY(180deg)]"
                playsInline
                muted
                autoPlay
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full [transform:rotateY(180deg)] pointer-events-none"
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
              <div className="text-sm text-slate-600">{loadingMsg}</div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
              <h3 className="text-sm font-semibold mb-2">Active Gestures</h3>
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

          <div className="space-y-6">
            {isSpeechSupported ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-3 min-h-[160px]">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isTranscribing && isRunning ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {isTranscribing && isRunning ? "Listening" : "Idle"}
                  </span>
                  {speechError ? <span className="text-rose-600">{speechError}</span> : null}
                </div>
                <div className="w-full min-h-[120px] rounded-xl bg-slate-50 p-3 border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap">
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

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Word Navigator</h2>
                  <p className="text-sm text-slate-600">Highlight “Start Typing” to fetch responses, then use Select to build your reply word by word.</p>
                </div>
                {isLoadingSuggestions ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Loading…
                  </span>
                ) : null}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">My Response</div>
                <div className="mt-2 min-h-[52px] rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {responseWords.length > 0 ? (
                    <span>{responseText}</span>
                  ) : (
                    <span className="text-slate-400">No words selected yet.</span>
                  )}
                </div>
              </div>

              {navigatorOptions.length > 0 ? (
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(columns, navigatorOptions.length))}, minmax(0, 1fr))` }}
                >
                  {gridOptions.map((option, index) => {
                    const isActive = index === currentWordIndex;
                    const isSubmit = option.type === "submit";
                    const normalizedOption = option.label.trim().toLowerCase();
                    const isInformational = !isSubmit && [
                      "loading responses...",
                      "no suggestions available",
                      "unable to load responses",
                    ].includes(normalizedOption);
                    const hasResponse = Boolean(trimmedResponse);

                    let itemClasses = "rounded-xl border px-4 py-5 text-center text-sm font-medium shadow-sm transition-colors";

                    if (isSubmit) {
                      if (!hasResponse) {
                        itemClasses += " border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed";
                      } else if (isActive) {
                        itemClasses += isSelectActive
                          ? " border-emerald-500 bg-emerald-600 text-white"
                          : " border-emerald-400 bg-emerald-100 text-emerald-700";
                        itemClasses += " cursor-pointer";
                      } else {
                        itemClasses += " border-emerald-400 bg-emerald-50 text-emerald-700 cursor-pointer";
                      }
                    } else if (isInformational) {
                      itemClasses += " border-slate-200 bg-slate-50 text-slate-400";
                    } else if (isActive) {
                      itemClasses += isSelectActive
                        ? " border-emerald-400 bg-emerald-50 text-emerald-700"
                        : " border-slate-300 bg-slate-100 text-slate-900";
                    } else {
                      itemClasses += " border-slate-100 bg-white text-slate-500";
                    }

                    const spanStyle = isSubmit
                      ? { gridColumn: `1 / span ${Math.max(1, Math.min(columns, navigatorOptions.length))}` }
                      : undefined;

                    return (
                      <div
                        key={`${option.label}-${index}`}
                        className={`${itemClasses} ${isSubmit ? "py-4" : ""}`.trim()}
                        style={spanStyle}
                      >
                        {option.label}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  No suggestions available yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-xs text-slate-500">
          <p>
            This demo runs entirely in your browser using WebAssembly/WebGL via MediaPipe Tasks Vision. No video is
            uploaded.
          </p>
        </div>
      </div>
      <AnimatePresence>
        {isDebugOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsDebugOpen(false)}
          >
            <motion.div
              className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Blendshape Metrics</h2>
                  <p className="text-sm text-slate-600">Real-time expression coefficients (0.0–1.0).</p>
                </div>
                <button
                  onClick={() => setIsDebugOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-slate-200 hover:text-slate-700"
                >
                  <span className="sr-only">Close debug metrics</span>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
                {blendShapes.length === 0 ? (
                  <div className="text-sm text-slate-500">No face detected yet.</div>
                ) : (
                  blendShapes.map((b) => (
                    <div key={b.name} className="grid grid-cols-[160px_1fr_64px] items-center gap-3">
                      <div className="text-right pr-2 text-xs text-slate-600 truncate">{b.name}</div>
                      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${Math.max(0, Math.min(1, b.score)) * 100}%` }}
                        />
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">{b.score.toFixed(3)}</div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
