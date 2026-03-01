import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";

const generateId = () => Math.random().toString(36).substr(2, 9);
const now = () => new Date().toISOString();

// ── Spanish syllable counter ──
const countSyllables = (line) => {
  if (!line.trim()) return 0;
  const word = line.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, "");
  const vowels = "aeiouáéíóúü";
  const strongV = "aeoáéó";
  let count = 0, prevVowel = false;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === " ") { prevVowel = false; continue; }
    if (vowels.includes(ch)) {
      if (prevVowel) {
        const prev = word[i - 1];
        if (strongV.includes(ch) && strongV.includes(prev)) count++;
        else if ("íú".includes(ch) || "íú".includes(prev)) count++;
      } else count++;
      prevVowel = true;
    } else prevVowel = false;
  }
  return Math.max(count, 1);
};

const getRhymeEnding = (line) => {
  const words = line.trim().split(/\s+/);
  if (!words.length) return "";
  const last = words[words.length - 1].toLowerCase().replace(/[^a-záéíóúüñ]/gi, "");
  const vowels = "aeiouáéíóúü";
  let idx = -1;
  for (let i = last.length - 1; i >= 0; i--) { if (vowels.includes(last[i])) { idx = i; break; } }
  return idx === -1 ? last.slice(-3) : last.slice(Math.max(0, idx - 1));
};

// ── Emotion analysis with song tag awareness ──
const SONG_TAGS = ["Intro", "Verso", "Pre-estribillo", "Estribillo", "Puente", "Outro"];
const TAG_RE = /^\[(Intro|Verso|Pre-estribillo|Estribillo|Puente|Outro)\]\s*$/i;

const splitSongBlocks = (text) => {
  const lines = text.split("\n");
  const blocks = [];
  let cur = { tag: null, lines: [] };
  lines.forEach(l => {
    const m = l.trim().match(TAG_RE);
    if (m) {
      if (cur.lines.length) blocks.push({ tag: cur.tag, text: cur.lines.join("\n") });
      cur = { tag: m[1], lines: [] };
    } else {
      cur.lines.push(l);
    }
  });
  if (cur.lines.length) blocks.push({ tag: cur.tag, text: cur.lines.join("\n") });
  return blocks.filter(b => b.text.trim());
};

const emotionKeywords = {
  joy: ["amor","luz","sol","vida","feliz","alegr","sonr","brill","esper","sueñ","libre","calid","dulce"],
  sadness: ["llor","dolor","trist","oscur","sombr","soledad","vacío","perdi","muert","fría","silenc","ausenc","olvid"],
  anger: ["furi","rabi","odio","grit","fueg","destrui","rompí","sangr","golpe","quem"],
  fear: ["mied","terror","tembl","ansi","pánic","huir","sombr","abism","caer"],
  love: ["amor","beso","abraz","corazón","cariñ","quiero","ternur","piel","labio","suspir"],
  hope: ["esper","mañana","renac","nuevo","camin","horizont","amanecer","sembr","crec"]
};

const analyzeBlockEmotion = (text) => {
  const lower = text.toLowerCase();
  let scores = {}, total = 0;
  Object.entries(emotionKeywords).forEach(([emotion, kws]) => {
    let s = 0;
    kws.forEach(kw => { s += (lower.match(new RegExp(kw, "g")) || []).length; });
    scores[emotion] = s; total += s;
  });
  const intensity = Math.min(total / 5, 1);
  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const wordCount = text.trim().split(/\s+/).filter(w => w).length;
  const tension = Math.min(((scores.anger || 0) + (scores.fear || 0) + (scores.sadness || 0)) / Math.max(wordCount * 0.3, 1), 1);
  const affective = Math.min(((scores.love || 0) + (scores.joy || 0) + (scores.hope || 0)) / Math.max(wordCount * 0.3, 1), 1);
  return { intensity: Math.max(intensity, 0.05), dominant: dominant[0], scores, tension, affective };
};

const groupLinesByN = (text, n = 4) => {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length === 0) return [];
  const groups = [];
  for (let i = 0; i < lines.length; i += n) groups.push({ tag: null, text: lines.slice(i, i + n).join("\n") });
  return groups;
};

const analyzeEmotion = (text, isSong = false) => {
  if (!text.trim()) return [];
  let blocks;
  if (isSong) {
    const sb = splitSongBlocks(text);
    blocks = sb.length ? sb : text.split(/\n\s*\n/).filter(b => b.trim()).map(t => ({ tag: null, text: t }));
  } else {
    blocks = text.split(/\n\s*\n/).filter(b => b.trim()).map(t => ({ tag: null, text: t }));
  }
  // If only 1 block, try grouping by every 4 lines for better curve
  if (blocks.length <= 1) {
    const lineGroups = groupLinesByN(text, 4);
    if (lineGroups.length > 1) blocks = lineGroups;
  }
  // Final fallback: if still 1 block, split by every 2 lines
  if (blocks.length <= 1) {
    const lineGroups = groupLinesByN(text, 2);
    if (lineGroups.length > 1) blocks = lineGroups;
  }
  // Ultimate fallback: single-line text gets 1 block
  if (blocks.length === 0 && text.trim()) {
    blocks = [{ tag: null, text: text.trim() }];
  }
  const data = blocks.map((b, i) => ({ block: i, tag: b.tag, ...analyzeBlockEmotion(b.text), preview: b.text.trim().substring(0, 40) }));
  if (!data.length) return [];
  const avg = data.reduce((s, d) => s + d.intensity, 0) / data.length;
  const variance = data.reduce((s, d) => s + Math.pow(d.intensity - avg, 2), 0) / data.length;
  const stability = Math.max(0, 1 - Math.sqrt(variance) * 3);
  const diffs = data.slice(1).map((d, i) => Math.abs(d.intensity - data[i].intensity));
  const rhythm = diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : 0;
  const maxTension = Math.max(...data.map(d => d.tension));
  const maxTensionIdx = data.findIndex(d => d.tension === maxTension);
  return data.map((d, i) => ({ ...d, avgIntensity: avg, variance, stability, rhythm, isMaxTension: i === maxTensionIdx }));
};

const CLICHES = ["luz al final","mariposas en el estómago","como el viento","mar de lágrimas","corazón roto","alma gemela","contra viento y marea","noche oscura del alma","más allá","sin ti no soy nada","en lo más profundo","a flor de piel","perdido en tus ojos","camino sin retorno"];
const detectCliches = (t) => { const l = t.toLowerCase(); return CLICHES.filter(c => l.includes(c)); };

const detectRepetitions = (text) => {
  const lines = text.split("\n").map(l => l.trim().toLowerCase()).filter(l => l.length > 3 && !TAG_RE.test(l));
  const counts = {};
  lines.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
  return Object.entries(counts).filter(([, c]) => c > 1).map(([line, count]) => ({ line, count }));
};

const POETRY_SCHEMAS = {
  "Cuarteto": { lines: 4, syllables: 11, rhyme: "ABBA" },
  "Lira": { lines: 5, syllables: [7, 11, 7, 7, 11], rhyme: "aBabB" },
  "Soneto": { lines: 14, syllables: 11, rhyme: "ABBAABBACDCDCD" },
  "Romance": { lines: 8, syllables: 8, rhyme: "-a-a-a-a" },
  "Redondilla": { lines: 4, syllables: 8, rhyme: "abba" },
  "Décima": { lines: 10, syllables: 8, rhyme: "abbaaccddc" },
  "Verso libre": { lines: null, syllables: null, rhyme: null }
};

const gold = "#D4AF37", goldBright = "#FFD700";

// ── Emotion Curve SVG (smooth bezier, clear labels, Y axis) ──
const EmotionCurve = ({ data, width = 340, height = 170, showMarkers = true, id = "a" }) => {
  if (!data || !data.length) return <div style={{ color: "#666", fontSize: 12, padding: 16 }}>Escribe para ver el análisis emocional...</div>;

  const padL = 36, padR = 14, padT = 24, padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxI = Math.max(...data.map(d => d.intensity), 0.15);
  const minI = Math.min(...data.map(d => d.intensity));
  const climaxIdx = data.reduce((best, d, i) => d.intensity > data[best].intensity ? i : best, 0);
  const weakIdx = data.length > 1 ? data.reduce((best, d, i) => d.intensity < data[best].intensity ? i : best, 0) : -1;
  const tensionIdx = data.findIndex(d => d.isMaxTension);

  const getX = (i) => data.length === 1 ? padL + chartW / 2 : padL + (i / (data.length - 1)) * chartW;
  const getY = (val) => padT + chartH - (val / maxI) * chartH;

  const pts = data.map((d, i) => ({ x: getX(i), y: getY(d.intensity) }));

  // Smooth bezier path
  const bezierPath = pts.length === 1
    ? ""
    : pts.reduce((path, p, i) => {
        if (i === 0) return `M ${p.x},${p.y}`;
        const prev = pts[i - 1];
        const cpx = (prev.x + p.x) / 2;
        return `${path} C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
      }, "");

  // Area fill path
  const areaPath = pts.length > 1
    ? `${bezierPath} L ${pts[pts.length - 1].x},${padT + chartH} L ${pts[0].x},${padT + chartH} Z`
    : "";

  const avg = data[0]?.avgIntensity || 0;
  const variance = data[0]?.variance || 0;
  const stability = data[0]?.stability || 0;
  const rhythm = data[0]?.rhythm || 0;

  // Y axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].filter(v => v <= maxI + 0.1);

  return (
    <div>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={`cg${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={goldBright} stopOpacity="0.25" />
            <stop offset="100%" stopColor={goldBright} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = getY(v);
          return <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#222" strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={padL - 4} y={y + 3} fill="#555" fontSize="8" textAnchor="end" fontFamily="Montserrat">{v.toFixed(1)}</text>
          </g>;
        })}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={`url(#cg${id})`} />}

        {/* Main curve */}
        {bezierPath && <path d={bezierPath} fill="none" stroke={goldBright} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Average line */}
        {data.length > 1 && <line x1={padL} y1={getY(avg)} x2={width - padR} y2={getY(avg)} stroke={gold} strokeWidth="0.8" strokeDasharray="5,4" opacity="0.5" />}
        {data.length > 1 && <text x={width - padR + 2} y={getY(avg) + 3} fill={gold} fontSize="7" opacity="0.6" fontFamily="Montserrat">avg</text>}

        {/* Points and markers */}
        {pts.map((p, i) => {
          const isClimax = i === climaxIdx;
          const isWeak = i === weakIdx;
          const isTens = i === tensionIdx && showMarkers && tensionIdx !== climaxIdx;
          const isSpecial = showMarkers && (isClimax || isWeak || isTens);
          const r = isSpecial ? 5.5 : 3.5;
          const col = isClimax ? "#FF6B6B" : isWeak ? "#4ECDC4" : isTens ? "#FF9F43" : goldBright;

          return (
            <g key={i}>
              {isSpecial && <circle cx={p.x} cy={p.y} r={r + 3} fill={col} opacity="0.15" />}
              <circle cx={p.x} cy={p.y} r={r} fill={col} stroke="#000" strokeWidth="1" />
              {showMarkers && isClimax && (
                <g>
                  <rect x={p.x - 20} y={p.y - 22} width="40" height="14" rx="3" fill="#FF6B6B" opacity="0.9" />
                  <text x={p.x} y={p.y - 12} fill="#000" fontSize="8" textAnchor="middle" fontWeight="700" fontFamily="Montserrat">CLÍMAX</text>
                </g>
              )}
              {showMarkers && isWeak && data.length > 1 && (
                <g>
                  <rect x={p.x - 16} y={p.y - 22} width="32" height="14" rx="3" fill="#4ECDC4" opacity="0.9" />
                  <text x={p.x} y={p.y - 12} fill="#000" fontSize="8" textAnchor="middle" fontWeight="700" fontFamily="Montserrat">DÉBIL</text>
                </g>
              )}
              {showMarkers && isTens && (
                <g>
                  <rect x={p.x - 22} y={p.y + 8} width="44" height="14" rx="3" fill="#FF9F43" opacity="0.9" />
                  <text x={p.x} y={p.y + 18} fill="#000" fontSize="7" textAnchor="middle" fontWeight="700" fontFamily="Montserrat">TENSIÓN</text>
                </g>
              )}
            </g>
          );
        })}

        {/* X axis labels */}
        <line x1={padL} y1={padT + chartH + 2} x2={width - padR} y2={padT + chartH + 2} stroke="#333" strokeWidth="0.5" />
        {data.map((d, i) => (
          <text key={i} x={getX(i)} y={height - 6} fill="#777" fontSize="8" textAnchor="middle" fontFamily="Montserrat" fontWeight="500">
            {d.tag ? d.tag.slice(0, 4) : `B${i + 1}`}
          </text>
        ))}

        {/* Y axis label */}
        <text x="4" y={padT - 6} fill="#555" fontSize="7" fontFamily="Montserrat">Intensidad</text>
      </svg>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 10px", marginTop: 10 }}>
        {[
          { label: "Intensidad media", value: avg.toFixed(2), color: goldBright },
          { label: "Pico máximo", value: maxI.toFixed(2), color: "#FF6B6B" },
          { label: "Punto débil", value: minI.toFixed(2), color: "#4ECDC4" },
          { label: "Estabilidad", value: `${(stability * 100).toFixed(0)}%`, color: gold },
          { label: "Ritmo", value: rhythm.toFixed(3), color: gold },
          { label: "Bloques", value: data.length, color: gold },
        ].map(m => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <div style={{ color: m.color, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{m.value}</div>
            <div style={{ color: "#666", fontSize: 8, marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════
export default function Infiniversal() {
  const [screen, setScreen] = useState("home");
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("Todas");
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(16);
  const [showTechPanel, setShowTechPanel] = useState(false);
  const [showEmotionPanel, setShowEmotionPanel] = useState(false);
  const [flowMode, setFlowMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusPermanent, setFocusPermanent] = useState(false);
  const [flowTimer, setFlowTimer] = useState(0);
  const [flowTimerRunning, setFlowTimerRunning] = useState(false);
  const [editingTimer, setEditingTimer] = useState(false);
  const [timerInput, setTimerInput] = useState("");
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState(new Set());
  const [compareNotes, setCompareNotes] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState(null);
  const [guideTab, setGuideTab] = useState("general");
  const titlePressRef = useRef(null);
  const flowRef = useRef(null);
  const scrollRefA = useRef(null);
  const scrollRefB = useRef(null);
  const syncingScroll = useRef(false);

  const bg = darkMode ? "#000" : "#F5F5F0";
  const bgCard = darkMode ? "#111" : "#FFF";
  const textColor = darkMode ? "#E8E8E8" : "#1A1A1A";
  const textMuted = darkMode ? "#888" : "#666";
  const borderColor = darkMode ? "#333" : "#DDD";

  useEffect(() => {
    if (flowTimerRunning) flowRef.current = setInterval(() => setFlowTimer(t => t + 1), 1000);
    else clearInterval(flowRef.current);
    return () => clearInterval(flowRef.current);
  }, [flowTimerRunning]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }
  }, [toast]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const createNote = (type) => {
    const note = { id: generateId(), type, title: type === "poetry" ? "Nuevo poema" : "Nueva canción", content: "", folder: type === "poetry" ? "Poesía" : "Canción", created: now(), modified: now(), poetrySchema: null };
    setNotes(p => [note, ...p]); setCurrentNote(note); setShowNewNoteModal(false); setScreen("editor");
    setFlowMode(false); setFocusMode(focusPermanent); setShowTechPanel(false); setShowEmotionPanel(false); setUndoStack([]); setRedoStack([]);
  };

  const updateNote = useCallback((field, value) => {
    setCurrentNote(prev => { if (!prev) return prev; const u = { ...prev, [field]: value, modified: now() }; setNotes(ns => ns.map(n => n.id === u.id ? u : n)); return u; });
  }, []);

  const updateContent = useCallback((value) => {
    setUndoStack(prev => [...prev.slice(-30), currentNote?.content || ""]); setRedoStack([]); updateNote("content", value);
  }, [currentNote, updateNote]);

  const undo = () => { if (!undoStack.length) return; setRedoStack(r => [...r, currentNote?.content || ""]); updateNote("content", undoStack[undoStack.length - 1]); setUndoStack(u => u.slice(0, -1)); };
  const redo = () => { if (!redoStack.length) return; setUndoStack(u => [...u, currentNote?.content || ""]); updateNote("content", redoStack[redoStack.length - 1]); setRedoStack(r => r.slice(0, -1)); };

  const deleteNotes = (ids) => { setNotes(p => p.filter(n => !ids.has(n.id))); setSelectedNotes(new Set()); setSelectionMode(false); setConfirmDelete(false); };

  const createVersion = (noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return null;
    const base = note.title.replace(/ v\d+$/, "");
    const cnt = notes.filter(n => n.title.replace(/ v\d+$/, "") === base).length;
    const v = { ...note, id: generateId(), title: `${base} v${cnt + 1}`, created: now(), modified: now() };
    setNotes(p => [v, ...p]); return v;
  };

  const shareNotes = (ids) => {
    const arr = notes.filter(n => ids.has(n.id));
    const text = arr.map(n => `── ${n.title} ──\n${n.content}`).join("\n\n");
    if (navigator.share) navigator.share({ title: arr.length === 1 ? arr[0].title : "Mis versos", text });
    else navigator.clipboard?.writeText(text);
  };

  const filteredNotes = useMemo(() => {
    let r = notes;
    if (activeFolder === "Poesía") r = r.filter(n => n.folder === "Poesía");
    else if (activeFolder === "Canción") r = r.filter(n => n.folder === "Canción");
    else if (activeFolder === "Borradores") r = r.filter(n => !n.content.trim() || n.content.trim().split(/\s+/).length < 15);
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)); }
    return r;
  }, [notes, activeFolder, searchQuery]);

  const emotionData = useMemo(() => currentNote ? analyzeEmotion(currentNote.content, currentNote.type === "song") : [], [currentNote?.content, currentNote?.type]);
  const repetitions = useMemo(() => currentNote ? detectRepetitions(currentNote.content) : [], [currentNote?.content]);
  const cliches = useMemo(() => currentNote ? detectCliches(currentNote.content) : [], [currentNote?.content]);
  const textStats = useMemo(() => {
    if (!currentNote) return {};
    const c = currentNote.content, w = c.trim().split(/\s+/).filter(w => w), l = c.split("\n").filter(l => l.trim()), u = new Set(w.map(x => x.toLowerCase()));
    return { words: w.length, chars: c.length, lines: l.length, uniqueWords: u.size, density: w.length ? (u.size / w.length * 100).toFixed(1) : 0 };
  }, [currentNote?.content]);

  const poetryAnalysis = useMemo(() => {
    if (!currentNote || currentNote.type !== "poetry" || !currentNote.poetrySchema) return null;
    const schema = POETRY_SCHEMAS[currentNote.poetrySchema];
    if (!schema) return null;
    return currentNote.content.split("\n").filter(l => l.trim()).map((line, i) => {
      const sc = countSyllables(line);
      const tgt = schema.syllables ? (Array.isArray(schema.syllables) ? schema.syllables[i % schema.syllables.length] : schema.syllables) : null;
      return { line, syllables: sc, target: tgt, rhymeEnd: getRhymeEnding(line), ok: !tgt || Math.abs(sc - tgt) <= 1 };
    });
  }, [currentNote?.content, currentNote?.poetrySchema]);

  const handleScrollA = () => { if (syncingScroll.current) return; syncingScroll.current = true; if (scrollRefA.current && scrollRefB.current) scrollRefB.current.scrollTop = scrollRefA.current.scrollTop; setTimeout(() => { syncingScroll.current = false; }, 20); };
  const handleScrollB = () => { if (syncingScroll.current) return; syncingScroll.current = true; if (scrollRefA.current && scrollRefB.current) scrollRefA.current.scrollTop = scrollRefB.current.scrollTop; setTimeout(() => { syncingScroll.current = false; }, 20); };

  const bs = { background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" };

  // ── TUTORIAL ──
  const TutorialOverlay = () => {
    if (tutorialDismissed || !showTutorial) return null;
    const steps = [
      { t: "Bienvenido a Infiniversal", d: "Tu espacio profesional para crear poesía y letras de canciones." },
      { t: "Crear una nota", d: "Pulsa el botón + dorado para crear un poema o letra de canción." },
      { t: "Panel técnico", d: "La flecha dorada abre métricas: sílabas, rima, repeticiones y clichés." },
      { t: "Análisis emocional", d: "La bola dorada flotante muestra la curva narrativa con tensión, intensidad y carga afectiva." },
      { t: "Modos de escritura", d: "Modo flujo: sin distracciones + temporizador editable. Modo enfoque: mantén pulsado el título." },
      { t: "Comparador", d: "Mantén pulsada una nota, selecciona 2 y pulsa Comparar." },
      { t: "¡Listo!", d: "Vuelve a ver esta guía en Ajustes." }
    ];
    const s = steps[tutorialStep];
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#111", border: `1px solid ${gold}`, borderRadius: 16, padding: 28, maxWidth: 310, textAlign: "center" }}>
          <div style={{ width: 42, height: 42, margin: "0 auto 12px", background: `linear-gradient(135deg, ${gold}, ${goldBright})`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#000", fontWeight: 700 }}>{tutorialStep + 1}</div>
          <h3 style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 16, margin: "0 0 8px" }}>{s.t}</h3>
          <p style={{ color: "#CCC", fontFamily: "Montserrat,sans-serif", fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>{s.d}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {tutorialStep < steps.length - 1 ? (<>
              <button onClick={() => { setTutorialDismissed(true); setShowTutorial(false); }} style={{ padding: "6px 16px", background: "transparent", border: "1px solid #555", color: "#888", borderRadius: 8, fontFamily: "Montserrat,sans-serif", fontSize: 12, cursor: "pointer" }}>Saltar</button>
              <button onClick={() => setTutorialStep(i => i + 1)} style={{ padding: "6px 16px", background: gold, border: "none", color: "#000", borderRadius: 8, fontFamily: "Montserrat,sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Siguiente</button>
            </>) : (
              <button onClick={() => { setTutorialDismissed(true); setShowTutorial(false); }} style={{ padding: "6px 20px", background: gold, border: "none", color: "#000", borderRadius: 8, fontFamily: "Montserrat,sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>¡Empezar!</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 12 }}>
            {steps.map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === tutorialStep ? gold : "#444" }} />)}
          </div>
        </div>
      </div>
    );
  };

  // ── HOME ──
  const HomeScreen = () => (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif" }}>
      <div style={{ background: "#000", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 36 36"><defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={gold}/><stop offset="100%" stopColor={goldBright}/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M18 18c-3-3-6-6-9-6s-6 3-6 6 3 6 6 6 6-3 9-6c3 3 6 6 9 6s6-3 6-6-3-6-6-6-6 3-9 6z" fill="none" stroke="url(#ig)" strokeWidth="2.5" filter="url(#gl)"/></svg>
            <h1 style={{ color: gold, fontSize: 20, fontWeight: 700, margin: 0 }}>Mis versos</h1>
          </div>
          <button onClick={() => setScreen("settings")} style={bs}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10 }}>
          {["Todas", "Poesía", "Canción", "Borradores"].map(t => (
            <button key={t} onClick={() => setActiveFolder(t)} style={{ height: 36, padding: "0 16px", borderRadius: 18, border: "none", cursor: "pointer", background: activeFolder === t ? gold : "rgba(255,255,255,0.08)", color: activeFolder === t ? "#000" : "#FFF", fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: activeFolder === t ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: "10px 5%" }}>
        <div style={{ position: "relative" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar notas..." style={{ width: "100%", padding: "9px 12px 9px 38px", border: `1px solid ${darkMode ? "#555" : "#CCC"}`, borderRadius: 10, background: darkMode ? "#111" : "#FFF", color: textColor, fontFamily: "Montserrat,sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      {selectionMode && (
        <div style={{ display: "flex", gap: 6, padding: "6px 5%", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: gold, fontSize: 12, fontWeight: 600 }}>{selectedNotes.size} sel.</span>
          <button onClick={() => { setSelectionMode(false); setSelectedNotes(new Set()); }} style={{ background: "none", border: `1px solid #555`, color: "#999", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => shareNotes(selectedNotes)} style={{ background: gold, border: "none", color: "#000", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Compartir</button>
          {selectedNotes.size >= 1 && (
            <button onClick={() => { const id = [...selectedNotes][0]; const v = createVersion(id); if (v) { setToast("Versión creada: " + v.title); setSelectionMode(false); setSelectedNotes(new Set()); } }} style={{ background: "none", border: `1px solid ${gold}`, color: gold, borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>Crear versión</button>
          )}
          {selectedNotes.size === 2 && (
            <button onClick={() => { const ids = [...selectedNotes]; const a = notes.find(n => n.id === ids[0]); const b = notes.find(n => n.id === ids[1]); if (a && b) { setCompareNotes({ a, b }); setScreen("compare"); setSelectionMode(false); setSelectedNotes(new Set()); } }} style={{ background: gold, border: "none", color: "#000", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Comparar</button>
          )}
          <button onClick={() => setConfirmDelete(true)} style={{ background: "#C0392B", border: "none", color: "#FFF", borderRadius: 6, padding: "3px 10px", fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>Eliminar</button>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#111", border: "1px solid #444", borderRadius: 14, padding: 24, maxWidth: 280, textAlign: "center" }}>
            <p style={{ color: "#FFF", fontFamily: "Montserrat,sans-serif", fontSize: 14, marginBottom: 16 }}>¿Eliminar {selectedNotes.size} nota(s)?</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "6px 16px", background: "transparent", border: "1px solid #555", color: "#888", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>No</button>
              <button onClick={() => deleteNotes(selectedNotes)} style={{ padding: "6px 16px", background: "#C0392B", border: "none", color: "#FFF", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "2px 5% 100px" }}>
        {filteredNotes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px" }}>
            <svg width="50" height="50" viewBox="0 0 36 36" style={{ opacity: 0.2, marginBottom: 10 }}><path d="M18 18c-3-3-6-6-9-6s-6 3-6 6 3 6 6 6 6-3 9-6c3 3 6 6 9 6s6-3 6-6-3-6-6-6-6 3-9 6z" fill="none" stroke={gold} strokeWidth="2"/></svg>
            <p style={{ color: textMuted, fontSize: 14 }}>No hay notas aún</p>
            <p style={{ color: textMuted, fontSize: 12, marginTop: 3 }}>Pulsa + para crear tu primer verso</p>
          </div>
        ) : filteredNotes.map(note => (
          <div key={note.id}
            onClick={() => { if (selectionMode) { setSelectedNotes(p => { const n = new Set(p); n.has(note.id) ? n.delete(note.id) : n.add(note.id); return n; }); } else { setCurrentNote(note); setScreen("editor"); setFlowMode(false); setFocusMode(focusPermanent); setShowTechPanel(false); setShowEmotionPanel(false); setUndoStack([]); setRedoStack([]); } }}
            onContextMenu={e => { e.preventDefault(); setSelectionMode(true); setSelectedNotes(new Set([note.id])); }}
            onTouchStart={e => { const t = setTimeout(() => { setSelectionMode(true); setSelectedNotes(new Set([note.id])); }, 600); e.currentTarget._lt = t; }}
            onTouchEnd={e => clearTimeout(e.currentTarget._lt)}
            style={{ background: selectedNotes.has(note.id) ? (darkMode ? "#1a1a0a" : "#FFF8E1") : bgCard, border: `1px solid ${selectedNotes.has(note.id) ? gold : borderColor}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: "pointer", position: "relative" }}>
            {selectionMode && <div style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderRadius: "50%", border: `2px solid ${gold}`, background: selectedNotes.has(note.id) ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{selectedNotes.has(note.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: `${gold}22`, color: gold, fontWeight: 600 }}>{note.type === "poetry" ? "Poesía" : "Canción"}</span>
              {note.poetrySchema && <span style={{ fontSize: 9, color: textMuted }}>{note.poetrySchema}</span>}
            </div>
            <h3 style={{ color: textColor, fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>{note.title}</h3>
            <p style={{ color: textMuted, fontSize: 11, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.content.substring(0, 80) || "Sin contenido"}</p>
            <p style={{ color: textMuted, fontSize: 9, marginTop: 5, opacity: 0.5 }}>{new Date(note.modified).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        ))}
      </div>

      <button onClick={() => setShowNewNoteModal(true)} style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: 60, height: 60, borderRadius: "50%", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${gold}, ${goldBright})`, boxShadow: "2px 2px 10px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      {showNewNoteModal && (
        <div onClick={() => setShowNewNoteModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: "20px 20px 0 0", padding: "22px 24px 30px", width: "100%", maxWidth: 400 }}>
            <h3 style={{ color: gold, textAlign: "center", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>¿Qué quieres crear?</h3>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              {[{ type: "poetry", label: "Poesía", svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> }, { type: "song", label: "Letra de canción", svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> }].map(o => (
                <button key={o.type} onClick={() => createNote(o.type)} style={{ width: 120, padding: "16px 12px", background: "transparent", border: `1.5px solid ${gold}`, borderRadius: 14, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  {o.svg}
                  <span style={{ color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: 600 }}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── EDITOR ──
  const EditorScreen = () => {
    if (!currentNote) return null;
    const isSong = currentNote.type === "song";
    const isPoetry = currentNote.type === "poetry";
    const ef = focusMode || focusPermanent;
    const sp = !flowMode && !ef;

    return (
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif", position: "relative" }}>
        <div style={{ background: "#000", padding: "7px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
            <button onClick={() => { setScreen("home"); setFlowMode(false); setFlowTimerRunning(false); }} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
            <input value={currentNote.title} onChange={e => updateNote("title", e.target.value)}
              onTouchStart={() => { titlePressRef.current = setTimeout(() => setFocusMode(true), 2500); }}
              onTouchEnd={() => clearTimeout(titlePressRef.current)}
              onMouseDown={() => { titlePressRef.current = setTimeout(() => setFocusMode(true), 2500); }}
              onMouseUp={() => clearTimeout(titlePressRef.current)}
              style={{ background: "none", border: "none", color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 15, fontWeight: 700, outline: "none", flex: 1, minWidth: 0 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            {flowMode && (editingTimer ? (
              <input value={timerInput} onChange={e => setTimerInput(e.target.value.replace(/[^0-9:]/g, ""))}
                onBlur={() => { const p = timerInput.split(":").map(Number); if (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) setFlowTimer(p[0] * 60 + p[1]); setEditingTimer(false); }}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} autoFocus
                style={{ width: 52, padding: "2px 4px", background: "rgba(255,255,255,0.1)", border: `1px solid ${gold}`, borderRadius: 4, color: "#FFF", fontSize: 11, fontFamily: "monospace", textAlign: "center", outline: "none" }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button onClick={() => setFlowTimerRunning(r => !r)} style={{ ...bs, color: "#FFF", fontSize: 11, fontFamily: "monospace", padding: "2px 5px", background: "rgba(255,255,255,0.1)", borderRadius: 4 }}>
                  {flowTimerRunning ? "⏸" : "▶"} {fmt(flowTimer)}
                </button>
                <button onClick={() => { setTimerInput(fmt(flowTimer)); setEditingTimer(true); }} style={bs}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            ))}
            <button onClick={undo} style={{ ...bs, opacity: undoStack.length ? 1 : 0.3 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
            <button onClick={redo} style={{ ...bs, opacity: redoStack.length ? 1 : 0.3 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg></button>
            <button onClick={() => shareNotes(new Set([currentNote.id]))} style={bs}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
            <button style={bs} title="Guardar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
            <button onClick={() => { const v = createVersion(currentNote.id); if (v) setToast("Versión creada: " + v.title); }} style={bs}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
            {sp && <button onClick={() => setShowTechPanel(t => !t)} style={{ width: 30, height: 30, background: showTechPanel ? gold : "transparent", border: `1.5px solid ${gold}`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "1px 1px 3px #000" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={showTechPanel ? "#000" : gold} strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 5, padding: "5px 8px", background: darkMode ? "#0a0a0a" : "#EEEDE8" }}>
          <button onClick={() => { setFlowMode(f => { if (!f) { setFlowTimer(0); setFlowTimerRunning(true); } else setFlowTimerRunning(false); return !f; }); }} style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${flowMode ? goldBright : borderColor}`, background: flowMode ? `${gold}22` : "transparent", color: flowMode ? gold : textMuted, fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>{flowMode ? "✦ Flujo" : "Modo flujo"}</button>
          {!focusPermanent && <button onClick={() => setFocusMode(f => !f)} style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${ef ? goldBright : borderColor}`, background: ef ? `${gold}22` : "transparent", color: ef ? gold : textMuted, fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer" }}>{ef ? "✦ Enfoque" : "Modo enfoque"}</button>}
        </div>

        {isSong && !flowMode && (
          <div style={{ display: "flex", gap: 4, padding: "4px 8px", overflowX: "auto", background: darkMode ? "#0a0a0a" : "#EEEDE8" }}>
            {SONG_TAGS.map(tag => (
              <button key={tag} onClick={() => updateContent((currentNote?.content || "") + `\n[${tag}]\n`)} style={{ padding: "4px 9px", borderRadius: 5, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${gold}, ${goldBright})`, color: "#000", fontFamily: "Montserrat,sans-serif", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>[{tag}]</button>
            ))}
          </div>
        )}

        {isPoetry && !currentNote.poetrySchema && !flowMode && (
          <div style={{ padding: 8 }}>
            <p style={{ color: gold, fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Tipo de poesía:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {Object.keys(POETRY_SCHEMAS).map(type => (
                <button key={type} onClick={() => updateNote("poetrySchema", type)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${gold}`, background: "transparent", color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, background: `${gold}22`, color: gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>✦</span>{type}
                </button>
              ))}
            </div>
          </div>
        )}

        {isPoetry && currentNote.poetrySchema && !flowMode && (
          <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 6, background: darkMode ? "#0a0a0a" : "#EEEDE8" }}>
            <span style={{ color: gold, fontSize: 11, fontWeight: 600 }}>{currentNote.poetrySchema}</span>
            {POETRY_SCHEMAS[currentNote.poetrySchema]?.rhyme && <span style={{ color: textMuted, fontSize: 10 }}>Rima: {POETRY_SCHEMAS[currentNote.poetrySchema].rhyme}</span>}
            <button onClick={() => updateNote("poetrySchema", null)} style={{ marginLeft: "auto", color: textMuted, fontSize: 10, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Cambiar</button>
          </div>
        )}

        <div style={{ display: "flex" }}>
          {isPoetry && poetryAnalysis && !flowMode && (
            <div style={{ width: 48, padding: "8px 2px", textAlign: "right", flexShrink: 0, borderRight: `1px solid ${borderColor}`, background: darkMode ? "#080808" : "#F8F8F4" }}>
              {poetryAnalysis.map((la, i) => (
                <div key={i} style={{ height: `${fontSize * 1.8}px`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1, paddingRight: 2 }}>
                  <span style={{ fontSize: 8, color: textMuted }}>{i + 1}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: la.ok ? (darkMode ? "#CCC" : "#000") : "#FF0000", minWidth: 12, textAlign: "center" }}>{la.syllables}</span>
                  {la.target && <span style={{ fontSize: 7, color: textMuted }}>/{la.target}</span>}
                </div>
              ))}
            </div>
          )}
          <textarea value={currentNote.content} onChange={e => updateContent(e.target.value)}
            placeholder={isSong ? "Empieza a escribir tu letra..." : "Empieza a escribir tu poema..."}
            style={{ flex: 1, minHeight: "55vh", padding: 10, border: "none", outline: "none", resize: "none", background: "transparent", color: textColor, fontFamily: "Montserrat,sans-serif", fontSize, lineHeight: 1.8, caretColor: gold }} />
          {isPoetry && poetryAnalysis && !flowMode && POETRY_SCHEMAS[currentNote.poetrySchema]?.rhyme && (
            <div style={{ width: 24, padding: "8px 1px", flexShrink: 0, borderLeft: `1px solid ${borderColor}` }}>
              {poetryAnalysis.map((la, i) => {
                const rp = POETRY_SCHEMAS[currentNote.poetrySchema].rhyme.replace(/\s/g, "");
                const ml = rp[i % rp.length] || "-";
                const ms = poetryAnalysis.filter((_, j) => j !== i && (rp[j % rp.length] || "-") === ml);
                const hr = ml === "-" || ms.some(m => la.rhymeEnd.length > 1 && m.rhymeEnd.length > 1 && la.rhymeEnd.slice(-2) === m.rhymeEnd.slice(-2));
                const c = ml === "-" ? textMuted : (hr ? "#00FF00" : (la.rhymeEnd ? "#FFA500" : "#FF0000"));
                return <div key={i} style={{ height: `${fontSize * 1.8}px`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: c, fontWeight: 700 }}>{ml !== "-" ? ml : "·"}</span></div>;
              })}
            </div>
          )}
        </div>

        {isSong && repetitions.length > 0 && !flowMode && (
          <div style={{ padding: "5px 8px", background: `${goldBright}08`, borderTop: `1px solid ${borderColor}` }}>
            <p style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Bloques repetidos:</p>
            {repetitions.slice(0, 4).map((r, i) => <div key={i} style={{ color: goldBright, fontSize: 10, padding: "1px 5px", background: `${goldBright}12`, borderRadius: 3, marginBottom: 1 }}>"{r.line}" × {r.count}</div>)}
          </div>
        )}

        {showTechPanel && sp && (
          <div style={{ position: "fixed", top: 46, right: 0, width: "80%", maxWidth: 320, height: "calc(100vh - 46px)", background: "#111", borderLeft: `1px solid ${gold}33`, zIndex: 40, overflowY: "auto", padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ color: gold, fontSize: 13, fontWeight: 700, margin: 0 }}>Panel técnico</h3>
              <button onClick={() => setShowTechPanel(false)} style={{ ...bs, color: gold, fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
              {[{ l: "Palabras", v: textStats.words }, { l: "Caracteres", v: textStats.chars }, { l: "Líneas", v: textStats.lines }, { l: "Únicas", v: textStats.uniqueWords }, { l: "Densidad", v: `${textStats.density}%` }].map(s => (
                <div key={s.l} style={{ background: "#1a1a1a", borderRadius: 6, padding: 7 }}><div style={{ color: textMuted, fontSize: 9 }}>{s.l}</div><div style={{ color: gold, fontSize: 15, fontWeight: 700 }}>{s.v || 0}</div></div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Repeticiones</h4>
              {!repetitions.length ? <p style={{ color: textMuted, fontSize: 10 }}>Sin repeticiones</p> : repetitions.map((r, i) => <div key={i} style={{ color: goldBright, fontSize: 10, marginBottom: 2, padding: "2px 5px", background: `${goldBright}10`, borderRadius: 3 }}>"{r.line}" — {r.count}×</div>)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Clichés</h4>
              {!cliches.length ? <p style={{ color: "#4ECDC4", fontSize: 10 }}>✓ Sin clichés</p> : cliches.map((c, i) => <div key={i} style={{ color: "#FFA500", fontSize: 10, marginBottom: 2, padding: "2px 5px", background: "#FFA50010", borderRadius: 3 }}>⚠ "{c}"</div>)}
            </div>
            {/* Syllable counter - all note types */}
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Contador de sílabas</h4>
              {(() => {
                const lines = (currentNote?.content || "").split("\n").filter(l => l.trim() && !TAG_RE.test(l.trim()));
                if (!lines.length) return <p style={{ color: textMuted, fontSize: 10 }}>Sin versos</p>;
                const totalSylls = lines.reduce((s, l) => s + countSyllables(l), 0);
                return (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, padding: "4px 6px", background: "#1a1a1a", borderRadius: 5 }}>
                      <span style={{ color: textMuted, fontSize: 10 }}>Total sílabas</span>
                      <span style={{ color: gold, fontSize: 12, fontWeight: 700 }}>{totalSylls}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, padding: "4px 6px", background: "#1a1a1a", borderRadius: 5 }}>
                      <span style={{ color: textMuted, fontSize: 10 }}>Media por verso</span>
                      <span style={{ color: gold, fontSize: 12, fontWeight: 700 }}>{(totalSylls / lines.length).toFixed(1)}</span>
                    </div>
                    <div style={{ maxHeight: 140, overflowY: "auto" }}>
                      {lines.map((l, i) => {
                        const sc = countSyllables(l);
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, padding: "3px 4px", borderBottom: "1px solid #1a1a1a" }}>
                            <span style={{ color: textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                              <span style={{ color: "#555", marginRight: 4 }}>{i + 1}.</span>{l.trim()}
                            </span>
                            <span style={{ color: gold, fontWeight: 700, fontSize: 11, minWidth: 24, textAlign: "right" }}>{sc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            {isPoetry && poetryAnalysis && (
              <div>
                <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Métrica</h4>
                {poetryAnalysis.map((la, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0", borderBottom: "1px solid #222" }}><span style={{ color: textMuted }}>L{i + 1}: {la.line.substring(0, 20)}…</span><span style={{ color: la.ok ? "#4ECDC4" : "#FF4444", fontWeight: 600 }}>{la.syllables}s</span></div>)}
              </div>
            )}
          </div>
        )}

        {sp && <button onClick={() => setShowEmotionPanel(e => !e)} style={{ position: "fixed", bottom: 16, left: 12, width: 50, height: 50, borderRadius: "50%", background: `radial-gradient(circle at 30% 30%, ${goldBright}, ${gold})`, border: "none", cursor: "pointer", boxShadow: `0 0 12px ${gold}44, 0 0 25px ${gold}22`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>}

        {showEmotionPanel && sp && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#111", borderTop: `2px solid ${gold}`, zIndex: 45, padding: 12, maxHeight: "55vh", overflowY: "auto", borderRadius: "14px 14px 0 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ color: gold, fontSize: 12, fontWeight: 700, margin: 0 }}>Curva narrativa</h3>
              <button onClick={() => setShowEmotionPanel(false)} style={{ ...bs, color: gold, fontSize: 18 }}>×</button>
            </div>
            <EmotionCurve data={emotionData} width={350} height={180} id="ed" />
            {emotionData.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Detalle por bloque</h4>
                {emotionData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2, fontSize: 10 }}>
                    <span style={{ color: textMuted, minWidth: 36 }}>{d.tag || `B${i + 1}`}</span>
                    <div style={{ flex: 1, height: 4, background: "#222", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${d.intensity * 100}%`, height: "100%", background: `linear-gradient(90deg, ${gold}, ${goldBright})`, borderRadius: 2 }} /></div>
                    <span style={{ color: gold, minWidth: 40, textAlign: "right", fontSize: 9 }}>{d.dominant}</span>
                    <span style={{ color: "#FF9F43", minWidth: 28, textAlign: "right", fontSize: 9 }}>T:{d.tension.toFixed(2)}</span>
                    <span style={{ color: "#4ECDC4", minWidth: 28, textAlign: "right", fontSize: 9 }}>A:{d.affective.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── COMPARE ──
  const CompareScreen = () => {
    if (!compareNotes) return null;
    const { a, b } = compareNotes;
    const lA = a.content.split("\n"), lB = b.content.split("\n");
    const maxL = Math.max(lA.length, lB.length);
    const eA = analyzeEmotion(a.content, a.type === "song"), eB = analyzeEmotion(b.content, b.type === "song");
    const wA = a.content.trim().split(/\s+/).filter(w => w), wB = b.content.trim().split(/\s+/).filter(w => w);
    const uA = new Set(wA.map(w => w.toLowerCase())), uB = new Set(wB.map(w => w.toLowerCase()));
    const sA = { w: wA.length, c: a.content.length, l: lA.filter(l => l.trim()).length, d: wA.length ? (uA.size / wA.length * 100).toFixed(1) : 0, r: detectRepetitions(a.content).length };
    const sB = { w: wB.length, c: b.content.length, l: lB.filter(l => l.trim()).length, d: wB.length ? (uB.size / wB.length * 100).toFixed(1) : 0, r: detectRepetitions(b.content).length };

    const changes = [];
    for (let i = 0; i < maxL; i++) { const la = lA[i] || "", lb = lB[i] || ""; if (la !== lb) changes.push({ line: i, type: !la ? "added" : !lb ? "removed" : "changed" }); }

    const lc = (la, lb, side) => {
      if (side === "a") { if (la && !lb) return "#FF000022"; if (!la && lb) return "#00FF0015"; }
      else { if (lb && !la) return "#00FF0022"; if (!lb && la) return "#FF000015"; }
      if (la !== lb) return "#FFFF0018";
      return "transparent";
    };

    return (
      <div style={{ minHeight: "100vh", background: "#000", fontFamily: "Montserrat,sans-serif" }}>
        <div style={{ background: "#000", padding: "7px 8px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #222", position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => { setScreen("home"); setCompareNotes(null); }} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <h2 style={{ color: gold, fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Comparador</h2>
          <button onClick={() => { const v = createVersion(a.id); if (v) { setToast("Versión creada: " + v.title); setCompareNotes({ a: v, b }); } }} style={{ padding: "3px 8px", background: gold, border: "none", color: "#000", borderRadius: 5, fontFamily: "Montserrat,sans-serif", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>+ Versión</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #222" }}>
          <div style={{ padding: "5px 6px", borderRight: "1px solid #222" }}><span style={{ color: "#4ECDC4", fontSize: 10, fontWeight: 600 }}>{a.title}</span></div>
          <div style={{ padding: "5px 6px" }}><span style={{ color: "#FF6B6B", fontSize: 10, fontWeight: 600 }}>{b.title}</span></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", maxHeight: "35vh", overflow: "hidden" }}>
          <div ref={scrollRefA} onScroll={handleScrollA} style={{ borderRight: "1px solid #222", padding: 5, overflowY: "auto" }}>
            {Array.from({ length: maxL }).map((_, i) => <div key={i} style={{ display: "flex", fontSize: 10, background: lc(lA[i] || "", lB[i] || "", "a"), padding: "1px 3px", borderRadius: 2, marginBottom: 1 }}><span style={{ color: "#FFF", fontSize: 8, minWidth: 18, opacity: 0.3, marginRight: 2 }}>{i + 1}</span><span style={{ color: "#DDD" }}>{lA[i] || " "}</span></div>)}
          </div>
          <div ref={scrollRefB} onScroll={handleScrollB} style={{ padding: 5, overflowY: "auto" }}>
            {Array.from({ length: maxL }).map((_, i) => <div key={i} style={{ display: "flex", fontSize: 10, background: lc(lA[i] || "", lB[i] || "", "b"), padding: "1px 3px", borderRadius: 2, marginBottom: 1 }}><span style={{ color: "#FFF", fontSize: 8, minWidth: 18, opacity: 0.3, marginRight: 2 }}>{i + 1}</span><span style={{ color: "#DDD" }}>{lB[i] || " "}</span></div>)}
          </div>
        </div>

        {changes.length > 0 && (
          <div style={{ padding: "6px 8px", borderTop: "1px solid #222", borderBottom: "1px solid #222" }}>
            <h4 style={{ color: gold, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Navegación ({changes.length} cambios)</h4>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {changes.map((ch, i) => (
                <button key={i} onClick={() => { if (scrollRefA.current) scrollRefA.current.scrollTop = ch.line * 18; }} style={{ padding: "1px 6px", borderRadius: 3, border: "none", cursor: "pointer", fontSize: 9, background: ch.type === "added" ? "#00FF0033" : ch.type === "removed" ? "#FF000033" : "#FFFF0022", color: ch.type === "added" ? "#00FF00" : ch.type === "removed" ? "#FF4444" : "#FFFF00" }}>L{ch.line + 1}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 10, borderBottom: `1px solid ${gold}22` }}>
          <h4 style={{ color: gold, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Estadísticas</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 2, fontSize: 10 }}>
            {[{ l: "Palabras", a: sA.w, b: sB.w }, { l: "Caracteres", a: sA.c, b: sB.c }, { l: "Líneas", a: sA.l, b: sB.l }, { l: "Densidad", a: `${sA.d}%`, b: `${sB.d}%` }, { l: "Repeticiones", a: sA.r, b: sB.r }, { l: "Variación", a: (eA[0]?.variance || 0).toFixed(3), b: (eB[0]?.variance || 0).toFixed(3) }].map(r => (
              <Fragment key={r.l}><div style={{ color: "#4ECDC4", textAlign: "right", padding: "1px 0" }}>{r.a}</div><div style={{ color: textMuted, textAlign: "center", padding: "1px 5px" }}>{r.l}</div><div style={{ color: "#FF6B6B", padding: "1px 0" }}>{r.b}</div></Fragment>
            ))}
          </div>
        </div>

        <div style={{ padding: 10 }}>
          <h4 style={{ color: gold, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Curvas emocionales</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <div><p style={{ color: "#4ECDC4", fontSize: 9, marginBottom: 2 }}>{a.title}</p><EmotionCurve data={eA} width={180} height={120} showMarkers={false} id="ca" /></div>
            <div><p style={{ color: "#FF6B6B", fontSize: 9, marginBottom: 2 }}>{b.title}</p><EmotionCurve data={eB} width={180} height={120} showMarkers={false} id="cb" /></div>
          </div>
        </div>
      </div>
    );
  };

  // ── SETTINGS ──
  const SettingsScreen = () => (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "Montserrat,sans-serif" }}>
      <div style={{ background: "#000", padding: "7px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setScreen("home")} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
        <h2 style={{ color: gold, fontSize: 16, fontWeight: 700, margin: 0 }}>Ajustes</h2>
      </div>
      <div style={{ padding: 14 }}>
        {[{ l: "Tema oscuro", v: darkMode, o: () => setDarkMode(d => !d) }, { l: "Modo enfoque permanente", v: focusPermanent, o: () => setFocusPermanent(f => !f) }].map(i => (
          <div key={i.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${borderColor}` }}>
            <span style={{ color: textColor, fontSize: 14 }}>{i.l}</span>
            <button onClick={i.o} style={{ width: 46, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: i.v ? gold : "#777" }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: "#FFF", position: "absolute", top: 3, left: i.v ? 25 : 3, transition: "left 0.2s" }} /></button>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${borderColor}` }}>
          <span style={{ color: textColor, fontSize: 14 }}>Tamaño texto: {fontSize}pt</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setFontSize(s => Math.max(12, s - 2))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${gold}`, background: "transparent", color: gold, fontSize: 16, cursor: "pointer" }}>−</button>
            <button onClick={() => setFontSize(s => Math.min(24, s + 2))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${gold}`, background: "transparent", color: gold, fontSize: 16, cursor: "pointer" }}>+</button>
          </div>
        </div>
        <button onClick={() => setScreen("guide")} style={{ width: "100%", marginTop: 16, padding: 11, borderRadius: 10, border: `1px solid ${gold}`, background: "transparent", color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Ver guía completa</button>
        <button onClick={() => { setTutorialDismissed(false); setShowTutorial(true); setTutorialStep(0); }} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #444", background: "transparent", color: textMuted, fontFamily: "Montserrat,sans-serif", fontSize: 13, cursor: "pointer" }}>Repetir tutorial</button>
      </div>
    </div>
  );

  // ── GUIDE ──
  const GuideScreen = () => {
    const tabs = [
      { id: "general", label: "General" },
      { id: "emocional", label: "Análisis emocional" },
    ];
    const cardStyle = { marginBottom: 14, padding: 12, background: "#1a1a1a", borderRadius: 8, borderLeft: `3px solid ${gold}` };
    const titleStyle = { margin: "0 0 5px", fontSize: 12, fontWeight: 700, color: gold };
    const textStyle = { margin: 0, color: "#CCC", fontSize: 11, lineHeight: 1.6 };
    const subStyle = { margin: "8px 0 4px", fontSize: 11, fontWeight: 600, color: goldBright };
    const detailStyle = { margin: "0 0 6px", color: "#AAA", fontSize: 10, lineHeight: 1.55 };
    const metricCard = (color, label, desc) => (
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 3, flexShrink: 0 }} />
        <div><span style={{ color: "#E0E0E0", fontSize: 11, fontWeight: 600 }}>{label}:</span> <span style={{ color: "#AAA", fontSize: 10 }}>{desc}</span></div>
      </div>
    );

    return (
      <div style={{ minHeight: "100vh", background: "#111", fontFamily: "Montserrat,sans-serif", color: gold }}>
        <div style={{ background: "#000", padding: "7px 8px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setScreen("settings")} style={bs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <h2 style={{ color: gold, fontSize: 16, fontWeight: 700, margin: 0 }}>Guía completa</h2>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid #333`, background: "#0a0a0a" }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setGuideTab(tab.id)} style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
              background: guideTab === tab.id ? "#1a1a1a" : "transparent",
              color: guideTab === tab.id ? gold : "#666",
              fontFamily: "Montserrat,sans-serif", fontSize: 12, fontWeight: guideTab === tab.id ? 700 : 400,
              borderBottom: guideTab === tab.id ? `2px solid ${gold}` : "2px solid transparent",
              transition: "all 0.2s"
            }}>{tab.label}</button>
          ))}
        </div>

        <div style={{ padding: 14, lineHeight: 1.7, fontSize: 12 }}>

          {/* ── GENERAL TAB ── */}
          {guideTab === "general" && (<>
            {[
              { t: "Crear notas", d: "Pulsa el botón + dorado en la parte inferior para crear un nuevo poema o una letra de canción. Un panel modal te deja elegir entre ambos tipos." },
              { t: "Letras de canción", d: "Usa las etiquetas estructurales [Intro], [Verso], [Pre-estribillo], [Estribillo], [Puente] y [Outro]. Se insertan automáticamente y el cursor se coloca debajo. Los bloques repetidos se detectan y resaltan en dorado claro." },
              { t: "Poesía", d: "Selecciona entre 7 tipos: Cuarteto, Lira, Soneto, Romance, Redondilla, Décima o Verso libre. Cada tipo carga su esquema métrico. El contador de sílabas aparece a la izquierda (rojo = exceso) y el control de rima a la derecha (verde = correcta, naranja = advertencia, rojo = incumplida). Puedes ignorar las advertencias." },
              { t: "Panel técnico", d: "Flecha dorada en la esquina superior derecha. Muestra: palabras, caracteres, líneas, palabras únicas, densidad léxica, contador de sílabas por verso (con total y media), resaltado de repeticiones, detector de clichés y análisis métrico completo para poesía." },
              { t: "Modo flujo", d: "Oculta el panel técnico y la bola emocional. Activa un temporizador visible y editable (pulsa el lápiz para ajustar minutos y segundos). Puedes compartir y salir de la nota sin restricciones." },
              { t: "Modo enfoque", d: "Mantén pulsado el título de la nota 2-3 segundos. Solo se muestran: compartir, guardar, salir, deshacer, rehacer y crear versión. Se puede activar permanentemente en Ajustes." },
              { t: "Comparador de versiones", d: "Selecciona 2 notas (mantén pulsado para activar selección múltiple) y pulsa Comparar. Vista dividida con scroll sincronizado, resaltado de diferencias (verde = añadido, rojo = eliminado, amarillo = cambio parcial), panel de navegación de cambios, estadísticas comparativas y doble curva emocional." },
              { t: "Versiones", d: "Crea versiones desde el icono del reloj en el editor, desde selección múltiple o desde el botón + Versión del comparador. Los nombres son limpios y secuenciales (v1, v2, v3…)." },
              { t: "Compartir", d: "Icono de compartir en el editor para nota individual, o botón Compartir en selección múltiple para enviar varias notas a la vez." },
            ].map((s, i) => (
              <div key={i} style={cardStyle}>
                <h4 style={titleStyle}>{s.t}</h4>
                <p style={textStyle}>{s.d}</p>
              </div>
            ))}
          </>)}

          {/* ── EMOTIONAL ANALYSIS TAB ── */}
          {guideTab === "emocional" && (<>
            {/* Overview */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>¿Qué es el análisis emocional?</h4>
              <p style={textStyle}>
                El análisis emocional examina tu texto automáticamente y genera una visualización del arco emocional de tu obra. Detecta palabras clave asociadas a seis emociones fundamentales y calcula métricas que te ayudan a entender la estructura emocional de lo que escribes. Se accede pulsando la bola dorada flotante en la esquina inferior izquierda del editor.
              </p>
            </div>

            {/* How it splits blocks */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Detección automática de bloques</h4>
              <p style={textStyle}>
                El sistema divide tu texto en bloques para analizar cada sección por separado:
              </p>
              <p style={subStyle}>En letras de canción</p>
              <p style={detailStyle}>Detecta las etiquetas [Intro], [Verso], [Estribillo], [Pre-estribillo], [Puente] y [Outro]. Cada sección etiquetada se convierte en un bloque independiente con su nombre visible en la curva.</p>
              <p style={subStyle}>En poesía</p>
              <p style={detailStyle}>Separa bloques por párrafos (doble salto de línea). Si no hay párrafos, agrupa cada 4 versos automáticamente. Si el texto es muy corto, agrupa cada 2 versos. Así siempre se genera una curva útil.</p>
            </div>

            {/* The 6 emotions */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Las 6 emociones detectadas</h4>
              <p style={{ ...detailStyle, marginBottom: 10 }}>Cada bloque se analiza buscando palabras clave asociadas a estas emociones. La emoción con más coincidencias se muestra como la «dominante» del bloque:</p>
              {metricCard("#FFD700", "Alegría (joy)", "Palabras como amor, luz, sol, vida, feliz, alegría, sonrisa, brillo, sueño, libre, cálido, dulce.")}
              {metricCard("#E74C3C", "Tristeza (sadness)", "Palabras como llorar, dolor, triste, oscuro, sombra, soledad, vacío, perdido, muerte, silencio, ausencia, olvido.")}
              {metricCard("#FF6B6B", "Ira (anger)", "Palabras como furia, rabia, odio, grito, fuego, destruir, romper, sangre, golpe, quemar.")}
              {metricCard("#9B59B6", "Miedo (fear)", "Palabras como miedo, terror, temblar, ansiedad, pánico, huir, abismo, caer.")}
              {metricCard("#FF69B4", "Amor (love)", "Palabras como amor, beso, abrazo, corazón, cariño, quiero, ternura, piel, labio, suspiro.")}
              {metricCard("#4ECDC4", "Esperanza (hope)", "Palabras como esperar, mañana, renacer, nuevo, camino, horizonte, amanecer, sembrar, crecer.")}
            </div>

            {/* The narrative curve */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>La curva narrativa</h4>
              <p style={textStyle}>
                La curva dorada es el elemento central del análisis. El eje horizontal representa los bloques de tu texto (de izquierda a derecha), y el eje vertical muestra la intensidad emocional de cada bloque (de 0.0 a 1.0). La curva suave conecta los puntos con transiciones bezier para que visualices el flujo emocional de tu obra de un vistazo.
              </p>
              <p style={subStyle}>Línea de media (avg)</p>
              <p style={detailStyle}>Una línea punteada horizontal marca el nivel medio de intensidad emocional de toda la obra. Te ayuda a ver qué bloques están por encima o por debajo del promedio.</p>
              <p style={subStyle}>Relleno de área</p>
              <p style={detailStyle}>El degradado dorado bajo la curva te da una sensación visual inmediata de la «masa emocional» del texto — cuánta energía concentra tu obra en cada zona.</p>
            </div>

            {/* The 3 markers */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Marcadores automáticos</h4>
              <p style={{ ...detailStyle, marginBottom: 10 }}>El sistema identifica y marca automáticamente tres puntos clave en la curva:</p>
              {metricCard("#FF6B6B", "CLÍMAX (rojo)", "El bloque con mayor intensidad emocional. Es el punto álgido de tu texto, donde la carga emocional es máxima. Se muestra con un círculo rojo grande y una etiqueta roja.")}
              {metricCard("#4ECDC4", "DÉBIL (turquesa)", "El bloque con menor intensidad emocional. Puede indicar un momento de calma intencionada o una zona que necesita más fuerza expresiva. Círculo turquesa con etiqueta.")}
              {metricCard("#FF9F43", "TENSIÓN (naranja)", "El bloque con mayor tensión narrativa, calculada a partir de las emociones de ira, miedo y tristeza combinadas. Si coincide con el clímax, no se muestra por separado. Círculo naranja con etiqueta inferior.")}
            </div>

            {/* The 6 metrics */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Métricas numéricas</h4>
              <p style={{ ...detailStyle, marginBottom: 10 }}>Debajo de la curva se muestran seis métricas calculadas sobre el conjunto de la obra:</p>
              {metricCard(goldBright, "Intensidad media", "El promedio de intensidad emocional de todos los bloques. Un valor alto indica un texto emocionalmente denso; un valor bajo puede indicar un tono más contenido o neutro.")}
              {metricCard("#FF6B6B", "Pico máximo", "El valor de intensidad del bloque más intenso (el clímax). Te dice cuánto llega a subir la carga emocional.")}
              {metricCard("#4ECDC4", "Punto débil", "El valor de intensidad del bloque menos intenso. Si es muy bajo (cercano a 0), puede haber una zona que «se apaga» emocionalmente.")}
              {metricCard(gold, "Estabilidad", "Porcentaje de 0% a 100%. Mide cuánto varían las intensidades entre bloques. 100% = todos los bloques tienen la misma intensidad (texto plano). Valores bajos = emociones muy cambiantes con subidas y bajadas fuertes.")}
              {metricCard(gold, "Ritmo", "La media de los saltos de intensidad entre bloques consecutivos. Un ritmo alto indica cambios emocionales bruscos entre secciones; un ritmo bajo indica transiciones suaves y graduales.")}
              {metricCard(gold, "Bloques", "El número total de bloques analizados. En canciones coincide con las secciones etiquetadas; en poesía depende de los párrafos o agrupaciones automáticas.")}
            </div>

            {/* Detail per block */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>Detalle por bloque</h4>
              <p style={textStyle}>
                Debajo de las métricas, cada bloque se lista individualmente con:
              </p>
              <p style={subStyle}>Barra de intensidad</p>
              <p style={detailStyle}>Una barra dorada proporcional a la intensidad del bloque. Te permite comparar visualmente la carga emocional de cada sección.</p>
              <p style={subStyle}>Emoción dominante</p>
              <p style={detailStyle}>El nombre de la emoción más fuerte en ese bloque (joy, sadness, love, etc.), mostrado en dorado.</p>
              <p style={subStyle}>T: Tensión narrativa</p>
              <p style={detailStyle}>Valor de 0 a 1 mostrado en naranja. Combina las emociones de ira + miedo + tristeza. Un valor alto indica un momento de alta tensión dramática. Útil para identificar momentos de conflicto o drama en tu texto.</p>
              <p style={subStyle}>A: Carga afectiva</p>
              <p style={detailStyle}>Valor de 0 a 1 mostrado en turquesa. Combina amor + alegría + esperanza. Un valor alto indica un momento de alta carga positiva/afectiva. Útil para detectar las zonas más luminosas o tiernas de tu obra.</p>
            </div>

            {/* In comparator */}
            <div style={cardStyle}>
              <h4 style={titleStyle}>En el comparador de versiones</h4>
              <p style={textStyle}>
                Cuando comparas dos notas, el análisis emocional genera una doble curva narrativa: una para cada versión, lado a lado. Esto te permite ver cómo ha cambiado el arco emocional entre versiones. La variación emocional de cada versión también aparece en las estadísticas comparativas, para que veas de un vistazo si una versión tiene más movimiento emocional que otra.
              </p>
            </div>

            {/* Tips */}
            <div style={{ ...cardStyle, borderLeftColor: "#4ECDC4" }}>
              <h4 style={{ ...titleStyle, color: "#4ECDC4" }}>Consejos de uso</h4>
              <p style={detailStyle}>• Si la curva es completamente plana, intenta variar la intensidad emocional entre secciones para crear un arco narrativo más interesante.</p>
              <p style={detailStyle}>• Si el punto DÉBIL coincide con una sección importante (como un estribillo), puede ser señal de que esa sección necesita más fuerza expresiva.</p>
              <p style={detailStyle}>• Una estabilidad muy alta (90-100%) puede indicar monotonía emocional. Un buen arco narrativo suele tener entre 30% y 70% de estabilidad.</p>
              <p style={detailStyle}>• En canciones, compara la tensión (T) del verso con la del estribillo: generalmente el estribillo debería tener más intensidad o más carga afectiva (A).</p>
              <p style={detailStyle}>• El análisis se actualiza en tiempo real mientras escribes, lo que te permite ver inmediatamente cómo cada palabra afecta al arco emocional.</p>
            </div>
          </>)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden", minHeight: "100vh", background: bg }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{margin:0;background:#000;overflow-x:hidden}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#D4AF3744;border-radius:2px}textarea::placeholder,input::placeholder{color:#555}@keyframes fadeInToast{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {TutorialOverlay()}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#1a1a0a", border: `1px solid ${gold}`, borderRadius: 10, padding: "10px 20px", zIndex: 9998, color: gold, fontFamily: "Montserrat,sans-serif", fontSize: 13, fontWeight: 600, boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 10px ${gold}22`, animation: "fadeInToast 0.3s ease" }}>
          {toast}
        </div>
      )}
      {screen === "home" && HomeScreen()}
      {screen === "editor" && EditorScreen()}
      {screen === "settings" && SettingsScreen()}
      {screen === "guide" && GuideScreen()}
      {screen === "compare" && CompareScreen()}
    </div>
  );
}
