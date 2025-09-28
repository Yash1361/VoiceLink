import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CameraOff, Sparkles, Activity, Play, Pause, X, Cpu } from "lucide-react";
import { useBlendshapeGestures } from "./hooks/useGesture";


// MediaPipe Tasks (loaded at runtime from CDN)
// We dynamically import to avoid SSR issues and to keep this as a single-file app.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
const SUGGEST_ENDPOINT = `${API_BASE_URL}/suggest`;
const SENTENCE_GRID_BREAKPOINT = 640;
const SENTENCE_GRID_MAX_COLUMNS = 3;
const REPEAT_PROMPT_OPTION = "Ask to repeat again";
const REPEAT_PROMPT_SPOKEN_TEXT = "Can you please repeat that";
const REPEAT_PROMPT_ERROR_MESSAGE = "We didn't catch that. Please ask them to repeat.";
const REPEAT_PROMPT_NORMALIZED = REPEAT_PROMPT_OPTION.toLowerCase();

const getSentenceViewportColumns = () => {
  if (typeof window === "undefined") {
    return 1;
  }
  return window.innerWidth >= SENTENCE_GRID_BREAKPOINT ? SENTENCE_GRID_MAX_COLUMNS : 1;
};

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

type SentenceSuggestion = {
  style: string;
  text: string;
};

type KeyboardAction =
  | "input"
  | "space"
  | "backspace"
  | "clear"
  | "enter"
  | "suggestion"
  | "noop";

type KeyboardGridOption = {
  type: "keyboard";
  label: string;
  value?: string;
  action: KeyboardAction;
  row: number;
  column: number;
  rowStartIndex: number;
  rowLength: number;
  indexInKeyboard: number;
  span: number;
  gridStart: number;
  gridEnd: number;
  gridCenter: number;
};

type NavigatorGridOption =
  | { type: "sentence"; style: string; text: string }
  | { type: "word"; label: string }
  | { type: "submit"; label: "Submit Response" }
  | KeyboardGridOption;

const KEYBOARD_LAYOUT: Array<
  Array<{
    label: string;
    value?: string;
    action?: KeyboardAction;
    span?: number;
  }>
> = [
    [
      { label: "Q" },
      { label: "W" },
      { label: "E" },
      { label: "R" },
      { label: "T" },
      { label: "Y" },
      { label: "U" },
      { label: "I" },
      { label: "O" },
      { label: "P" },
    ],
    [
      { label: "A" },
      { label: "S" },
      { label: "D" },
      { label: "F" },
      { label: "G" },
      { label: "H" },
      { label: "J" },
      { label: "K" },
      { label: "L" },
    ],
    [
      { label: "Z" },
      { label: "X" },
      { label: "C" },
      { label: "V" },
      { label: "B" },
      { label: "N" },
      { label: "M" },
      { label: "Enter", action: "enter", span: 2 },
    ],
    [
      { label: "Space", value: " ", action: "space", span: 5 },
      { label: "Backspace", action: "backspace", span: 2 },
      { label: "Clear", action: "clear", span: 3 },
    ],
  ];
const KEYBOARD_MAX_COLUMNS = KEYBOARD_LAYOUT.reduce((max, row) => Math.max(max, row.length), 0);

const COMMON_WORDS = [
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "I",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
  "this",
  "but",
  "his",
  "by",
  "from",
  "they",
  "we",
  "say",
  "her",
  "she",
  "or",
  "an",
  "will",
  "my",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "so",
  "up",
  "out",
  "if",
  "about",
  "who",
  "get",
  "which",
  "go",
  "me",
  "when",
  "make",
  "can",
  "like",
  "time",
  "no",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "us",
];

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
  const [sentenceSuggestions, setSentenceSuggestions] = useState<SentenceSuggestion[]>([]);
  const [isSubmitPressed, setIsSubmitPressed] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [typedBuffer, setTypedBuffer] = useState("");
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [sentenceViewportColumns, setSentenceViewportColumns] = useState<number>(() =>
    getSentenceViewportColumns()
  );

  const columns = Math.min(3, Math.max(1, navigatorOptions.length));
  const handleKeyboardToggle = useCallback(() => {
    const now = Date.now();
    if (now - keyboardToggleCooldownRef.current < 400) {
      return;
    }
    keyboardToggleCooldownRef.current = now;
    setIsKeyboardOpen((prev) => !prev);
  }, []);
  const keyboardSuggestions = useMemo(() => {
    const prefix = typedBuffer.trim().toLowerCase();
    if (!prefix) {
      return [] as string[];
    }
    return COMMON_WORDS.filter((word) => word.toLowerCase().startsWith(prefix)).slice(0, 6);
  }, [typedBuffer]);
  const keyboardData = useMemo(() => {
    if (!isKeyboardOpen) {
      return {
        options: [] as KeyboardGridOption[],
        rowStarts: [] as number[],
        rowLengths: [] as number[],
        columnCount: Math.max(1, KEYBOARD_MAX_COLUMNS),
        rows: [] as KeyboardGridOption[][],
      };
    }

    const dynamicRows: Array<
      Array<{
        label: string;
        value?: string;
        action?: KeyboardAction;
        span?: number;
      }>
    > = [];

    const trimmedBuffer = typedBuffer.trim();
    const hasSuggestions = keyboardSuggestions.length > 0;
    const suggestionEntries = hasSuggestions
      ? keyboardSuggestions
      : trimmedBuffer
        ? [trimmedBuffer]
        : ["Start typing to see suggestions"];

    dynamicRows.push(
      suggestionEntries.map((word) => ({
        label: word,
        value: hasSuggestions || trimmedBuffer ? word : undefined,
        action: hasSuggestions || trimmedBuffer ? ("suggestion" as const) : ("noop" as const),
        span: hasSuggestions || trimmedBuffer ? 1 : KEYBOARD_MAX_COLUMNS,
      }))
    );

    KEYBOARD_LAYOUT.forEach((row) => {
      dynamicRows.push(row);
    });

    const options: KeyboardGridOption[] = [];
    const rowStarts: number[] = [];
    const rowLengths: number[] = [];
    const rows: KeyboardGridOption[][] = [];

    dynamicRows.forEach((row, rowIndex) => {
      const rowStartIndex = options.length;
      rowStarts[rowIndex] = rowStartIndex;
      rowLengths[rowIndex] = row.length;

      const isSuggestionRow = row.some((key) => key.action === "suggestion");
      const gridColumnTarget = isSuggestionRow ? row.length : KEYBOARD_MAX_COLUMNS;
      let gridCursor = 0;

      const rowOptions: KeyboardGridOption[] = row.map((key, columnIndex) => {
        const action: KeyboardAction = key.action ?? "input";
        const baseValue = key.value ?? (action === "input" ? key.label.toLowerCase() : undefined);
        const optionIndex = options.length + columnIndex;
        const effectiveSpan = isSuggestionRow ? 1 : key.span ?? 1;
        const gridStart = gridCursor;
        const gridEnd = gridCursor + effectiveSpan;
        const gridCenter = gridStart + effectiveSpan / 2;
        gridCursor = Math.min(gridEnd, gridColumnTarget);

        return {
          type: "keyboard",
          label: key.label,
          value: baseValue,
          action,
          row: rowIndex,
          column: columnIndex,
          rowStartIndex,
          rowLength: row.length,
          indexInKeyboard: optionIndex,
          span: key.span ?? 1,
          gridStart,
          gridEnd,
          gridCenter,
        };
      });

      rows[rowIndex] = rowOptions;
      options.push(...rowOptions);
    });

    const columnCount = Math.max(1, KEYBOARD_MAX_COLUMNS, ...rowLengths);

    return { options, rowStarts, rowLengths, columnCount, rows };
  }, [isKeyboardOpen, keyboardSuggestions, typedBuffer]);
  const keyboardOptions = keyboardData.options;
  const keyboardRowStarts = keyboardData.rowStarts;
  const keyboardRowLengths = keyboardData.rowLengths;
  const keyboardColumnCount = keyboardData.columnCount;
  const keyboardRows = keyboardData.rows;
  const getKeyboardRowOptionIndex = useCallback(
    (rowIndex: number, preferredCenter: number) => {
      const rowStart = keyboardRowStarts[rowIndex];
      const rowLength = keyboardRowLengths[rowIndex];
      if (rowStart === undefined || rowLength === undefined || rowLength <= 0) {
        return null;
      }

      let bestIndex: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let i = 0; i < rowLength; i += 1) {
        const option = keyboardOptions[rowStart + i];
        if (!option) continue;
        const center = option.gridCenter ?? option.column + 0.5;
        const distance = Math.abs(center - preferredCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = rowStart + i;
        }
      }

      return bestIndex;
    },
    [keyboardOptions, keyboardRowLengths, keyboardRowStarts]
  );
  const sentenceColumns = useMemo(() => {
    if (!sentenceSuggestions.length) {
      return 1;
    }
    return Math.max(1, Math.min(sentenceViewportColumns, sentenceSuggestions.length));
  }, [sentenceSuggestions.length, sentenceViewportColumns]);
  const prevActiveGesturesRef = useRef<string[]>([]);
  const submitFlashTimeoutRef = useRef<number | null>(null);
  const keyboardToggleCooldownRef = useRef<number>(0);
  const keyboardSelectionRef = useRef<{ row: number; column: number } | null>(null);
  const keyboardRowPreferredCenterRef = useRef<number[]>([]);
  const keyboardRowReturnColumnRef = useRef<number[]>([]);

  const responseText = useMemo(() => {
    const parts = [...responseWords];
    if (typedBuffer) {
      parts.push(typedBuffer);
    }
    return parts.join(" ");
  }, [responseWords, typedBuffer]);
  const trimmedResponse = useMemo(() => responseText.trim(), [responseText]);
  const gridOptions = useMemo<NavigatorGridOption[]>(
    () => {
      const options: NavigatorGridOption[] = [
        ...sentenceSuggestions.map((sentence) => ({
          type: "sentence" as const,
          style: sentence.style,
          text: sentence.text,
        })),
        ...navigatorOptions.map((word) => ({ type: "word" as const, label: word })),
      ];

      if (trimmedResponse) {
        options.push({ type: "submit" as const, label: "Submit Response" });
      }

      if (isKeyboardOpen) {
        options.push(...keyboardOptions);
      }

      return options;
    },
    [isKeyboardOpen, keyboardOptions, navigatorOptions, sentenceSuggestions, trimmedResponse]
  );

  const resetNavigator = useCallback(() => {
    setNavigatorOptions(["Start Typing"]);
    setResponseWords([]);
    setCurrentSuggestions([]);
    setIsLoadingSuggestions(false);
    setCurrentWordIndex(0);
    setSentenceSuggestions([]);
    setIsSubmitPressed(false);
    setIsKeyboardOpen(false);
    setTypedBuffer("");
    if (submitFlashTimeoutRef.current !== null) {
      window.clearTimeout(submitFlashTimeoutRef.current);
      submitFlashTimeoutRef.current = null;
    }
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
      { name: "mouthRight", threshold: 0.50, comparison: ">" },
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
      { name: "jawOpen", threshold: 0.15, comparison: "<" },
    ],
    framesRequired: 1,
    onActivate: handleKeyboardToggle,
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
], [handleKeyboardToggle]);
  const gestureNames = useMemo(() => gestures.map((gesture) => gesture.name), [gestures]);

  const activeGestures = useBlendshapeGestures(blendShapes, gestures);
  const totalOptions = gridOptions.length;

  useEffect(() => {
    setCurrentWordIndex(0);
  }, [navigatorOptions]);

  useEffect(() => {
    if (!trimmedResponse && isSubmitPressed) {
      setIsSubmitPressed(false);
    }
  }, [isSubmitPressed, trimmedResponse]);

  useEffect(() => {
    setCurrentWordIndex((current) => {
      if (gridOptions.length === 0) return 0;
      return Math.min(current, gridOptions.length - 1);
    });
  }, [gridOptions.length]);

  useEffect(() => {
    return () => {
      if (submitFlashTimeoutRef.current !== null) {
        window.clearTimeout(submitFlashTimeoutRef.current);
      }
    };
  }, []);

  const isSelectActive = activeGestures.includes("Select");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setSentenceViewportColumns(getSentenceViewportColumns());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const requestRepeatPrompt = useCallback((errorMessage?: string) => {
    if (typeof errorMessage === "string" && errorMessage.trim()) {
      setSpeechError(errorMessage);
    }
    shouldTranscribeRef.current = false;
    setIsTranscribing(false);
    setNavigatorOptions([REPEAT_PROMPT_OPTION]);
    setSentenceSuggestions([]);
    setCurrentSuggestions([]);
    setResponseWords([]);
    setIsLoadingSuggestions(false);
    setCurrentWordIndex(0);
    setIsSubmitPressed(false);
    setIsKeyboardOpen(false);
    setTypedBuffer("");
    setTranscript("");
    setInterimTranscript("");
  }, []);



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
      } else if (event.error === "aborted" || event.error === "no-speech") {
        requestRepeatPrompt(REPEAT_PROMPT_ERROR_MESSAGE);
        try {
          recognition.stop();
        } catch (stopErr) {
          console.warn("Speech recognition stop after abort failed", stopErr);
        }
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
  }, [requestRepeatPrompt]);

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

  const handleSubmitResponse = useCallback((overrideText?: string) => {
    const spoken = (overrideText ?? trimmedResponse).trim();
    if (!spoken) {
      return;
    }

    if (submitFlashTimeoutRef.current !== null) {
      window.clearTimeout(submitFlashTimeoutRef.current);
    }

    setIsSubmitPressed(true);
    speakText(spoken);
    stopTranscription();

    submitFlashTimeoutRef.current = window.setTimeout(() => {
      setTranscript("");
      setInterimTranscript("");
      resetNavigator();
      setIsSubmitPressed(false);

      if (isRunning && isSpeechSupported) {
        startTranscription();
      }

      submitFlashTimeoutRef.current = null;
    }, 220);
  }, [isRunning, isSpeechSupported, resetNavigator, startTranscription, stopTranscription, trimmedResponse]);

  const handleKeyboardSelection = useCallback(
    (option: KeyboardGridOption) => {
      switch (option.action) {
        case "input": {
          const value = option.value ?? option.label;
          if (!value) return;
          setTypedBuffer((prev) => `${prev}${value}`);
          break;
        }
        case "space": {
          setTypedBuffer((prev) => {
            const trimmed = prev.trim();
            if (!trimmed) {
              return "";
            }
            setResponseWords((words) => [...words, trimmed]);
            return "";
          });
          break;
        }
        case "backspace": {
          setTypedBuffer((prev) => {
            if (prev.length > 0) {
              return prev.slice(0, -1);
            }
            let restoredWord = "";
            setResponseWords((words) => {
              if (words.length === 0) {
                return words;
              }
              const next = words.slice(0, -1);
              restoredWord = words[words.length - 1];
              return next;
            });
            return restoredWord;
          });
          break;
        }
        case "clear": {
          setResponseWords([]);
          setTypedBuffer("");
          break;
        }
        case "enter": {
          const pendingWord = typedBuffer.trim();
          const finalParts = pendingWord ? [...responseWords, pendingWord] : [...responseWords];
          const finalText = finalParts.join(" ").trim();
          if (finalText) {
            handleSubmitResponse(finalText);
          }
          break;
        }
        case "suggestion": {
          const value = option.value ?? option.label;
          if (!value) return;
          setTypedBuffer(value);
          break;
        }
        case "noop": {
          break;
        }
        default:
          break;
      }
    },
    [handleSubmitResponse, responseWords, typedBuffer]
  );

  const handleSelectGesture = useCallback(async () => {
    if (gridOptions.length === 0) return;

    const safeIndex = Math.min(currentWordIndex, Math.max(0, gridOptions.length - 1));
    const selected = gridOptions[safeIndex];
    if (!selected) return;

    if (selected.type === "keyboard") {
      handleKeyboardSelection(selected);
      return;
    }

    if (selected.type === "submit") {
      if (trimmedResponse) {
        handleSubmitResponse();
      }
      return;
    }

    if (selected.type === "sentence") {
      const sentenceText = selected.text.trim();
      if (!sentenceText) {
        return;
      }
      setTypedBuffer("");
      setResponseWords([sentenceText]);
      setSentenceSuggestions([]);
      setCurrentSuggestions([]);
      setNavigatorOptions([]);
      setCurrentWordIndex(0);
      handleSubmitResponse(sentenceText);
      return;
    }

    const currentOption = selected.label.trim();
    const normalizedOption = currentOption.toLowerCase();

    if (!currentOption || normalizedOption === "loading responses...") {
      return;
    }

    if (normalizedOption === REPEAT_PROMPT_NORMALIZED) {
      speakText(REPEAT_PROMPT_SPOKEN_TEXT);
      setSpeechError(null);
      stopTranscription();
      resetNavigator();
      startTranscription();
      return;
    }

    if (isLoadingSuggestions) {
      return;
    }

    if (normalizedOption === "start typing") {
      const questionText = [transcript, interimTranscript].filter(Boolean).join(" ").trim();

      if (!questionText) {
        stopTranscription();
        requestRepeatPrompt(REPEAT_PROMPT_ERROR_MESSAGE);
        return;
      }

      setIsLoadingSuggestions(true);
      setNavigatorOptions(["Loading Responses..."]);
      setCurrentSuggestions([]);
      setCurrentWordIndex(0);
      setSentenceSuggestions([]);

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

        const rawSentences = Array.isArray(payload?.sentences) ? payload.sentences : [];

        const normalizedSentences = rawSentences
          .map((entry: any) => {
            const style = typeof entry?.style === "string" ? entry.style.trim().toLowerCase() : "";
            const text = typeof entry?.text === "string" ? entry.text.trim() : "";
            if (!text) return null;
            return {
              style: style || "smart",
              text,
            } as SentenceSuggestion;
          })
          .filter(Boolean) as SentenceSuggestion[];

        const preferredOrder = ["smart", "funny", "casual"];
        normalizedSentences.sort((a, b) => {
          const rankA = preferredOrder.indexOf(a.style);
          const rankB = preferredOrder.indexOf(b.style);
          const safeRankA = rankA === -1 ? preferredOrder.length : rankA;
          const safeRankB = rankB === -1 ? preferredOrder.length : rankB;
          return safeRankA - safeRankB;
        });

        setSentenceSuggestions(normalizedSentences.slice(0, 3));

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
        setSentenceSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }

      return;
    }

    if (currentSuggestions.length === 0) {
      return;
    }

    const sentenceCount = sentenceSuggestions.length;
    const wordIndex = safeIndex - sentenceCount;
    if (wordIndex < 0 || wordIndex >= currentSuggestions.length) {
      return;
    }

    const selectedNode = currentSuggestions[wordIndex];
    if (!selectedNode || !selectedNode.word) {
      return;
    }

    const manualWord = typedBuffer.trim();
    setResponseWords((prev) => {
      const base = manualWord ? [...prev, manualWord] : [...prev];
      return [...base, selectedNode.word];
    });
    setTypedBuffer("");
    setSentenceSuggestions([]);

    const nextSuggestions = selectedNode.next ?? [];

    if (nextSuggestions.length > 0) {
      setCurrentSuggestions(nextSuggestions);
      setNavigatorOptions(nextSuggestions.map((node) => node.word));
    } else {
      setCurrentSuggestions([]);
      setNavigatorOptions(["Start Typing"]);
    }
  }, [
    currentSuggestions,
    currentWordIndex,
    gridOptions,
    handleKeyboardSelection,
    handleSubmitResponse,
    interimTranscript,
    isLoadingSuggestions,
    navigatorOptions,
    requestRepeatPrompt,
    resetNavigator,
    sentenceSuggestions,
    startTranscription,
    stopTranscription,
    transcript,
    trimmedResponse,
    typedBuffer,
  ]);

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
          const sentenceCount = sentenceSuggestions.length;
          const wordCount = navigatorOptions.length;
          const keyboardCount = keyboardOptions.length;
          const hasSubmit = Boolean(trimmedResponse);
          const submitIndex = hasSubmit ? sentenceCount + wordCount : -1;

          const sentenceGridColumns = Math.max(1, sentenceColumns);
          const wordGridColumns = wordCount > 0 ? Math.min(columns, wordCount) : 0;

          const keyboardStartIndex = submitIndex === -1 ? sentenceCount + wordCount : submitIndex + 1;
          const keyboardLastIndex = keyboardCount > 0 ? keyboardStartIndex + keyboardCount - 1 : -1;

          const firstKeyboardRowLength = keyboardRowLengths[0] ?? 0;

          const isInKeyboardRange = (index: number) =>
            keyboardCount > 0 && index >= keyboardStartIndex && index <= keyboardLastIndex;
          switch (gesture) {
            case "Right": {
              if (current === submitIndex) return current;
              if (current < sentenceCount) {
                if (sentenceGridColumns <= 1) return current;
                const nextIndex = current + 1;
                const sameRow =
                  Math.floor(current / sentenceGridColumns) === Math.floor(nextIndex / sentenceGridColumns);
                if (nextIndex < sentenceCount && sameRow) {
                  return nextIndex;
                }
                return current;
              }
              const position = current - sentenceCount;
              if (position >= 0 && position < wordCount) {
                const isEndOfRow =
                  wordGridColumns <= 1 ||
                  position % wordGridColumns === wordGridColumns - 1 ||
                  position + 1 >= wordCount;
                return isEndOfRow ? current : current + 1;
              }
              if (isInKeyboardRange(current)) {
                const keyboardPosition = current - keyboardStartIndex;
                const option = keyboardOptions[keyboardPosition];
                if (!option) return current;
                const nextColumn = option.column + 1;
                if (nextColumn < option.rowLength) {
                  return keyboardStartIndex + option.rowStartIndex + nextColumn;
                }
            return current;
          }
              return current;
            }
            case "Left": {
              if (current === submitIndex) {
                if (isInKeyboardRange(keyboardLastIndex)) {
                  return keyboardLastIndex;
                }
                if (wordCount > 0) {
                  return sentenceCount + wordCount - 1;
                }
                return sentenceCount > 0 ? sentenceCount - 1 : current;
              }
              if (current < sentenceCount) {
                if (sentenceGridColumns <= 1) return current;
                const column = current % sentenceGridColumns;
                if (column === 0) {
                  return current;
                }
                const previousIndex = current - 1;
                return previousIndex >= 0 ? previousIndex : current;
              }
              const position = current - sentenceCount;
              if (position > 0 && position < wordCount) {
                if (wordGridColumns <= 1) return current;
                const isStartOfRow = position % wordGridColumns === 0;
                return isStartOfRow ? current : current - 1;
              }
              if (isInKeyboardRange(current)) {
                const keyboardPosition = current - keyboardStartIndex;
                const option = keyboardOptions[keyboardPosition];
                if (!option) return current;
                if (option.column > 0) {
                  return keyboardStartIndex + option.rowStartIndex + option.column - 1;
                }
                return current;
              }
              return current;
            }
            case "Down": {
              if (current === submitIndex) {
                if (keyboardCount > 0) {
                  return keyboardLastIndex;
                }
                if (wordCount > 0) {
                  return sentenceCount + wordCount - 1;
                }
                if (sentenceCount > 0) {
                  return sentenceCount - 1;
                }
                return current;
              }
              if (current < sentenceCount) {
                const column = sentenceGridColumns > 0 ? current % sentenceGridColumns : 0;
                const nextIndex = current + sentenceGridColumns;
                if (nextIndex < sentenceCount) {
                  return nextIndex;
                }
                if (wordCount > 0) {
                  const targetColumn = Math.min(column, Math.max(0, wordGridColumns - 1));
                  const targetIndex = sentenceCount + targetColumn;
                  if (targetIndex < sentenceCount + wordCount) {
                    return targetIndex;
                  }
                  return sentenceCount + wordCount - 1;
                }
                if (keyboardCount > 0 && firstKeyboardRowLength > 0) {
                  const preferredCenter = column + 0.5;
                  const targetInRow = getKeyboardRowOptionIndex(0, preferredCenter);
                  if (targetInRow !== null) {
                    return keyboardStartIndex + targetInRow;
                  }
                }
                return hasSubmit ? submitIndex : current;
              }
              const position = current - sentenceCount;
              if (position >= 0 && position < wordCount) {
                if (wordGridColumns > 0) {
                  const next = current + wordGridColumns;
                  if (next - sentenceCount < wordCount) {
                    return next;
                  }
                }
                if (keyboardCount > 0 && firstKeyboardRowLength > 0) {
                  const column = wordGridColumns > 0 ? position % wordGridColumns : 0;
                  const preferredCenter = column + 0.5;
                  const targetInRow = getKeyboardRowOptionIndex(0, preferredCenter);
                  if (targetInRow !== null) {
                    return keyboardStartIndex + targetInRow;
                  }
                }
                return hasSubmit ? submitIndex : current;
              }
              if (isInKeyboardRange(current)) {
                const keyboardPosition = current - keyboardStartIndex;
                const option = keyboardOptions[keyboardPosition];
                if (!option) return hasSubmit ? submitIndex : current;
                const nextRow = option.row + 1;
                const preferredCenter =
                  keyboardRowPreferredCenterRef.current[option.row] ??
                  option.gridCenter ??
                  option.column + 0.5;
                const rowStart = keyboardRowStarts[nextRow];
                const rowLength = keyboardRowLengths[nextRow] ?? 0;
                if (rowStart === undefined || rowLength <= 0) {
                  return hasSubmit ? submitIndex : current;
                }

                const nextRowOptions = keyboardRows[nextRow] ?? [];
                const spaceColumn = nextRowOptions.findIndex((opt) => opt.label === "Space");
                const backspaceColumn = nextRowOptions.findIndex((opt) => opt.label === "Backspace");
                const clearColumn = nextRowOptions.findIndex((opt) => opt.label === "Clear");

                let targetColumn = Math.min(option.column, rowLength - 1);
                if (spaceColumn !== -1 && ["Z", "X", "C", "V", "B"].includes(option.label)) {
                  targetColumn = spaceColumn;
                } else if (backspaceColumn !== -1 && ["N", "M"].includes(option.label)) {
                  targetColumn = backspaceColumn;
                } else if (option.label === "Enter" && clearColumn !== -1) {
                  targetColumn = clearColumn;
                }

                keyboardRowPreferredCenterRef.current[nextRow] = preferredCenter;
                keyboardRowReturnColumnRef.current[nextRow] = option.column;

                return keyboardStartIndex + rowStart + Math.max(0, Math.min(targetColumn, rowLength - 1));
              }
              return hasSubmit ? submitIndex : current;
            }
            case "Up": {
              if (current === submitIndex) {
                if (wordCount > 0) {
                  return sentenceCount + wordCount - 1;
                }
                if (sentenceCount > 0) {
                  return sentenceCount - 1;
                }
                return current;
              }
              if (isInKeyboardRange(current)) {
                const keyboardPosition = current - keyboardStartIndex;
                const option = keyboardOptions[keyboardPosition];
                if (!option) return current;
                if (option.row === 0) {
                  if (wordCount > 0 && wordGridColumns > 0) {
                    const lastRow = Math.ceil(wordCount / wordGridColumns) - 1;
                    const lastRowStart = lastRow * wordGridColumns;
                    const lastRowLength = wordCount - lastRowStart;
                    const preferredCenter =
                      keyboardRowPreferredCenterRef.current[option.row] ??
                      option.gridCenter ??
                      option.column + 0.5;
                    const approximateColumn = Math.min(
                      Math.max(0, wordGridColumns - 1),
                      Math.max(0, Math.round(preferredCenter - 0.5))
                    );
                    const targetColumn = Math.min(approximateColumn, Math.max(0, lastRowLength - 1));
                    const wordIndex = sentenceCount + lastRowStart + targetColumn;
                    if (wordIndex < sentenceCount + wordCount) {
                      return wordIndex;
                    }
                    return sentenceCount + wordCount - 1;
                  }
                  if (sentenceCount > 0) {
                    const preferredCenter =
                      keyboardRowPreferredCenterRef.current[option.row] ??
                      option.gridCenter ??
                      option.column + 0.5;
                    const approximateColumn = Math.min(
                      Math.max(0, sentenceGridColumns - 1),
                      Math.max(0, Math.round(preferredCenter - 0.5))
                    );
                    const targetColumn = Math.min(approximateColumn, sentenceGridColumns - 1);
                    const sentenceRows = Math.ceil(sentenceCount / sentenceGridColumns);
                    const baseIndex = (sentenceRows - 1) * sentenceGridColumns + targetColumn;
                    if (baseIndex < sentenceCount) {
                      return baseIndex;
                    }
                    return sentenceCount - 1;
                  }
                  return current;
                }
                const previousRow = option.row - 1;
                const prevRowStart = keyboardRowStarts[previousRow];
                const prevRowLength = keyboardRowLengths[previousRow] ?? 0;
                if (prevRowStart === undefined || prevRowLength <= 0) {
                  return current;
                }

                const returnColumn = keyboardRowReturnColumnRef.current[option.row];
                if (returnColumn !== undefined) {
                  const clampedColumn = Math.max(0, Math.min(returnColumn, prevRowLength - 1));
                  keyboardRowPreferredCenterRef.current[previousRow] =
                    keyboardRows[previousRow]?.[clampedColumn]?.gridCenter ?? clampedColumn + 0.5;
                  return keyboardStartIndex + prevRowStart + clampedColumn;
                }

                const preferredCenter =
                  keyboardRowPreferredCenterRef.current[previousRow] ??
                  keyboardRowPreferredCenterRef.current[option.row] ??
                  option.gridCenter ??
                  option.column + 0.5;
                const targetInRow = getKeyboardRowOptionIndex(previousRow, preferredCenter);
                if (targetInRow !== null) {
                  keyboardRowPreferredCenterRef.current[previousRow] = preferredCenter;
                  return keyboardStartIndex + targetInRow;
                }
                return current;
              }
              if (current < sentenceCount) {
                const previousIndex = current - sentenceGridColumns;
                if (previousIndex >= 0) {
                  return previousIndex;
                }
                return current;
              }
              const position = current - sentenceCount;
              if (position >= 0 && position < wordCount) {
                if (wordGridColumns > 0) {
                  const next = current - wordGridColumns;
                  if (next >= sentenceCount) {
                    return next;
                  }
                }
                if (sentenceCount > 0) {
                  const wordColumn = wordGridColumns > 0 ? position % wordGridColumns : 0;
                  const targetColumn = Math.min(wordColumn, sentenceGridColumns - 1);
                  const sentenceRows = Math.ceil(sentenceCount / sentenceGridColumns);
                  const baseIndex = (sentenceRows - 1) * sentenceGridColumns + targetColumn;
                  if (baseIndex < sentenceCount) {
                    return baseIndex;
                  }
                  return sentenceCount - 1;

                }
                return current;
              }
              return current;
            }
            default:
              return current;
          }
        });
      });
    }

    prevActiveGesturesRef.current = activeGestures;
  }, [
    activeGestures,
    columns,
    handleSelectGesture,
    getKeyboardRowOptionIndex,
    keyboardOptions,
    keyboardRowLengths,
    keyboardRowStarts,
    keyboardRows,
    navigatorOptions,
    sentenceColumns,
    sentenceSuggestions,
    totalOptions,
    trimmedResponse,
  ]);

  // Developer mode: simulate gesture activation
  const simulateGesture = useCallback((gestureName: string) => {
    if (!isDeveloperMode) return;

    if (gestureName === "Select") {
      handleSelectGesture();
      return;
    }

    if (gestureName === "Open keyboard") {
      handleKeyboardToggle();
      return;
    }

    // Navigate using the same logic as the useEffect
    setCurrentWordIndex((current) => {
      const sentenceCount = sentenceSuggestions.length;
      const wordCount = navigatorOptions.length;
      const keyboardCount = keyboardOptions.length;
      const hasSubmit = Boolean(trimmedResponse);
      const submitIndex = hasSubmit ? sentenceCount + wordCount : -1;

      const sentenceGridColumns = Math.max(1, sentenceColumns);
      const wordGridColumns = wordCount > 0 ? Math.min(columns, wordCount) : 0;

      const keyboardStartIndex = submitIndex === -1 ? sentenceCount + wordCount : submitIndex + 1;
      const keyboardLastIndex = keyboardCount > 0 ? keyboardStartIndex + keyboardCount - 1 : -1;

      const firstKeyboardRowLength = keyboardRowLengths[0] ?? 0;

      const isInKeyboardRange = (index: number) =>
        keyboardCount > 0 && index >= keyboardStartIndex && index <= keyboardLastIndex;

      switch (gestureName) {
        case "Right": {
          if (current === submitIndex) {
            if (keyboardCount > 0) {
              return keyboardStartIndex;
            }
            return current;
          }
          if (current < sentenceCount) {
            if (sentenceGridColumns <= 1) return current;
            const nextIndex = current + 1;
            const sameRow =
              Math.floor(current / sentenceGridColumns) === Math.floor(nextIndex / sentenceGridColumns);
            if (nextIndex < sentenceCount && sameRow) {
              return nextIndex;
            }
            return current;
          }
          const position = current - sentenceCount;
          if (position >= 0 && position < wordCount) {
            const isEndOfRow =
              wordGridColumns <= 1 ||
              position % wordGridColumns === wordGridColumns - 1 ||
              position + 1 >= wordCount;
            return isEndOfRow ? current : current + 1;
          }
          if (isInKeyboardRange(current)) {
            const keyboardPosition = current - keyboardStartIndex;
            const option = keyboardOptions[keyboardPosition];
            if (!option) return current;
            const nextColumn = option.column + 1;
            if (nextColumn < option.rowLength) {
              return keyboardStartIndex + option.rowStartIndex + nextColumn;
            }
            return current;
          }
          return current;
        }
        case "Left": {
          if (current === submitIndex) {
            if (wordCount > 0) {
              return sentenceCount + wordCount - 1;
            }
            if (sentenceCount > 0) {
              return sentenceCount - 1;
            }
            return current;
          }
          if (current < sentenceCount) {
            if (sentenceGridColumns <= 1) return current;
            const column = current % sentenceGridColumns;
            if (column === 0) {
              return current;
            }
            const previousIndex = current - 1;
            return previousIndex >= 0 ? previousIndex : current;
          }
          const position = current - sentenceCount;
          if (position > 0 && position < wordCount) {
            if (wordGridColumns <= 1) return current;
            const isStartOfRow = position % wordGridColumns === 0;
            return isStartOfRow ? current : current - 1;
          }
          if (isInKeyboardRange(current)) {
            const keyboardPosition = current - keyboardStartIndex;
            const option = keyboardOptions[keyboardPosition];
            if (!option) return current;
            if (option.column > 0) {
              return keyboardStartIndex + option.rowStartIndex + option.column - 1;
            }
            return current;
          }
          return current;
        }
        case "Down": {
          if (current === submitIndex) {
            if (keyboardCount > 0) {
              return keyboardStartIndex;
            }
            if (wordCount > 0) {
              return sentenceCount + wordCount - 1;
            }
            if (sentenceCount > 0) {
              return sentenceCount - 1;
            }
            return current;
          }
          if (current < sentenceCount) {
            const column = sentenceGridColumns > 0 ? current % sentenceGridColumns : 0;
            const nextIndex = current + sentenceGridColumns;
            if (nextIndex < sentenceCount) {
              return nextIndex;
            }
            if (wordCount > 0) {
              const targetColumn = Math.min(column, Math.max(0, wordGridColumns - 1));
              const targetIndex = sentenceCount + targetColumn;
              if (targetIndex < sentenceCount + wordCount) {
                return targetIndex;
              }
              return sentenceCount + wordCount - 1;
            }
            if (keyboardCount > 0 && firstKeyboardRowLength > 0) {
              const preferredCenter = column + 0.5;
              const targetInRow = getKeyboardRowOptionIndex(0, preferredCenter);
              if (targetInRow !== null) {
                return keyboardStartIndex + targetInRow;
              }
            }
            return hasSubmit ? submitIndex : current;
          }
          const position = current - sentenceCount;
          if (position >= 0 && position < wordCount) {
            if (wordGridColumns > 0) {
              const next = current + wordGridColumns;
              if (next - sentenceCount < wordCount) {
                return next;
              }
            }
            if (keyboardCount > 0 && firstKeyboardRowLength > 0) {
              const column = wordGridColumns > 0 ? position % wordGridColumns : 0;
              const preferredCenter = column + 0.5;
              const targetInRow = getKeyboardRowOptionIndex(0, preferredCenter);
              if (targetInRow !== null) {
                return keyboardStartIndex + targetInRow;
              }
            }
            return hasSubmit ? submitIndex : current;
          }
          if (isInKeyboardRange(current)) {
            const keyboardPosition = current - keyboardStartIndex;
            const option = keyboardOptions[keyboardPosition];
            if (!option) return hasSubmit ? submitIndex : current;
            const nextRow = option.row + 1;
            const preferredCenter =
              keyboardRowPreferredCenterRef.current[option.row] ??
              option.gridCenter ??
              option.column + 0.5;
            const rowStart = keyboardRowStarts[nextRow];
            const rowLength = keyboardRowLengths[nextRow] ?? 0;
            if (rowStart === undefined || rowLength <= 0) {
              return hasSubmit ? submitIndex : current;
            }

            const nextRowOptions = keyboardRows[nextRow] ?? [];
            const spaceColumn = nextRowOptions.findIndex((opt) => opt.label === "Space");
            const backspaceColumn = nextRowOptions.findIndex((opt) => opt.label === "Backspace");
            const clearColumn = nextRowOptions.findIndex((opt) => opt.label === "Clear");

            let targetColumn = Math.min(option.column, rowLength - 1);
            if (spaceColumn !== -1 && ["Z", "X", "C", "V", "B"].includes(option.label)) {
              targetColumn = spaceColumn;
            } else if (backspaceColumn !== -1 && ["N", "M"].includes(option.label)) {
              targetColumn = backspaceColumn;
            } else if (option.label === "Enter" && clearColumn !== -1) {
              targetColumn = clearColumn;
            }

            keyboardRowPreferredCenterRef.current[nextRow] = preferredCenter;
            keyboardRowReturnColumnRef.current[nextRow] = option.column;

            return keyboardStartIndex + rowStart + Math.max(0, Math.min(targetColumn, rowLength - 1));
          }
          return hasSubmit ? submitIndex : current;
        }
        case "Up": {
          if (current === submitIndex) {
            if (wordCount > 0) {
              return sentenceCount + wordCount - 1;
            }
            if (sentenceCount > 0) {
              return sentenceCount - 1;
            }
            return current;
          }
          if (isInKeyboardRange(current)) {
            const keyboardPosition = current - keyboardStartIndex;
            const option = keyboardOptions[keyboardPosition];
            if (!option) return current;
            if (option.row === 0) {
              if (wordCount > 0 && wordGridColumns > 0) {
                const lastRow = Math.ceil(wordCount / wordGridColumns) - 1;
                const lastRowStart = lastRow * wordGridColumns;
                const lastRowLength = wordCount - lastRowStart;
                const preferredCenter =
                  keyboardRowPreferredCenterRef.current[option.row] ??
                  option.gridCenter ??
                  option.column + 0.5;
                const approximateColumn = Math.min(
                  Math.max(0, wordGridColumns - 1),
                  Math.max(0, Math.round(preferredCenter - 0.5))
                );
                const targetColumn = Math.min(approximateColumn, Math.max(0, lastRowLength - 1));
                const wordIndex = sentenceCount + lastRowStart + targetColumn;
                if (wordIndex < sentenceCount + wordCount) {
                  return wordIndex;
                }
                return sentenceCount + wordCount - 1;
              }
              if (sentenceCount > 0) {
                const preferredCenter =
                  keyboardRowPreferredCenterRef.current[option.row] ??
                  option.gridCenter ??
                  option.column + 0.5;
                const approximateColumn = Math.min(
                  Math.max(0, sentenceGridColumns - 1),
                  Math.max(0, Math.round(preferredCenter - 0.5))
                );
                const targetColumn = Math.min(approximateColumn, sentenceGridColumns - 1);
                const sentenceRows = Math.ceil(sentenceCount / sentenceGridColumns);
                const baseIndex = (sentenceRows - 1) * sentenceGridColumns + targetColumn;
                if (baseIndex < sentenceCount) {
                  return baseIndex;
                }
                return sentenceCount - 1;
              }
              return current;
            }
            const previousRow = option.row - 1;
            const prevRowStart = keyboardRowStarts[previousRow];
            const prevRowLength = keyboardRowLengths[previousRow] ?? 0;
            if (prevRowStart === undefined || prevRowLength <= 0) {
              return current;
            }

            const returnColumn = keyboardRowReturnColumnRef.current[option.row];
            if (returnColumn !== undefined) {
              const clampedColumn = Math.max(0, Math.min(returnColumn, prevRowLength - 1));
              keyboardRowPreferredCenterRef.current[previousRow] =
                keyboardRows[previousRow]?.[clampedColumn]?.gridCenter ?? clampedColumn + 0.5;
              return keyboardStartIndex + prevRowStart + clampedColumn;
            }

            const preferredCenter =
              keyboardRowPreferredCenterRef.current[previousRow] ??
              keyboardRowPreferredCenterRef.current[option.row] ??
              option.gridCenter ??
              option.column + 0.5;
            const targetInRow = getKeyboardRowOptionIndex(previousRow, preferredCenter);
            if (targetInRow !== null) {
              keyboardRowPreferredCenterRef.current[previousRow] = preferredCenter;
              return keyboardStartIndex + targetInRow;
            }
            return current;
          }
          if (current < sentenceCount) {
            const previousIndex = current - sentenceGridColumns;
            if (previousIndex >= 0) {
              return previousIndex;
            }
            return current;
          }
          const position = current - sentenceCount;
          if (position >= 0 && position < wordCount) {
            if (wordGridColumns > 0) {
              const next = current - wordGridColumns;
              if (next >= sentenceCount) {
                return next;
              }
            }
            if (sentenceCount > 0) {
              const wordColumn = wordGridColumns > 0 ? position % wordGridColumns : 0;
              const targetColumn = Math.min(wordColumn, sentenceGridColumns - 1);
              const sentenceRows = Math.ceil(sentenceCount / sentenceGridColumns);
              const baseIndex = (sentenceRows - 1) * sentenceGridColumns + targetColumn;
              if (baseIndex < sentenceCount) {
                return baseIndex;
              }
              return sentenceCount - 1;
            }
            return current;
          }
          return current;
        }
        default:
          return current;
      }
    });
  }, [
    isDeveloperMode,
    handleSelectGesture,
    handleKeyboardToggle,
    getKeyboardRowOptionIndex,
    sentenceSuggestions,
    navigatorOptions,
    keyboardOptions,
    keyboardRows,
    trimmedResponse,
    totalOptions,
    sentenceColumns,
    columns,
    keyboardRowStarts,
    keyboardRowLengths,
  ]);

  useEffect(() => {
    if (!isDeveloperMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
          return;
        }
      }

      let handled = false;
      switch (event.key) {
        case "ArrowLeft":
          simulateGesture("Left");
          handled = true;
          break;
        case "ArrowRight":
          simulateGesture("Right");
          handled = true;
          break;
        case "ArrowUp":
          simulateGesture("Up");
          handled = true;
          break;
        case "ArrowDown":
          simulateGesture("Down");
          handled = true;
          break;
        case " ":
        case "Space":
        case "Spacebar":
          simulateGesture("Select");
          handled = true;
          break;
        default: {
          if (event.key === "k" || event.key === "K") {
            simulateGesture("Open keyboard");
            handled = true;
          }
          break;
        }
      }

      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDeveloperMode, simulateGesture]);

  useEffect(() => {
    if (!isKeyboardOpen) {
      keyboardSelectionRef.current = null;
      keyboardRowPreferredCenterRef.current = [];
      keyboardRowReturnColumnRef.current = [];
      return;
    }

    if (keyboardOptions.length > 0) {
      setCurrentWordIndex((current) => {
        const keyboardStart = sentenceSuggestions.length + navigatorOptions.length + (trimmedResponse ? 1 : 0);
        const keyboardEnd = keyboardStart + keyboardOptions.length;
        if (current >= keyboardStart && current < keyboardEnd) {
          return current;
        }
        return keyboardStart;
      });
    } else {
      setCurrentWordIndex((current) => {
        const keyboardStart = sentenceSuggestions.length + navigatorOptions.length + (trimmedResponse ? 1 : 0);
        if (current >= keyboardStart) {
          if (trimmedResponse) {
            return Math.max(0, totalOptions - 1);
          }
          const fallback = keyboardStart - 1;
          if (fallback >= 0) {
            return fallback;
          }
          return 0;
        }
        return current;
      });
    }
  }, [
    keyboardOptions.length,
    navigatorOptions.length,
    sentenceSuggestions.length,
    totalOptions,
    trimmedResponse,
    isKeyboardOpen,
  ]);

  useEffect(() => {
    if (!isKeyboardOpen) {
      return;
    }
    const keyboardStart = sentenceSuggestions.length + navigatorOptions.length + (trimmedResponse ? 1 : 0);
    const relativeIndex = currentWordIndex - keyboardStart;
    if (relativeIndex < 0 || relativeIndex >= keyboardOptions.length) {
      return;
    }

    const option = keyboardOptions[relativeIndex];
    if (!option) {
      return;
    }

    keyboardSelectionRef.current = { row: option.row, column: option.column };
    keyboardRowPreferredCenterRef.current[option.row] = option.gridCenter ?? option.column + 0.5;
  }, [
    currentWordIndex,
    isKeyboardOpen,
    keyboardOptions,
    navigatorOptions.length,
    sentenceSuggestions.length,
  ]);

  useEffect(() => {
    if (!isKeyboardOpen) {
      return;
    }
    if (keyboardOptions.length === 0) {
      return;
    }

    const keyboardStart = sentenceSuggestions.length + navigatorOptions.length + (trimmedResponse ? 1 : 0);

    setCurrentWordIndex((current) => {
      if (current < keyboardStart) {
        return current;
      }

      const keyboardEnd = keyboardStart + keyboardOptions.length;
      const anchor = keyboardSelectionRef.current;
      let nextIndex: number | null = null;

      if (anchor) {
        const rowStart = keyboardRowStarts[anchor.row];
        const rowLength = keyboardRowLengths[anchor.row] ?? 0;
        const preferredCenter = keyboardRowPreferredCenterRef.current[anchor.row];

        if (rowStart !== undefined && rowLength > 0) {
          const clampedColumn = Math.min(anchor.column, rowLength - 1);
          nextIndex = keyboardStart + rowStart + clampedColumn;
        } else if (preferredCenter !== undefined) {
          const relative = getKeyboardRowOptionIndex(anchor.row, preferredCenter);
          if (relative !== null) {
            nextIndex = keyboardStart + relative;
          }
        }
      }

      if (nextIndex === null) {
        if (current >= keyboardEnd) {
          nextIndex = keyboardEnd - 1;
        } else {
          nextIndex = current;
        }
      }

      if (nextIndex < keyboardStart) {
        nextIndex = keyboardStart;
      }

      if (nextIndex >= keyboardEnd) {
        nextIndex = Math.max(keyboardStart, keyboardEnd - 1);
      }

      return nextIndex;
    });
  }, [
    getKeyboardRowOptionIndex,
    isKeyboardOpen,
    keyboardOptions,
    keyboardRowLengths,
    keyboardRowStarts,
    navigatorOptions.length,
    sentenceSuggestions.length,
  ]);

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


  const renderWordNavigator = () => {
    const sentenceCount = sentenceSuggestions.length;
    const wordCount = navigatorOptions.length;
    const hasSubmit = Boolean(trimmedResponse);
    const submitIndex = hasSubmit ? sentenceCount + wordCount : -1;
    const keyboardStartIndex = submitIndex === -1 ? sentenceCount + wordCount : submitIndex + 1;
    const hasKeyboard = isKeyboardOpen && keyboardOptions.length > 0;
    const sentenceCards = (
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, sentenceColumns)}, minmax(0, 1fr))` }}
      >

        {sentenceSuggestions.map((sentence, idx) => {
          const optionIndex = idx;
          const isActive = optionIndex === currentWordIndex;
          const isPressed = isSubmitPressed && isActive;
          const title = sentence.style
            ? sentence.style.charAt(0).toUpperCase() + sentence.style.slice(1)
            : "Sentence";

          let cardClasses = "rounded-xl border px-4 py-4 text-sm shadow-sm transition-colors";
          if (isActive) {
            cardClasses += isPressed || isSelectActive
              ? " border-emerald-500 bg-emerald-600 text-white"
              : " border-emerald-300 bg-emerald-50 text-emerald-700";
          } else {
            cardClasses += " border-slate-200 bg-white text-slate-600";
          }

          return (
            <div key={`sentence-${idx}`} className={cardClasses}>
              <div className="text-xs font-semibold uppercase tracking-wide">{title}</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{sentence.text}</div>
            </div>
          );
        })}
      </div>
    );

    const wordGrid = navigatorOptions.length > 0 ? (
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.max(
            1,
            Math.min(columns, navigatorOptions.length)
          )}, minmax(0, 1fr))`,
        }}
      >
        {navigatorOptions.map((word, idx) => {
          const optionIndex = sentenceCount + idx;
          const isActive = optionIndex === currentWordIndex;
          const normalized = word.trim().toLowerCase();
          const isInformational = [
            "loading responses...",
            "no suggestions available",
            "unable to load responses",
          ].includes(normalized);

          let cardClasses =
            "rounded-xl border px-4 py-5 text-center text-sm font-medium shadow-sm transition-colors";
          if (isInformational) {
            cardClasses += " border-slate-200 bg-slate-50 text-slate-400";
          } else if (isActive) {
            cardClasses += isSelectActive
              ? " border-emerald-400 bg-emerald-50 text-emerald-700"
              : " border-slate-300 bg-slate-100 text-slate-900";
          } else {
            cardClasses += " border-slate-100 bg-white text-slate-500";
          }

          return (
            <div key={`word-${word}-${idx}`} className={cardClasses}>
              {word}
            </div>
          );
        })}
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        No suggestions available yet.
      </div>
    );
    const submitButton = hasSubmit ? (
      <div
        key="submit"
        className={`mt-2 rounded-xl border px-4 py-4 text-center text-sm font-semibold shadow-sm transition-colors ${currentWordIndex === submitIndex
          ? isSubmitPressed || isSelectActive
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-emerald-400 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-emerald-600"
          }`}
      >
        Submit Response
      </div>
    ) : null;
    const keyboardGrid = hasKeyboard ? (
      <div className="space-y-2">
        {keyboardRows.map((rowOptions, rowIndex) => {
          const rowStart = keyboardRowStarts[rowIndex] ?? 0;
          const isSuggestionRow = rowOptions.some(
            (option) => option.action === "suggestion" || option.action === "noop"
          );
          const isPlaceholderRow = isSuggestionRow && rowOptions.every((option) => option.action === "noop");
          const gridTemplateColumns = isPlaceholderRow
            ? `repeat(${Math.max(1, keyboardColumnCount)}, minmax(0, 1fr))`
            : isSuggestionRow
              ? `repeat(${Math.max(1, rowOptions.length)}, minmax(0, 1fr))`
              : `repeat(${Math.max(1, keyboardColumnCount)}, minmax(0, 1fr))`;

          return (
            <div
              key={`keyboard-row-${rowIndex}`}
              className="grid gap-2"
              style={{ gridTemplateColumns }}
            >
              {rowOptions.map((option, columnIndex) => {
                const optionIndex = keyboardStartIndex + rowStart + columnIndex;
                const isActive = optionIndex === currentWordIndex;
                const isPressed = isActive && isSelectActive;
                const isDisabled = option.action === "noop";

                let keyClasses = isSuggestionRow
                  ? "flex items-center justify-center rounded-full border px-3 py-2 text-sm font-medium transition-colors"
                  : "flex items-center justify-center rounded-xl border px-3 py-3 text-sm font-medium transition-colors";

                if (!isSuggestionRow && option.action !== "input") {
                  keyClasses += " text-xs";
                }

                if (isActive) {
                  keyClasses += isPressed
                    ? " border-emerald-500 bg-emerald-600 text-white"
                    : " border-emerald-300 bg-emerald-50 text-emerald-700";
                } else {
                  if (isSuggestionRow) {
                    keyClasses += isDisabled
                      ? " border-slate-200 bg-slate-50 text-slate-400"
                      : " border-slate-200 bg-white text-emerald-700";
                  } else {
                    keyClasses += " border-slate-200 bg-white text-slate-600";
                  }
                }

                const Element = isDisabled ? "div" : "button";
                const elementProps = isDisabled
                  ? {}
                  : {
                      type: "button" as const,
                      onClick: () => handleKeyboardSelection(option),
                      tabIndex: -1,
                    };

                return (
                  <Element
                    key={`keyboard-key-${option.label}-${columnIndex}`}
                    className={keyClasses}
                    style={
                      option.span && option.span > 1 && (!isSuggestionRow || isPlaceholderRow)
                        ? { gridColumn: `span ${option.span}` }
                        : undefined
                    }
                    {...elementProps}
                  >
                    {option.label}
                  </Element>
                );
              })}
            </div>
          );
        })}
      </div>
    ) : null;

    return (
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Word Navigator</h2>
            <p className="text-sm text-slate-600">
              Highlight “Start Typing” to fetch responses, then use Select to build your reply word by word.
            </p>
            {isKeyboardOpen && (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                Keyboard mode is active. Use the smile gesture to toggle, then navigate to letters or suggestions.
              </p>
            )}
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
            {responseWords.length > 0 || typedBuffer ? (
              <span>
                {responseWords.map((word, idx) => (
                  <React.Fragment key={`response-word-${idx}`}>
                    {idx > 0 ? " " : ""}
                    {word}
                  </React.Fragment>
                ))}
                {typedBuffer && (
                  <>
                    {responseWords.length > 0 ? " " : ""}
                    <span className="inline-flex items-center rounded border border-emerald-200 bg-white px-2 py-0.5 font-medium text-emerald-700 shadow-sm">
                      {typedBuffer}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span className="text-slate-400">No words selected yet.</span>
            )}
          </div>
        </div>

        {sentenceSuggestions.length > 0 && sentenceCards}
        {wordGrid}
        {submitButton}
        {keyboardGrid}
      </div>
    );
  };

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

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm min-h-[56px]">
            <Cpu className="w-5 h-5" />
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-2">
                <span className="font-medium leading-none">Gestures</span>
                {isDeveloperMode && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                    DEV MODE: Click to test
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 min-h-[26px]">
                {gestureNames.map((name) => {
                  const isActive = activeGestures.includes(name);
                  const baseClasses = "text-xs px-2 py-0.5 rounded-full border text-center transition-colors";
                  const stateClasses = isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-500";
                  const interactiveClasses = isDeveloperMode
                    ? "cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-700"
                    : "";
                  
                  return isDeveloperMode ? (
                    <button
                      key={name}
                      className={`${baseClasses} ${stateClasses} ${interactiveClasses}`}
                      onClick={() => simulateGesture(name)}
                      title={`Click to simulate ${name} gesture`}
                    >
                      {name}
                    </button>
                  ) : (
                    <span key={name} className={`${baseClasses} ${stateClasses}`}>
                      {name}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] items-start">
          <div className="space-y-6">
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
            {isSpeechSupported ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
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
          </div>

          {renderWordNavigator()}
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
              <details className="mt-6 text-slate-500">
                <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Advanced
                </summary>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-600">Developer mode</span>
                    <span className="text-xs text-slate-400">Keyboard testing helpers</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDeveloperMode((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      isDeveloperMode
                        ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                        : "border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700"
                    }`}
                  >
                    {isDeveloperMode ? "Disable" : "Enable"}
                  </button>
                </div>
              </details>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
