import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CameraOff, Sparkles, Activity, Play, Pause, X, Cpu } from "lucide-react";
import { useBlendshapeGestures } from "./hooks/useGesture";
import Keyboard, { LETTERS, SPECIAL_KEYS } from "./components/keyboard";
import { ask, AGENT_ID } from "./utils/asiAI";


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
};

type ConversationEntry = {
  role: "guest" | "user";
  text: string;
};

type NavigatorGridOption =
  | { type: "sentence"; style: string; text: string }
  | { type: "word"; label: string }
  | { type: "submit"; label: "Submit Response" }
  | KeyboardGridOption;

type AgentId = "agentmail" | "duckduckgo";

type AgentOption = {
  id: AgentId;
  label: string;
  description: string;
};

type AgentMailActivity = {
  id: string;
  timestamp: string;
  message: string;
  tone: "info" | "warning";
};

type AgentMailPreview = {
  id: string;
  subject: string;
  from: string;
  preview: string;
  received: string;
};

type DuckResult = {
  title: string;
  url: string;
  snippet: string;
};

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: "agentmail",
    label: "AgentMail",
    description: "Compose quick emails or review recent inbox activity without leaving the experience.",
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo Agent",
    description: "Run lightweight searches and review summarized answers from the sample agent output.",
  },
];

const DEFAULT_AGENT_ID: AgentId = AGENT_OPTIONS[0].id;

const SAMPLE_AGENTMAIL_INBOX: AgentMailPreview[] = [
  {
    id: "sample-1",
    subject: "Status update: VoiceLink live demo",
    from: "product@voicelink.ai",
    preview: "Sharing the highlights and next steps coming out of today's review.",
    received: "Today · 9:18 AM",
  },
  {
    id: "sample-2",
    subject: "PT session confirmation",
    from: "therapies@rehabpartners.com",
    preview: "Looking forward to Thursday at 2:30 PM. Reply to reschedule.",
    received: "Yesterday · 4:02 PM",
  },
  {
    id: "sample-3",
    subject: "Community volunteers meetup",
    from: "hello@neighborscollective.org",
    preview: "The next meetup is this Saturday. Let us know if you'll join in person or virtually.",
    received: "Tue · 6:41 PM",
  },
];

const DEFAULT_DDG_RESULTS: DuckResult[] = [
  {
    title: "Artificial intelligence",
    url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
    snippet:
      "Artificial intelligence covers methods that let computers learn, reason, and solve problems with human-like adaptability.",
  },
  {
    title: "Association for the Advancement of Artificial Intelligence",
    url: "https://duckduckgo.com/Association_for_the_Advancement_of_Artificial_Intelligence",
    snippet: "AAAI advances research and responsible practice across the AI community with conferences and publications.",
  },
  {
    title: "Organoid intelligence",
    url: "https://duckduckgo.com/Organoid_intelligence",
    snippet: "Organoid intelligence explores brain-cell-based computing models to push beyond silicon limitations.",
  },
  {
    title: "Computational neuroscience",
    url: "https://duckduckgo.com/c/Computational_neuroscience",
    snippet: "Computational neuroscience blends biology and modeling to understand the brain's information processing.",
  },
];

const DEFAULT_DDG_SUMMARY =
  "Use the DuckDuckGo agent to explore concise, privacy-friendly search summaries. Select a card to focus on a result.";

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
      { label: "Enter", action: "enter" },
    ],
    [
      { label: "Space", value: " ", action: "space" },
      { label: "Backspace", action: "backspace" },
      { label: "Clear", action: "clear" },
    ],
  ];
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
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [sentenceViewportColumns, setSentenceViewportColumns] = useState<number>(() =>
    getSentenceViewportColumns()
  );
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);

  const agentOptions = AGENT_OPTIONS;
  const [isAgentPopupOpen, setIsAgentPopupOpen] = useState(false);
  const [isAgentSelectionView, setIsAgentSelectionView] = useState(true);
  const [agentCurrentIndex, setAgentCurrentIndex] = useState(0);
  const [activeAgent, setActiveAgent] = useState<AgentId>(DEFAULT_AGENT_ID);
  const [agentMailDraft, setAgentMailDraft] = useState({ to: "", subject: "", body: "" });
  const [agentMailActivity, setAgentMailActivity] = useState<AgentMailActivity[]>([]);
  const [agentMailFocusIndex, setAgentMailFocusIndex] = useState(0);
  const [duckSearchQuery, setDuckSearchQuery] = useState("AI");
  const [duckSearchResults, setDuckSearchResults] = useState<DuckResult[]>(DEFAULT_DDG_RESULTS);
  const [duckSummary, setDuckSummary] = useState(DEFAULT_DDG_SUMMARY);
  const [duckFocusIndex, setDuckFocusIndex] = useState(0);
  const [agentKeyboardValue, setAgentKeyboardValue] = useState("");
  const [isAgentKeyboardOpen, setIsAgentKeyboardOpen] = useState(false);
  const [agentKeyboardSelection, setAgentKeyboardSelection] = useState(0);

  // Chat state for ASI AI testing
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // ASI AI Test Function
  const testASIAI = useCallback(async () => {
    console.log('🚀 Testing ASI AI functionality...');
    console.log('Agent ID:', AGENT_ID);
    
    try {
      const convId = 'test-conversation-' + Date.now();
      const testMessages = [
        { 
          role: 'user', 
          content: 'Hello! Can you help me test this connection?' 
        }
      ];
      
      console.log('📤 Sending test message:', testMessages);
      console.log('🔗 Conversation ID:', convId);
      
      // Test non-streaming first
      console.log('📝 Testing non-streaming response...');
      try {
        const response1 = await ask(convId, testMessages, false);
        console.log('✅ Non-streaming response:', response1);
        console.log('✅ Non-streaming response length:', response1?.length || 0);
      } catch (error) {
        console.error('❌ Non-streaming test failed:', error);
      }
      
      // Test streaming
      console.log('🌊 Testing streaming response...');
      try {
        const streamMessages = [
          { 
            role: 'user', 
            content: 'What is 2+2?' 
          }
        ];
        const response2 = await ask(convId + '-stream', streamMessages, true);
        console.log('✅ Streaming response completed:', response2);
        console.log('✅ Streaming response length:', response2?.length || 0);
      } catch (error) {
        console.error('❌ Streaming test failed:', error);
      }
      
    } catch (error) {
      console.error('❌ ASI AI test failed:', error);
    }
  }, []);

  // Chat functionality
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMessage = { role: 'user' as const, content: chatInput.trim() };
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);
    
    try {
      const convId = 'chat-' + Date.now();
      console.log('🚀 Sending chat message:', userMessage.content);
      
      // Use non-streaming since it shows response length > 0
      console.log('📝 Using non-streaming request (preferred)...');
      const response = await ask(convId, newMessages, false);
      
      console.log('✅ Received response:', response);
      console.log('✅ Response length:', response?.length || 0);
      
      if (!response || response.trim() === '') {
        setChatMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Empty response received. Please try again." }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
      }
      
    } catch (error) {
      console.error('❌ Chat error:', error);
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'Failed to get response'}. Check console for details.`;
      setChatMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, chatMessages, isChatLoading]);

  const handleChatKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  }, [sendChatMessage]);

  // Run ASI AI test when component mounts (only once)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Add a small delay to ensure everything is loaded
      const timer = setTimeout(() => {
        testASIAI();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, []); // Empty dependency array means this runs once on mount

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

      const rowOptions: KeyboardGridOption[] = row.map((key, columnIndex) => {
        const action: KeyboardAction = key.action ?? "input";
        const baseValue = key.value ?? (action === "input" ? key.label.toLowerCase() : undefined);
        const optionIndex = options.length + columnIndex;

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
        };
      });

      rows[rowIndex] = rowOptions;
      options.push(...rowOptions);
    });

    return { options, rowStarts, rowLengths, rows };
  }, [isKeyboardOpen, keyboardSuggestions, typedBuffer]);
  const keyboardOptions = keyboardData.options;
  const keyboardRowStarts = keyboardData.rowStarts;
  const keyboardRowLengths = keyboardData.rowLengths;
  const keyboardRows = keyboardData.rows;
  const sentenceColumns = useMemo(() => {
    if (!sentenceSuggestions.length) {
      return 1;
    }
    return Math.max(1, Math.min(sentenceViewportColumns, sentenceSuggestions.length));
  }, [sentenceSuggestions.length, sentenceViewportColumns]);
  const prevActiveGesturesRef = useRef<string[]>([]);
  const submitFlashTimeoutRef = useRef<number | null>(null);
  const keyboardToggleCooldownRef = useRef<number>(0);
  const suggestionRequestIdRef = useRef(0);
  const agentPopupCooldownRef = useRef<number>(0);
  const responseText = useMemo(() => {
    const parts = [...responseWords];
    if (typedBuffer) {
      parts.push(typedBuffer);
    }
    return parts.join(" ");
  }, [responseWords, typedBuffer]);
  const trimmedResponse = useMemo(() => responseText.trim(), [responseText]);
  const requestSuggestions = useCallback(
    async ({
      partialAnswer,
      question,
      conversationContext,
      loadingMessage = "Updating suggestions...",
    }: {
      partialAnswer: string;
      question?: string | null;
      conversationContext?: string;
      loadingMessage?: string;
    }) => {
      const resolvedQuestion = (question ?? activeQuestion ?? "").trim();
      if (!resolvedQuestion) {
        return false;
      }

      const resolvedConversation =
        conversationContext ??
        conversationHistory
          .map((entry) => `${entry.role}: ${entry.text}`)
          .join("\n");

      const payload = {
        question: resolvedQuestion,
        partial_answer: partialAnswer,
        conversation: resolvedConversation,
        suggestions_count: 5,
      };

      const requestId = ++suggestionRequestIdRef.current;

      if (loadingMessage) {
        setNavigatorOptions([loadingMessage]);
      }
      setCurrentSuggestions([]);
      setSentenceSuggestions([]);
      setCurrentWordIndex(0);
      setIsLoadingSuggestions(true);

      try {
        console.log("[Suggestions] Request payload", payload);
        const response = await fetch(SUGGEST_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Suggestion request failed: ${response.status}`);
        }

        const data = await response.json();

        if (suggestionRequestIdRef.current !== requestId) {
          return false;
        }

        const rawSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        const rawSentences = Array.isArray(data?.sentences) ? data.sentences : [];

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

        if (normalized.length > 0) {
          setCurrentSuggestions(normalized);
          setNavigatorOptions(normalized.map((node) => node.word));
        } else {
          setCurrentSuggestions([]);
          setNavigatorOptions(["No suggestions available", "Start Typing"]);
        }

        return true;
      } catch (error) {
        if (suggestionRequestIdRef.current === requestId) {
          console.error("Failed to load suggestions", error);
          setCurrentSuggestions([]);
          setSentenceSuggestions([]);
          setNavigatorOptions(["Unable to load responses", "Start Typing"]);
        }
        return false;
      } finally {
        if (suggestionRequestIdRef.current === requestId) {
          setIsLoadingSuggestions(false);
        }
      }
    },
    [activeQuestion, conversationHistory]
  );
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

  const agentMailFocusOrder = useMemo(() => ["to", "subject", "body", "send"] as const, []);
  const duckFocusOrder = useMemo(() => ["query", "run", "reset"] as const, []);

  const agentKeyboardSuggestions = useMemo(() => {
    if (isAgentSelectionView) {
      return [] as string[];
    }
    if (activeAgent === "agentmail") {
      const focus = agentMailFocusOrder[agentMailFocusIndex];
      if (focus === "to") {
        return [
          "care@voicelink.ai",
          "support@example.com",
          "teammate@agentmail.to",
        ];
      }
      if (focus === "subject") {
        return [
          "Quick follow-up",
          "Thanks for the update",
          "Scheduling next steps",
        ];
      }
      if (focus === "body") {
        return [
          "Appreciate the detailed notes—I'll circle back shortly.",
          "Let's connect later today to review the summary.",
          "Thanks! I can confirm and move ahead from here.",
        ];
      }
    }
    if (activeAgent === "duckduckgo") {
      const focus = duckFocusOrder[duckFocusIndex];
      if (focus === "query") {
        return [
          "artificial intelligence",
          "computational neuroscience",
          "privacy-first search engines",
        ];
      }
    }
    return [] as string[];
  }, [
    activeAgent,
    agentMailFocusIndex,
    agentMailFocusOrder,
    duckFocusIndex,
    duckFocusOrder,
    isAgentSelectionView,
  ]);

  const totalAgentKeyboardOptions = agentKeyboardSuggestions.length + LETTERS.length + SPECIAL_KEYS.length;

  useEffect(() => {
    if (!isAgentKeyboardOpen) {
      return;
    }
    setAgentKeyboardSelection((current) => {
      if (totalAgentKeyboardOptions <= 0) {
        return 0;
      }
      return Math.min(current, totalAgentKeyboardOptions - 1);
    });
  }, [isAgentKeyboardOpen, totalAgentKeyboardOptions]);

  const applyAgentMailValue = useCallback(
    (field: "to" | "subject" | "body", value: string) => {
      setAgentMailDraft((draft) => ({ ...draft, [field]: value }));
      if (activeAgent === "agentmail") {
        setAgentKeyboardValue(value);
      }
    },
    [activeAgent]
  );

  const handleAgentSuggestionClick = useCallback(
    (word: string) => {
      if (isAgentSelectionView) {
        return;
      }
      if (activeAgent === "agentmail") {
        const focus = agentMailFocusOrder[agentMailFocusIndex];
        if (focus === "to" || focus === "subject" || focus === "body") {
          applyAgentMailValue(focus, word);
        }
        return;
      }
      if (activeAgent === "duckduckgo") {
        const focus = duckFocusOrder[duckFocusIndex];
        if (focus === "query") {
          setDuckSearchQuery(word);
          setAgentKeyboardValue(word);
        }
      }
    },
    [
      activeAgent,
      agentMailFocusIndex,
      agentMailFocusOrder,
      applyAgentMailValue,
      duckFocusIndex,
      duckFocusOrder,
      isAgentSelectionView,
    ]
  );

  const handleAgentPopupToggle = useCallback(() => {
    const now = Date.now();
    if (now - agentPopupCooldownRef.current < 400) {
      return;
    }
    agentPopupCooldownRef.current = now;
    setIsAgentPopupOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsAgentSelectionView(true);
        const activeIndex = agentOptions.findIndex((option) => option.id === activeAgent);
        setAgentCurrentIndex(activeIndex >= 0 ? activeIndex : 0);
        setAgentMailFocusIndex(0);
        setDuckFocusIndex(0);
        setAgentKeyboardValue("");
        setIsAgentKeyboardOpen(false);
        setAgentKeyboardSelection(0);
      }
      if (!next) {
        setIsAgentSelectionView(true);
        setAgentKeyboardValue("");
        setIsAgentKeyboardOpen(false);
        setAgentKeyboardSelection(0);
      }
      return next;
    });
  }, [activeAgent, agentOptions]);

  const closeAgentPopup = useCallback(() => {
    agentPopupCooldownRef.current = Date.now();
    setIsAgentPopupOpen(false);
    setIsAgentSelectionView(true);
    setAgentMailFocusIndex(0);
    setDuckFocusIndex(0);
    setAgentKeyboardValue("");
    setIsAgentKeyboardOpen(false);
    setAgentKeyboardSelection(0);
  }, []);

  const handleAgentKeyboardToggle = useCallback(() => {
    if (isAgentSelectionView) {
      return;
    }
    setIsAgentKeyboardOpen((prev) => {
      const next = !prev;
      setAgentKeyboardSelection(0);
      return next;
    });
  }, [isAgentSelectionView]);

  const handleAgentNavigation = useCallback(
    (direction: "Left" | "Right" | "Up" | "Down") => {
      if (isAgentSelectionView) {
        if (agentOptions.length === 0) return;
        const step = direction === "Left" || direction === "Up" ? -1 : 1;
        setAgentCurrentIndex((current) => {
          const total = agentOptions.length;
          const next = (current + step + total) % total;
          return next;
        });
        return;
      }

      if (activeAgent === "agentmail") {
        const step = direction === "Left" || direction === "Up" ? -1 : 1;
        setAgentMailFocusIndex((current) => {
          const total = agentMailFocusOrder.length;
          const next = (current + step + total) % total;
          const focus = agentMailFocusOrder[next];
          if (focus === "to" || focus === "subject" || focus === "body") {
            setAgentKeyboardValue(agentMailDraft[focus]);
          } else {
            setAgentKeyboardValue("");
          }
          return next;
        });
        return;
      }

      if (activeAgent === "duckduckgo") {
        const step = direction === "Left" || direction === "Up" ? -1 : 1;
        setDuckFocusIndex((current) => {
          const total = duckFocusOrder.length;
          const next = (current + step + total) % total;
          const focus = duckFocusOrder[next];
          if (focus === "query") {
            setAgentKeyboardValue(duckSearchQuery);
          } else {
            setAgentKeyboardValue("");
          }
          return next;
        });
      }
    },
    [
      activeAgent,
      agentMailDraft,
      agentMailFocusOrder,
      agentOptions.length,
      duckFocusOrder,
      duckSearchQuery,
      isAgentSelectionView,
    ]
  );

  const handleAgentMailSend = useCallback(() => {
    const trimmedTo = agentMailDraft.to.trim();
    const trimmedSubject = agentMailDraft.subject.trim();
    const trimmedBody = agentMailDraft.body.trim();
    const timestamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    if (!trimmedTo || !trimmedSubject || !trimmedBody) {
      setAgentMailActivity((current) => {
        const entry: AgentMailActivity = {
          id: `warn-${Date.now()}`,
          timestamp,
          message: "Fill in all fields to simulate sending an email.",
          tone: "warning",
        };
        return [entry, ...current].slice(0, 6);
      });
      return;
    }

    setAgentMailActivity((current) => {
      const entry: AgentMailActivity = {
        id: `info-${Date.now()}`,
        timestamp,
        message: `Queued email to ${trimmedTo} with subject "${trimmedSubject}" (simulation).`,
        tone: "info",
      };
      return [entry, ...current].slice(0, 6);
    });
    setAgentMailDraft({ to: "", subject: "", body: "" });
    if (activeAgent === "agentmail") {
      setAgentMailFocusIndex(0);
      setAgentKeyboardValue("");
    }
  }, [activeAgent, agentMailDraft]);

  const handleDuckSearch = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const query = duckSearchQuery.trim();
      if (!query) {
        setDuckSearchResults(DEFAULT_DDG_RESULTS);
        setDuckSummary(DEFAULT_DDG_SUMMARY);
        return;
      }

      const normalized = query.toLowerCase();
      const matches = DEFAULT_DDG_RESULTS.filter(
        (result) =>
          result.title.toLowerCase().includes(normalized) ||
          result.snippet.toLowerCase().includes(normalized)
      );

      if (matches.length) {
        setDuckSearchResults(matches);
        setDuckSummary(`Top results for “${query}”`);
      } else {
        setDuckSearchResults(DEFAULT_DDG_RESULTS);
        setDuckSummary("No direct match. Showing highlighted DuckDuckGo snippets instead.");
      }
    },
    [duckSearchQuery]
  );

  const handleDuckReset = useCallback(() => {
    setDuckSearchQuery("AI");
    setDuckSearchResults(DEFAULT_DDG_RESULTS);
    setDuckSummary(DEFAULT_DDG_SUMMARY);
    if (!isAgentSelectionView && activeAgent === "duckduckgo") {
      setDuckFocusIndex(0);
      setAgentKeyboardValue("AI");
    }
  }, [activeAgent, isAgentSelectionView]);

  const handleAgentSelectConfirm = useCallback(() => {
    if (isAgentSelectionView) {
      const option = agentOptions[agentCurrentIndex];
      if (!option) return;
      setActiveAgent(option.id);
      setIsAgentSelectionView(false);
      if (option.id === "agentmail") {
        setAgentMailFocusIndex(0);
        setAgentKeyboardValue(agentMailDraft.to);
      } else {
        setDuckFocusIndex(0);
        setAgentKeyboardValue(duckSearchQuery);
        setDuckSummary(DEFAULT_DDG_SUMMARY);
      }
      return;
    }

    if (activeAgent === "agentmail") {
      const focus = agentMailFocusOrder[agentMailFocusIndex];
      if (focus === "send") {
        handleAgentMailSend();
        return;
      }
      const nextIndex = (agentMailFocusIndex + 1) % agentMailFocusOrder.length;
      setAgentMailFocusIndex(nextIndex);
      const nextFocus = agentMailFocusOrder[nextIndex];
      if (nextFocus === "to" || nextFocus === "subject" || nextFocus === "body") {
        setAgentKeyboardValue(agentMailDraft[nextFocus]);
      } else {
        setAgentKeyboardValue("");
      }
      return;
    }

    if (activeAgent === "duckduckgo") {
      const focus = duckFocusOrder[duckFocusIndex];
      if (focus === "run") {
        handleDuckSearch();
        return;
      }
      if (focus === "reset") {
        handleDuckReset();
        return;
      }
      const nextIndex = (duckFocusIndex + 1) % duckFocusOrder.length;
      setDuckFocusIndex(nextIndex);
      const nextFocus = duckFocusOrder[nextIndex];
      if (nextFocus === "query") {
        setAgentKeyboardValue(duckSearchQuery);
      } else {
        setAgentKeyboardValue("");
      }
    }
  }, [
    activeAgent,
    agentCurrentIndex,
    agentMailDraft,
    agentMailFocusIndex,
    agentMailFocusOrder,
    agentOptions,
    duckFocusIndex,
    duckFocusOrder,
    duckSearchQuery,
    handleAgentMailSend,
    handleDuckReset,
    handleDuckSearch,
    isAgentSelectionView,
  ]);

  const handleAgentMailDraftChange = useCallback(
    (field: "to" | "subject" | "body", value: string) => {
      setAgentMailDraft((draft) => ({ ...draft, [field]: value }));
      if (!isAgentSelectionView && activeAgent === "agentmail") {
        const focus = agentMailFocusOrder[agentMailFocusIndex];
        if (focus === field) {
          setAgentKeyboardValue(value);
        }
      }
    },
    [activeAgent, agentMailFocusIndex, agentMailFocusOrder, isAgentSelectionView]
  );

  const handleDuckResultSelect = useCallback((result: DuckResult) => {
    setDuckSummary(result.snippet);
  }, []);

  const focusAgentMailField = useCallback(
    (field: "to" | "subject" | "body" | "send") => {
      const index = agentMailFocusOrder.indexOf(field);
      if (index === -1) return;
      setAgentMailFocusIndex(index);
      if (field === "to" || field === "subject" || field === "body") {
        setAgentKeyboardValue(agentMailDraft[field]);
      } else {
        setAgentKeyboardValue("");
      }
    },
    [agentMailDraft, agentMailFocusOrder]
  );

  const focusDuckSection = useCallback(
    (section: "query" | "run" | "reset") => {
      const index = duckFocusOrder.indexOf(section);
      if (index === -1) return;
      setDuckFocusIndex(index);
      if (section === "query") {
        setAgentKeyboardValue(duckSearchQuery);
      } else {
        setAgentKeyboardValue("");
      }
    },
    [duckFocusOrder, duckSearchQuery]
  );

  const handleAgentKeyboardPress = useCallback(
    (key: string) => {
      if (isAgentSelectionView) {
        return;
      }

      if (activeAgent === "agentmail") {
        const focus = agentMailFocusOrder[agentMailFocusIndex];
        if (focus !== "to" && focus !== "subject" && focus !== "body") {
          if (key === "Enter") {
            handleAgentMailSend();
          }
          return;
        }
        const currentValue = agentMailDraft[focus];
        let nextValue = currentValue;
        if (key === "Backspace") {
          nextValue = currentValue.slice(0, -1);
        } else if (key === "Space") {
          nextValue = `${currentValue} `;
        } else if (key === "Enter") {
          handleAgentMailSend();
          return;
        } else if (key.length === 1) {
          nextValue = `${currentValue}${key.toLowerCase()}`;
        }
        applyAgentMailValue(focus, nextValue);
        return;
      }

      if (activeAgent === "duckduckgo") {
        const focus = duckFocusOrder[duckFocusIndex];
        if (focus !== "query") {
          if (key === "Enter") {
            if (focus === "run") {
              handleDuckSearch();
            } else if (focus === "reset") {
              handleDuckReset();
            }
          }
          return;
        }
        const currentValue = duckSearchQuery;
        let nextValue = currentValue;
        if (key === "Backspace") {
          nextValue = currentValue.slice(0, -1);
        } else if (key === "Space") {
          nextValue = `${currentValue} `;
        } else if (key === "Enter") {
          handleDuckSearch();
          return;
        } else if (key.length === 1) {
          nextValue = `${currentValue}${key.toLowerCase()}`;
        }
        setDuckSearchQuery(nextValue);
        setAgentKeyboardValue(nextValue);
      }
    },
    [
      activeAgent,
      agentMailDraft,
      agentMailFocusIndex,
      agentMailFocusOrder,
      applyAgentMailValue,
      duckFocusIndex,
      duckFocusOrder,
      duckSearchQuery,
      handleAgentMailSend,
      handleDuckReset,
      handleDuckSearch,
      isAgentSelectionView,
    ]
  );

  useEffect(() => {
    if (!isAgentPopupOpen) {
      return;
    }
    const activeIndex = agentOptions.findIndex((option) => option.id === activeAgent);
    if (activeIndex >= 0) {
      setAgentCurrentIndex(activeIndex);
    }
  }, [activeAgent, agentOptions, isAgentPopupOpen]);

  useEffect(() => {
    if (!isAgentPopupOpen || isAgentSelectionView) {
      return;
    }
    if (activeAgent === "agentmail") {
      const focus = agentMailFocusOrder[agentMailFocusIndex];
      if (focus === "to" || focus === "subject" || focus === "body") {
        setAgentKeyboardValue(agentMailDraft[focus]);
      } else {
        setAgentKeyboardValue("");
      }
    } else if (activeAgent === "duckduckgo") {
      const focus = duckFocusOrder[duckFocusIndex];
      if (focus === "query") {
        setAgentKeyboardValue(duckSearchQuery);
      } else {
        setAgentKeyboardValue("");
      }
    }
  }, [
    activeAgent,
    agentMailDraft,
    agentMailFocusIndex,
    agentMailFocusOrder,
    duckFocusIndex,
    duckFocusOrder,
    duckSearchQuery,
    isAgentPopupOpen,
    isAgentSelectionView,
  ]);

  const resetNavigator = useCallback(() => {
    setNavigatorOptions(["Start Typing"]);
    setResponseWords([]);
    setCurrentSuggestions([]);
    setIsLoadingSuggestions(false);
    setCurrentWordIndex(0);
    setSentenceSuggestions([]);
    setIsSubmitPressed(false);
    setActiveQuestion(null);
    suggestionRequestIdRef.current += 1;
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
    onActivate: handleAgentPopupToggle,
  },
  {
    name: "Right Wink",
    metrics: [
      { name: "eyeBlinkRight", threshold: 0.4, comparison: ">" as const },
      { name: "eyeBlinkLeft", threshold: 0.3, comparison: "<" as const },
    ],
    framesRequired: 1,
    onActivate: closeAgentPopup,
  },
], [closeAgentPopup, handleAgentPopupToggle, handleKeyboardToggle]);
  const gestureNames = useMemo(() => gestures.map((gesture) => gesture.name), [gestures]);

  const activeGestures = useBlendshapeGestures(blendShapes, gestures);

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

  const moveSelection = useCallback(
    (current: number, direction: "Left" | "Right" | "Up" | "Down") => {
      const sentenceCount = sentenceSuggestions.length;
      const wordCount = navigatorOptions.length;
      const hasSubmit = Boolean(trimmedResponse);
      const submitIndex = hasSubmit ? sentenceCount + wordCount : -1;
      const keyboardCount = isKeyboardOpen ? keyboardOptions.length : 0;
      const keyboardStart =
        keyboardCount > 0 ? (hasSubmit ? submitIndex + 1 : sentenceCount + wordCount) : -1;
      const sentenceCols = Math.max(1, sentenceColumns);
      const wordCols = wordCount > 0 ? Math.min(columns, wordCount) : 0;

      const totalCount = sentenceCount + wordCount + (hasSubmit ? 1 : 0) + keyboardCount;
      if (totalCount === 0) {
        return 0;
      }

      const clampToRange = (index: number) => Math.max(0, Math.min(index, totalCount - 1));

      const getWordIndex = (row: number, column: number): number | null => {
        if (wordCols <= 0) return null;
        if (row < 0) return null;
        const rowStart = row * wordCols;
        if (rowStart >= wordCount) return null;
        const rowLength = Math.min(wordCols, wordCount - rowStart);
        if (rowLength <= 0) return null;
        const clampedColumn = Math.max(0, Math.min(column, rowLength - 1));
        return sentenceCount + rowStart + clampedColumn;
      };

      const getKeyboardIndex = (row: number, column: number): number | null => {
        if (keyboardCount <= 0 || keyboardStart < 0) return null;
        if (row < 0) return null;
        const rowStart = keyboardRowStarts[row];
        const rowLength = keyboardRowLengths[row] ?? 0;
        if (rowStart === undefined || rowLength <= 0) return null;
        const clampedColumn = Math.max(0, Math.min(column, rowLength - 1));
        return keyboardStart + rowStart + clampedColumn;
      };

      const inSentences = sentenceCount > 0 && current < sentenceCount;
      const inWords =
        wordCount > 0 && current >= sentenceCount && current < sentenceCount + wordCount;
      const inSubmit = hasSubmit && current === submitIndex;
      const inKeyboard = keyboardCount > 0 && keyboardStart >= 0 && current >= keyboardStart;

      if (direction === "Right") {
        if (inSentences) {
          const row = Math.floor(current / sentenceCols);
          const rowStart = row * sentenceCols;
          if (rowStart >= sentenceCount) {
            return current;
          }
          const rowLength = Math.min(sentenceCols, sentenceCount - rowStart);
          if (rowLength <= 0) {
            return current;
          }
          const column = current - rowStart;
          if (column + 1 < rowLength && current + 1 < sentenceCount) {
            return current + 1;
          }
          return rowStart;
        }

        if (inWords) {
          if (wordCols <= 0) {
            return current;
          }
          const position = current - sentenceCount;
          const row = Math.floor(position / wordCols);
          const rowStart = row * wordCols;
          const rowLength = Math.min(wordCols, wordCount - rowStart);
          if (rowLength <= 0) {
            return current;
          }
          const column = position % wordCols;
          if (column + 1 < rowLength) {
            return current + 1;
          }
          return sentenceCount + rowStart;
        }

        if (inSubmit) {
          if (keyboardStart >= 0) {
            return keyboardStart;
          }
          return current;
        }

        if (inKeyboard && keyboardStart >= 0) {
          const keyboardIndex = current - keyboardStart;
          if (keyboardIndex >= 0 && keyboardIndex < keyboardOptions.length) {
            const option = keyboardOptions[keyboardIndex];
            if (option) {
              const rowStart = keyboardRowStarts[option.row] ?? 0;
              const rowLength = keyboardRowLengths[option.row] ?? 0;
              if (rowLength > 0) {
                if (option.column + 1 < rowLength) {
                  return keyboardStart + rowStart + option.column + 1;
                }
                return keyboardStart + rowStart;
              }
            }
          }
          return current;
        }

        return clampToRange(current);
      }

      if (direction === "Left") {
        if (inKeyboard && keyboardStart >= 0) {
          const keyboardIndex = current - keyboardStart;
          if (keyboardIndex >= 0 && keyboardIndex < keyboardOptions.length) {
            const option = keyboardOptions[keyboardIndex];
            if (option) {
              const rowStart = keyboardRowStarts[option.row] ?? 0;
              const rowLength = keyboardRowLengths[option.row] ?? 0;
              if (rowLength <= 0) {
                return current;
              }
              if (option.column > 0) {
                return keyboardStart + rowStart + option.column - 1;
              }
              return keyboardStart + rowStart + rowLength - 1;
            }
          }
          return current;
        }

        if (inSubmit) {
          if (wordCount > 0) {
            return sentenceCount + wordCount - 1;
          }
          if (sentenceCount > 0) {
            return sentenceCount - 1;
          }
          return current;
        }

        if (inWords) {
          if (wordCols <= 0) {
            return current;
          }
          const position = current - sentenceCount;
          const column = position % wordCols;
          if (column > 0) {
            return current - 1;
          }
          const row = Math.floor(position / wordCols);
          const rowStart = row * wordCols;
          const rowLength = Math.min(wordCols, wordCount - rowStart);
          if (rowLength <= 0) {
            return current;
          }
          return sentenceCount + rowStart + rowLength - 1;
        }

        if (inSentences) {
          const row = Math.floor(current / sentenceCols);
          const rowStart = row * sentenceCols;
          if (rowStart >= sentenceCount) {
            return current;
          }
          const rowLength = Math.min(sentenceCols, sentenceCount - rowStart);
          if (rowLength <= 0) {
            return current;
          }
          const column = current - rowStart;
          if (column > 0) {
            return current - 1;
          }
          return rowStart + rowLength - 1;
        }

        return clampToRange(current);
      }

      if (direction === "Down") {
        if (inSentences) {
          const nextIndex = current + sentenceCols;
          if (nextIndex < sentenceCount) {
            return nextIndex;
          }
          const sentenceColumn = current % sentenceCols;
          const wordIndex = getWordIndex(0, sentenceColumn);
          if (wordIndex !== null) {
            return wordIndex;
          }
          if (hasSubmit) {
            return submitIndex;
          }
          const keyboardIndex = getKeyboardIndex(0, sentenceColumn);
          if (keyboardIndex !== null) {
            return keyboardIndex;
          }
          return current;
        }

        if (inWords) {
          if (wordCols > 0) {
            const next = current + wordCols;
            if (next - sentenceCount < wordCount) {
              return next;
            }
          }
          if (hasSubmit) {
            return submitIndex;
          }
          const position = current - sentenceCount;
          const column = wordCols > 0 ? position % wordCols : 0;
          const keyboardIndex = getKeyboardIndex(0, column);
          if (keyboardIndex !== null) {
            return keyboardIndex;
          }
          return current;
        }

        if (inSubmit) {
          const keyboardIndex = getKeyboardIndex(0, 0);
          if (keyboardIndex !== null) {
            return keyboardIndex;
          }
          return current;
        }

        if (inKeyboard && keyboardStart >= 0) {
          const keyboardIndex = current - keyboardStart;
          if (keyboardIndex >= 0 && keyboardIndex < keyboardOptions.length) {
            const option = keyboardOptions[keyboardIndex];
            if (option) {
              const nextRow = option.row + 1;
              const nextIndex = getKeyboardIndex(nextRow, option.column);
              if (nextIndex !== null) {
                return nextIndex;
              }
            }
          }
          return current;
        }

        return clampToRange(current);
      }

      if (direction === "Up") {
        if (inKeyboard && keyboardStart >= 0) {
          const keyboardIndex = current - keyboardStart;
          if (keyboardIndex >= 0 && keyboardIndex < keyboardOptions.length) {
            const option = keyboardOptions[keyboardIndex];
            if (option) {
              if (option.row === 0) {
                if (hasSubmit) {
                  return submitIndex;
                }
                if (wordCount > 0) {
                  const wordRows = wordCols > 0 ? Math.ceil(wordCount / wordCols) : 0;
                  const lastWordRow = Math.max(0, wordRows - 1);
                  const target = getWordIndex(lastWordRow, option.column);
                  if (target !== null) {
                    return target;
                  }
                }
                if (sentenceCount > 0) {
                  const sentenceRows = Math.ceil(sentenceCount / sentenceCols);
                  const lastSentenceRow = Math.max(0, sentenceRows - 1);
                  const column = Math.min(option.column, sentenceCols - 1);
                  const candidate = lastSentenceRow * sentenceCols + column;
                  if (candidate < sentenceCount) {
                    return candidate;
                  }
                  return sentenceCount - 1;
                }
                return current;
              }

              const previousIndex = getKeyboardIndex(option.row - 1, option.column);
              if (previousIndex !== null) {
                return previousIndex;
              }
            }
          }
          return current;
        }

        if (inSubmit) {
          if (wordCount > 0) {
            return sentenceCount + wordCount - 1;
          }
          if (sentenceCount > 0) {
            return sentenceCount - 1;
          }
          return current;
        }

        if (inWords) {
          if (wordCols > 0) {
            const previous = current - wordCols;
            if (previous >= sentenceCount) {
              return previous;
            }
          }
          if (sentenceCount > 0) {
            const position = current - sentenceCount;
            const column = wordCols > 0 ? position % wordCols : 0;
            const sentenceRows = Math.ceil(sentenceCount / sentenceCols);
            const targetRow = Math.max(0, sentenceRows - 1);
            const targetColumn = Math.min(column, sentenceCols - 1);
            const candidate = targetRow * sentenceCols + targetColumn;
            if (candidate < sentenceCount) {
              return candidate;
            }
            return sentenceCount - 1;
          }
          return current;
        }

        if (inSentences) {
          const previous = current - sentenceCols;
          if (previous >= 0) {
            return previous;
          }
          return current;
        }

        return clampToRange(current);
      }

      return clampToRange(current);
    },
    [
      columns,
      isKeyboardOpen,
      keyboardOptions,
      keyboardRowLengths,
      keyboardRowStarts,
      navigatorOptions,
      sentenceColumns,
      sentenceSuggestions,
      trimmedResponse,
    ]
  );

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

  const renderAgentMailPanel = () => {
    const focus = agentMailFocusOrder[agentMailFocusIndex];
    const fieldClasses = (field: "to" | "subject" | "body") =>
      `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus:ring-2 ${
        focus === field
          ? "border-emerald-400 focus:border-emerald-400 focus:ring-emerald-100"
          : "border-slate-200 focus:border-emerald-200 focus:ring-emerald-50"
      }`;
    const sendButtonClasses =
      focus === "send"
        ? "inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm"
        : "inline-flex items-center justify-center rounded-lg border border-transparent bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700";

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Compose preview</h3>
            <p className="text-sm text-slate-600">This form simulates the AgentMail workflow locally—no email is actually sent.</p>
          </div>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">To</span>
            <input
              className={fieldClasses("to")}
              placeholder="recipient@example.com"
              value={agentMailDraft.to}
              onChange={(event) => handleAgentMailDraftChange("to", event.target.value)}
              onFocus={() => focusAgentMailField("to")}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Subject</span>
            <input
              className={fieldClasses("subject")}
              placeholder="Quick update from VoiceLink"
              value={agentMailDraft.subject}
              onChange={(event) => handleAgentMailDraftChange("subject", event.target.value)}
              onFocus={() => focusAgentMailField("subject")}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Message</span>
            <textarea
              className={`${fieldClasses("body")} h-32 resize-y leading-relaxed`}
              placeholder="Thanks for the update! Looking forward to the next steps."
              value={agentMailDraft.body}
              onChange={(event) => handleAgentMailDraftChange("body", event.target.value)}
              onFocus={() => focusAgentMailField("body")}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              focusAgentMailField("send");
              handleAgentMailSend();
            }}
            onFocus={() => focusAgentMailField("send")}
            className={sendButtonClasses}
          >
            Simulate send
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Recent activity</h3>
            <div className="mt-3 space-y-2 max-h-64 overflow-auto pr-1">
              {agentMailActivity.length === 0 ? (
                <p className="text-sm text-slate-500">Compose a draft or submit the form to see simulated actions.</p>
              ) : (
                agentMailActivity.map((entry) => {
                  const toneClasses =
                    entry.tone === "warning"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-100";
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${toneClasses}`}
                    >
                      <div className="font-semibold">{entry.timestamp}</div>
                      <div>{entry.message}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Sample inbox</h3>
            <p className="text-xs text-slate-500">These records mirror what the AgentMail SDK would retrieve.</p>
            <div className="mt-3 space-y-3 max-h-64 overflow-auto pr-1">
              {SAMPLE_AGENTMAIL_INBOX.map((message) => (
                <div key={message.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500">{message.received}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{message.subject}</div>
                  <div className="mt-1 text-xs text-slate-500">From {message.from}</div>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message.preview}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDuckAgentPanel = () => {
    const focus = duckFocusOrder[duckFocusIndex];
    const queryClasses =
      focus === "query"
        ? "mt-1 w-full rounded-lg border border-emerald-400 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-100"
        : "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-50";

    const primaryButtonClasses =
      focus === "run"
        ? "inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm"
        : "inline-flex items-center justify-center rounded-lg border border-transparent bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700";

    const secondaryButtonClasses =
      focus === "reset"
        ? "inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm"
        : "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700";

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Search playground</h3>
            <p className="text-sm text-slate-600">Submit a query to filter the built-in DuckDuckGo sample payload.</p>
          </div>
          <form className="space-y-3" onSubmit={(event) => handleDuckSearch(event)}>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search query</span>
              <input
                className={queryClasses}
                placeholder="Try “artificial intelligence” or “computational neuroscience”"
                value={duckSearchQuery}
                onFocus={() => focusDuckSection("query")}
                onChange={(event) => {
                  setDuckSearchQuery(event.target.value);
                  if (focus === "query") {
                    setAgentKeyboardValue(event.target.value);
                  }
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className={primaryButtonClasses}
                onFocus={() => focusDuckSection("run")}
              >
                Run search
              </button>
              <button
                type="button"
                onClick={() => {
                  focusDuckSection("reset");
                  handleDuckReset();
                }}
                onFocus={() => focusDuckSection("reset")}
                className={secondaryButtonClasses}
              >
                Reset sample
              </button>
            </div>
          </form>

          <div className="border-t border-slate-100 pt-4">
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {duckSearchResults.map((result) => {
                const formattedUrl = result.url.replace(/^https?:\/\//, "");
                return (
                  <button
                    key={result.url}
                    type="button"
                    onClick={() => handleDuckResultSelect(result)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-800">{result.title}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Highlight</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{result.snippet}</p>
                    <div className="mt-2 text-xs text-emerald-600">{formattedUrl}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">Agent summary</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{duckSummary}</p>
        </div>
      </div>
    );
  };

  const renderAgentPopup = () => (
    <AnimatePresence>
      {isAgentPopupOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeAgentPopup}
        >
          <motion.div
            className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl flex flex-col"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Agent Launcher</h2>
                <p className="text-sm text-slate-600">
                  Triggered via left wink. Navigate with your existing gestures; Select enters an agent workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAgentPopup}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-slate-200 hover:text-slate-700"
              >
                <span className="sr-only">Close agent popup</span>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-auto pr-1">
              {isAgentSelectionView ? (
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, agentOptions.length))}, minmax(0, 1fr))`,
                  }}
                >
                  {agentOptions.map((option, index) => {
                    const isActive = index === agentCurrentIndex;
                    const cardClasses = [
                      "rounded-xl border px-4 py-5 text-left shadow-sm transition-colors cursor-pointer",
                      isActive
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50",
                    ].join(" ");

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cardClasses}
                        onClick={() => {
                          setAgentCurrentIndex(index);
                          setActiveAgent(option.id);
                          setIsAgentSelectionView(false);
                          if (option.id === "agentmail") {
                            setAgentMailFocusIndex(0);
                            setAgentKeyboardValue(agentMailDraft.to);
                          } else {
                            setDuckFocusIndex(0);
                            setAgentKeyboardValue(duckSearchQuery);
                            setDuckSummary(DEFAULT_DDG_SUMMARY);
                          }
                        }}
                        onMouseEnter={() => setAgentCurrentIndex(index)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                            {option.label}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600">{option.description}</p>
                        {isActive && (
                          <div className="mt-4 rounded-lg border border-dashed border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                            Use Select gesture to confirm
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="font-semibold text-slate-700">{agentOptions.find((option) => option.id === activeAgent)?.label}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAgentSelectionView(true);
                        setAgentKeyboardValue("");
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      Back to agents
                    </button>
                  </div>
                  <div className="pb-2">
                    {activeAgent === "agentmail" ? renderAgentMailPanel() : renderDuckAgentPanel()}
                  </div>
                </div>
              )}
            </div>

            {!isAgentSelectionView && (
              <div className="mt-4">
                <Keyboard
                  onKeyPress={handleAgentKeyboardPress}
                  suggestions={agentKeyboardSuggestions}
                  currentInput={agentKeyboardValue}
                  onSuggestionClick={handleAgentSuggestionClick}
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

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

    setConversationHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "user" && last.text === spoken) {
        return prev;
      }
      return [...prev, { role: "user", text: spoken }];
    });

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
          const trimmed = typedBuffer.trim();
          if (!trimmed) {
            setTypedBuffer("");
            break;
          }
          const nextWords = [...responseWords, trimmed];
          setResponseWords(nextWords);
          setTypedBuffer("");
          setSentenceSuggestions([]);
          void requestSuggestions({
            partialAnswer: nextWords.join(" "),
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
          setSentenceSuggestions([]);
          void requestSuggestions({
            partialAnswer: "",
          });
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
          const finalWord = value.trim();
          if (!finalWord) {
            setTypedBuffer("");
            return;
          }
          const nextWords = [...responseWords, finalWord];
          setResponseWords(nextWords);
          setTypedBuffer("");
          setSentenceSuggestions([]);
          void requestSuggestions({
            partialAnswer: nextWords.join(" "),
          });
          break;
        }
        case "noop": {
          break;
        }
        default:
          break;
      }
    },
    [handleSubmitResponse, requestSuggestions, responseWords, typedBuffer]
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

      stopTranscription();

      const partialAnswer = trimmedResponse;
      let updatedHistory = conversationHistory;
      if (questionText) {
        const lastEntry = conversationHistory[conversationHistory.length - 1];
        if (!lastEntry || lastEntry.role !== "guest" || lastEntry.text !== questionText) {
          updatedHistory = [...conversationHistory, { role: "guest", text: questionText }];
          setConversationHistory(updatedHistory);
        }
      }
      const conversationContext = updatedHistory
        .map((entry) => `${entry.role}: ${entry.text}`)
        .join("\n");

      setActiveQuestion(questionText);
      void requestSuggestions({
        question: questionText,
        partialAnswer,
        conversationContext,
        loadingMessage: "Loading Responses...",
      });
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
    requestRepeatPrompt,
    resetNavigator,
    sentenceSuggestions,
    startTranscription,
    stopTranscription,
    transcript,
    trimmedResponse,
    typedBuffer,
    conversationHistory,
  ]);

  useEffect(() => {
    const prev = prevActiveGesturesRef.current;
    const newlyActivated = activeGestures.filter((gesture) => !prev.includes(gesture));

    newlyActivated.forEach((gesture) => {
      if (gesture === "Left Wink") {
        handleAgentPopupToggle();
        return;
      }

      if (gesture === "Right Wink") {
        closeAgentPopup();
        return;
      }

      if (isAgentPopupOpen) {
        if (gesture === "Select") {
          handleAgentSelectConfirm();
          return;
        }

        if (gesture === "Left" || gesture === "Right" || gesture === "Up" || gesture === "Down") {
          handleAgentNavigation(gesture as "Left" | "Right" | "Up" | "Down");
          return;
        }

        if (gesture === "Open keyboard") {
          return;
        }
      }

      if (gesture === "Select") {
        handleSelectGesture();
        return;
      }

      if (gesture === "Open keyboard") {
        handleKeyboardToggle();
        return;
      }

      if (gesture === "Left" || gesture === "Right" || gesture === "Up" || gesture === "Down") {
        setCurrentWordIndex((current) => {
          if (gridOptions.length === 0) {
            return 0;
          }
          const next = moveSelection(current, gesture);
          const maxIndex = Math.max(0, gridOptions.length - 1);
          return Math.max(0, Math.min(next, maxIndex));
        });
      }
    });

    prevActiveGesturesRef.current = activeGestures;
  }, [
    activeGestures,
    closeAgentPopup,
    gridOptions.length,
    handleAgentNavigation,
    handleAgentPopupToggle,
    handleAgentSelectConfirm,
    handleKeyboardToggle,
    handleSelectGesture,
    isAgentPopupOpen,
    moveSelection,
  ]);

  // Developer mode: simulate gesture activation
  const simulateGesture = useCallback((gestureName: string) => {
    if (!isDeveloperMode) return;

    if (gestureName === "Left Wink") {
      handleAgentPopupToggle();
      return;
    }

    if (gestureName === "Right Wink") {
      closeAgentPopup();
      return;
    }

    if (isAgentPopupOpen) {
      if (gestureName === "Select") {
        handleAgentSelectConfirm();
        return;
      }

      if (gestureName === "Left" || gestureName === "Right" || gestureName === "Up" || gestureName === "Down") {
        handleAgentNavigation(gestureName as "Left" | "Right" | "Up" | "Down");
        return;
      }

      if (gestureName === "Open keyboard") {
        return;
      }
    }

    if (gestureName === "Select") {
      handleSelectGesture();
      return;
    }

    if (gestureName === "Open keyboard") {
      handleKeyboardToggle();
      return;
    }

    if (gestureName === "Left" || gestureName === "Right" || gestureName === "Up" || gestureName === "Down") {
      setCurrentWordIndex((current) => {
        if (gridOptions.length === 0) {
          return 0;
        }
        const next = moveSelection(current, gestureName);
        const maxIndex = Math.max(0, gridOptions.length - 1);
        return Math.max(0, Math.min(next, maxIndex));
      });
    }
  }, [
    closeAgentPopup,
    gridOptions.length,
    handleAgentNavigation,
    handleAgentPopupToggle,
    handleAgentSelectConfirm,
    handleKeyboardToggle,
    handleSelectGesture,
    isAgentPopupOpen,
    isDeveloperMode,
    moveSelection,
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
    const sentenceCount = sentenceSuggestions.length;
    const wordCount = navigatorOptions.length;
    const hasSubmit = Boolean(trimmedResponse);
    const submitIndex = hasSubmit ? sentenceCount + wordCount : -1;
    const keyboardCount = isKeyboardOpen ? keyboardOptions.length : 0;
    const keyboardStart =
      keyboardCount > 0 ? (hasSubmit ? submitIndex + 1 : sentenceCount + wordCount) : -1;

    setCurrentWordIndex((current) => {
      if (keyboardCount > 0) {
        const keyboardEnd = keyboardStart + keyboardCount - 1;
        if (current < keyboardStart || current > keyboardEnd) {
          return keyboardStart;
        }
        return current;
      }

      const maxIndex = hasSubmit
        ? submitIndex
        : Math.max(0, sentenceCount + wordCount - 1);

      if (maxIndex < 0) {
        return 0;
      }

      return Math.min(current, maxIndex);
    });
  }, [
    isKeyboardOpen,
    keyboardOptions.length,
    navigatorOptions.length,
    sentenceSuggestions.length,
    trimmedResponse,
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
    setConversationHistory([]);
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
    setConversationHistory([]);
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
          const gridTemplateColumns = `repeat(${Math.max(1, rowOptions.length)}, minmax(0, 1fr))`;

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

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <Cpu className="w-5 h-5" />
            <span className="font-medium">Gesture</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              activeGestures.length > 0 
                ? "bg-emerald-50 text-emerald-700" 
                : "bg-slate-50 text-slate-500"
            }`}>
              {activeGestures.length > 0 ? activeGestures[0] : "None"}
            </span>
            {isDeveloperMode && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium ml-auto">
                DEV MODE
              </span>
            )}
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

        {/* ASI AI Chat Interface */}
        <div className="mt-8">
          <button
            onClick={() => setShowChat(!showChat)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow mb-4"
          >
            <Sparkles className="w-4 h-4" />
            {showChat ? 'Hide' : 'Show'} ASI AI Chat
          </button>

          {showChat && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">ASI AI Chat Test</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setChatMessages([])}
                    className="text-xs px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                  >
                    Clear Chat
                  </button>
                  <div className="text-xs text-slate-500">
                    Agent: {AGENT_ID.slice(0, 20)}...
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="space-y-3 max-h-96 overflow-y-auto border border-slate-100 rounded-xl p-4 bg-slate-50">
                {chatMessages.length === 0 ? (
                  <div className="text-slate-400 text-center py-8">
                    No messages yet. Start a conversation!
                  </div>
                ) : (
                  chatMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-2xl text-sm">
                      <span className="inline-flex items-center gap-1">
                        <span className="animate-pulse">●</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleChatKeyPress}
                  placeholder="Type your message... (e.g., 'use Hi-dream model to generate image of monkey')"
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isChatLoading}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                >
                  Send
                </button>
              </div>

              <div className="text-xs text-slate-500">
                💡 Try asking: "use Hi-dream model to generate image of monkey sitting on top of mountain"
                <br />
                🔧 If you get "No content received", the agent might be processing or needs time to respond.
                <br />
                📊 Check browser console (F12) for detailed debug information.
              </div>
            </div>
          )}
        </div>
      </div>
      {renderAgentPopup()}
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
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
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
                  {isDeveloperMode && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-slate-600">Test Gestures</span>
                        <span className="text-xs text-slate-400">Click to simulate</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {gestureNames.map((name) => (
                          <button
                            key={name}
                            onClick={() => simulateGesture(name)}
                            className="text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
