import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import campusMap from "@/assets/campus-map.png";
import buildingsData from "@/data/buildings.json";

export const Route = createFileRoute("/")({
  component: Index,
  ssr: false,
  head: () => ({
    meta: [
      { title: "BOILRDLE — Purdue Building Globle" },
      {
        name: "description",
        content:
          "A Globle-style guessing game for Purdue University buildings. Find the mystery building in as few guesses as possible.",
      },
    ],
  }),
});

// =========================================================================
// Data
// =========================================================================
type Building = { abbr: string; name: string; x: number; y: number };
const BUILDINGS: Building[] = buildingsData as Building[];
const BY_ABBR = new Map(BUILDINGS.map((b) => [b.abbr, b]));

// Map source: page 2 of Purdue's campusmap.pdf (612 x 792 PDF points)
const MAP_W = 612;
const MAP_H = 792;
// PDF point -> meter conversion (campus map scale, approximate)
const PT_TO_M = 4;

const dist = (a: Building, b: Building) =>
  Math.hypot(a.x - b.x, a.y - b.y) * PT_TO_M;
const fmtMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

const colorForDistance = (d: number, isMystery: boolean): string => {
  if (isMystery) return "#a8160b";
  if (d < 75) return "#c41e10";
  if (d < 175) return "#dd4422";
  if (d < 325) return "#ec7a35";
  if (d < 525) return "#f3a854";
  if (d < 800) return "#f5cc7a";
  if (d < 1200) return "#f6e2a8";
  return "#f6ecd1";
};

// =========================================================================
// Game master persistence + share codes
// =========================================================================
const LS_KEY = "boilrdle.gm.levels.v1";
const encodeCode = (abbrs: string[]) =>
  btoa(abbrs.join("|")).replace(/=+$/, "");
const decodeCode = (code: string): string[] => {
  try {
    const pad = code + "=".repeat((4 - (code.length % 4)) % 4);
    return atob(pad)
      .split("|")
      .map((s) => s.trim())
      .filter((a) => BY_ABBR.has(a));
  } catch {
    return [];
  }
};

// =========================================================================
// Component
// =========================================================================
type Guess = { abbr: string; name: string; d: number };
type Mode = "single" | "gm";

function pickRandom(exclude?: string): Building {
  const pool = BUILDINGS.filter((b) => b.abbr !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function Index() {
  const [mode, setMode] = useState<Mode>("single");
  const [levels, setLevels] = useState<string[]>([]); // abbrs, GM mode
  const [levelIdx, setLevelIdx] = useState(0);
  const [mystery, setMystery] = useState<Building | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [input, setInput] = useState("");
  const [acHi, setAcHi] = useState(0);
  const [won, setWon] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [gmOpen, setGmOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // initial mystery
  useEffect(() => {
    if (!mystery) setMystery(pickRandom());
  }, [mystery]);

  // load saved GM levels
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setLevels(arr.filter((a) => BY_ABBR.has(a)));
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(levels));
    } catch {}
  }, [levels]);

  const guessedAbbrs = useMemo(
    () => new Set(guesses.map((g) => g.abbr)),
    [guesses],
  );
  const guessByAbbr = useMemo(() => {
    const m = new Map<string, Guess>();
    guesses.forEach((g) => m.set(g.abbr, g));
    return m;
  }, [guesses]);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [] as Building[];
    return BUILDINGS.filter(
      (b) =>
        !guessedAbbrs.has(b.abbr) &&
        (b.name.toLowerCase().includes(q) ||
          b.abbr.toLowerCase().startsWith(q)),
    ).slice(0, 8);
  }, [input, guessedAbbrs]);

  useEffect(() => setAcHi(0), [input]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const submitGuess = (b: Building) => {
    if (!mystery || won) return;
    if (guessedAbbrs.has(b.abbr)) {
      showToast("Already guessed");
      return;
    }
    const d = dist(b, mystery);
    setGuesses((prev) => [{ abbr: b.abbr, name: b.name, d }, ...prev]);
    setInput("");
    if (b.abbr === mystery.abbr) setWon(true);
  };

  const tryGuessFromInput = () => {
    if (suggestions.length > 0) {
      submitGuess(suggestions[acHi] ?? suggestions[0]);
      return;
    }
    const q = input.trim().toLowerCase();
    const exact = BUILDINGS.find(
      (b) => b.name.toLowerCase() === q || b.abbr.toLowerCase() === q,
    );
    if (exact) submitGuess(exact);
    else showToast("Unknown building");
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAcHi((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAcHi((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      tryGuessFromInput();
    }
  };

  const newSingle = () => {
    setMode("single");
    setMystery(pickRandom(mystery?.abbr));
    setGuesses([]);
    setInput("");
    setWon(false);
    inputRef.current?.focus();
  };

  const startGM = (abbrs: string[]) => {
    if (abbrs.length === 0) {
      showToast("Add at least one building");
      return;
    }
    setMode("gm");
    setLevels(abbrs);
    setLevelIdx(0);
    setMystery(BY_ABBR.get(abbrs[0])!);
    setGuesses([]);
    setInput("");
    setWon(false);
    setGmOpen(false);
  };

  const nextGMLevel = () => {
    if (mode !== "gm") return;
    const next = levelIdx + 1;
    if (next >= levels.length) {
      showToast("Round complete!");
      newSingle();
      return;
    }
    setLevelIdx(next);
    setMystery(BY_ABBR.get(levels[next])!);
    setGuesses([]);
    setInput("");
    setWon(false);
  };

  const closest = guesses.reduce<Guess | null>(
    (acc, g) => (!acc || g.d < acc.d ? g : acc),
    null,
  );

  return (
    <div className="boilrdle">
      <style>{CSS}</style>
      <div className="wrap">
        <header>
          <div className="kicker">Hail Purdue · Wayfinding Edition</div>
          <h1>
            BOILR<span className="x">DLE</span>
          </h1>
          <p className="sub">
            Use your knowledge of Purdue's campus to find the{" "}
            <b>Mystery Building</b> in as few guesses as possible. Each guess
            lights up its footprint on the official campus map — the redder it
            glows, the closer you are.
          </p>
          <div className="topbar">
            <button className="btn ghost sm" onClick={newSingle}>
              ↻ New random building
            </button>
            <button className="btn sm" onClick={() => setGmOpen(true)}>
              🎓 Game Master setup
            </button>
          </div>
        </header>

        <div className="layout">
          {/* MAP */}
          <div className="card mapcard">
            <div className="maphd">
              <div className="t">
                {mode === "gm"
                  ? `Game Master · Level ${levelIdx + 1} of ${levels.length}`
                  : "West Lafayette Campus"}
              </div>
              <div className="legend">
                <span>Farther</span>
                <span className="bar" />
                <span>Closer</span>
              </div>
            </div>
            <div className="mapbox">
              <svg
                viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="map"
              >
                <image
                  href={campusMap}
                  x={0}
                  y={0}
                  width={MAP_W}
                  height={MAP_H}
                />
                {BUILDINGS.map((b) => {
                  const g = guessByAbbr.get(b.abbr);
                  const isMyst = won && mystery?.abbr === b.abbr;
                  if (!g && !isMyst) return null;
                  const fill = g
                    ? colorForDistance(g.d, isMyst)
                    : colorForDistance(0, true);
                  return (
                    <g key={b.abbr}>
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={isMyst ? 16 : 12}
                        fill={fill}
                        fillOpacity={isMyst ? 0.85 : 0.65}
                        stroke={isMyst ? "#7a0f08" : "#3b2a0d"}
                        strokeWidth={isMyst ? 2.2 : 1}
                        className={isMyst ? "win" : ""}
                      >
                        <title>
                          {b.name} ({b.abbr})
                          {g ? ` — ${fmtMeters(g.d)}` : ""}
                        </title>
                      </circle>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* PANEL */}
          <div className="card panel">
            <div className="levbar">
              <div className="lv">
                {mode === "gm" ? "Game Master Round" : "Single Building"}
              </div>
              {mode === "gm" && (
                <div className="dots">
                  {levels.map((_, i) => (
                    <i
                      key={i}
                      className={
                        i < levelIdx ? "done" : i === levelIdx ? "cur" : ""
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="inputrow">
              <div className="guessbox">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    won
                      ? mode === "gm" && levelIdx < levels.length - 1
                        ? "Found it — continue to next level →"
                        : "You found it! Start a new game →"
                      : "Type a building name or abbr…"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  disabled={won}
                  autoComplete="off"
                />
                <button
                  className="btn"
                  onClick={tryGuessFromInput}
                  disabled={won}
                >
                  Guess
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="ac">
                  {suggestions.map((s, i) => (
                    <div
                      key={s.abbr}
                      className={i === acHi ? "hi" : ""}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        submitGuess(s);
                      }}
                      onMouseEnter={() => setAcHi(i)}
                    >
                      <span className="ab">{s.abbr}</span>
                      <span className="nm">{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="meta">
              <div className="stat">
                <div className="v">{guesses.length}</div>
                <div className="k">Guesses</div>
              </div>
              <div className="stat">
                <div className="v">
                  {closest ? fmtMeters(closest.d) : "—"}
                </div>
                <div className="k">Closest</div>
              </div>
              <div className="stat">
                <div className="v">{BUILDINGS.length}</div>
                <div className="k">Buildings</div>
              </div>
            </div>

            {won && (
              <div className="banner good">
                <h2>Boiler Up!</h2>
                <p>
                  You found <b>{mystery?.name}</b> in <b>{guesses.length}</b>{" "}
                  {guesses.length === 1 ? "guess" : "guesses"}.
                </p>
                <div className="row">
                  {mode === "gm" && levelIdx < levels.length - 1 ? (
                    <button className="btn" onClick={nextGMLevel}>
                      Next level ▸
                    </button>
                  ) : (
                    <button className="btn" onClick={newSingle}>
                      Play again ↻
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="guesses">
              {guesses.length === 0 && (
                <div className="empty">
                  No guesses yet. Try a building you know.
                </div>
              )}
              {[...guesses].sort((a, b) => a.d - b.d).map((g) => {
                const isWin = g.abbr === mystery?.abbr && won;
                return (
                  <div
                    key={g.abbr}
                    className={`grow ${closest?.abbr === g.abbr ? "closest" : ""}`}
                  >
                    <div
                      className="sw"
                      style={{ background: colorForDistance(g.d, isWin) }}
                    />
                    <div>
                      <div className="ab">
                        {g.abbr}
                        <span>{g.name}</span>
                      </div>
                    </div>
                    <div className="km">
                      {isWin ? "★ FOUND" : fmtMeters(g.d)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <footer>
          A fan-made parody of Globle · building positions from the public{" "}
          <a
            href="https://www.purdue.edu/campus-map/graphics/campusmap.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Purdue campus map
          </a>
          .
          <br />
          Not affiliated with or endorsed by Purdue University or Globle.
          Distances are approximate.
        </footer>
      </div>

      {toast && <div className="toast show">{toast}</div>}

      {gmOpen && (
        <GameMasterModal
          onClose={() => setGmOpen(false)}
          onStart={startGM}
          initial={levels}
        />
      )}
    </div>
  );
}

// =========================================================================
// Game Master modal
// =========================================================================
function GameMasterModal({
  onClose,
  onStart,
  initial,
}: {
  onClose: () => void;
  onStart: (abbrs: string[]) => void;
  initial: string[];
}) {
  const [list, setList] = useState<string[]>(initial);
  const [pick, setPick] = useState("");
  const [pickHi, setPickHi] = useState(0);
  const [loadCode, setLoadCode] = useState("");

  const suggestions = useMemo(() => {
    const q = pick.trim().toLowerCase();
    if (!q) return [] as Building[];
    return BUILDINGS.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.abbr.toLowerCase().startsWith(q),
    ).slice(0, 8);
  }, [pick]);

  const add = (b: Building) => {
    setList((prev) => [...prev, b.abbr]);
    setPick("");
  };

  const addRandom = (n: number) => {
    const avail = BUILDINGS.filter((b) => !list.includes(b.abbr));
    const out: string[] = [];
    for (let i = 0; i < n && avail.length; i++) {
      const idx = Math.floor(Math.random() * avail.length);
      out.push(avail.splice(idx, 1)[0].abbr);
    }
    setList((prev) => [...prev, ...out]);
  };

  const code = encodeCode(list);
  const onLoad = () => {
    const arr = decodeCode(loadCode.trim());
    if (arr.length === 0) return;
    onStart(arr);
  };

  return (
    <div className="overlay show" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          🎓 Game <span className="x">Master</span>
        </h3>
        <p className="lead">
          Build a custom round. Players solve each building in order. Share
          the code so everyone plays the same set.
        </p>

        <label>Add a building as the next level</label>
        <div className="inputrow">
          <div className="guessbox">
            <input
              type="text"
              placeholder="Type building name or abbr…"
              value={pick}
              onChange={(e) => {
                setPick(e.target.value);
                setPickHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setPickHi((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setPickHi((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter" && suggestions.length) {
                  e.preventDefault();
                  add(suggestions[pickHi] ?? suggestions[0]);
                }
              }}
              autoComplete="off"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="ac">
              {suggestions.map((s, i) => (
                <div
                  key={s.abbr}
                  className={i === pickHi ? "hi" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s);
                  }}
                  onMouseEnter={() => setPickHi(i)}
                >
                  <span className="ab">{s.abbr}</span>
                  <span className="nm">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tools">
          <button className="btn ghost sm" onClick={() => addRandom(5)}>
            🎲 Add 5 random
          </button>
          <button
            className="btn ghost sm"
            onClick={() => setList([])}
            disabled={list.length === 0}
          >
            Clear all
          </button>
        </div>

        <label>Levels ({list.length})</label>
        <div className="levels">
          {list.length === 0 && (
            <div className="empty">No levels yet. Add a building above.</div>
          )}
          {list.map((abbr, i) => {
            const b = BY_ABBR.get(abbr)!;
            return (
              <div key={`${abbr}-${i}`} className="lrow">
                <div className="n">{i + 1}</div>
                <div className="meta2">
                  <b>{b.abbr}</b>
                  <small>{b.name}</small>
                </div>
                <div className="ctl">
                  <button
                    className="iconbtn"
                    onClick={() =>
                      setList((p) => {
                        if (i === 0) return p;
                        const c = [...p];
                        [c[i - 1], c[i]] = [c[i], c[i - 1]];
                        return c;
                      })
                    }
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="iconbtn"
                    onClick={() =>
                      setList((p) => {
                        if (i === p.length - 1) return p;
                        const c = [...p];
                        [c[i], c[i + 1]] = [c[i + 1], c[i]];
                        return c;
                      })
                    }
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="iconbtn"
                    onClick={() =>
                      setList((p) => p.filter((_, j) => j !== i))
                    }
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {list.length > 0 && (
          <>
            <label>Share code</label>
            <input
              className="share-in"
              readOnly
              value={code}
              onFocus={(e) => e.currentTarget.select()}
            />
          </>
        )}

        <label>Load a code</label>
        <div className="guessbox">
          <input
            type="text"
            placeholder="Paste a code…"
            value={loadCode}
            onChange={(e) => setLoadCode(e.target.value)}
          />
          <button className="btn" onClick={onLoad}>
            Load
          </button>
        </div>

        <div className="modalfoot">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => onStart(list)}
            disabled={list.length === 0}
          >
            Start game ▸
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.boilrdle{
  --bg:#f1efe8; --surface:#ffffff; --ink:#191712; --mut:#736d5f; --line:#dcd6c8;
  --gold:#8a6d1f; --gold2:#CEB888; --rush:#C29A12; --black:#0d0d0d;
  font-family:'Outfit',ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--bg);
  min-height:100vh;
}
.boilrdle *{box-sizing:border-box}
.boilrdle .wrap{max-width:1280px;margin:0 auto;padding:24px 18px 56px}
.boilrdle header{text-align:center;margin-bottom:8px}
.boilrdle .kicker{font-family:'Space Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.3em;color:var(--gold);text-transform:uppercase;margin-bottom:6px}
.boilrdle h1{font-family:'Bungee',ui-sans-serif,sans-serif;font-size:clamp(38px,8vw,68px);line-height:.9;color:var(--black);letter-spacing:.01em}
.boilrdle h1 .x{color:var(--rush)}
.boilrdle .sub{color:var(--mut);font-size:14px;margin:10px auto 0;max-width:600px;line-height:1.5}
.boilrdle .sub b{color:var(--ink)}
.boilrdle .topbar{display:flex;gap:8px;justify-content:center;margin:14px 0 4px;flex-wrap:wrap}
.boilrdle .btn{font-family:'Outfit';font-weight:800;font-size:13.5px;border:none;cursor:pointer;border-radius:11px;
  padding:11px 16px;background:var(--black);color:var(--gold2);transition:transform .08s,filter .15s}
.boilrdle .btn:hover{filter:brightness(1.15)} .boilrdle .btn:active{transform:translateY(1px)}
.boilrdle .btn:disabled{opacity:.4;cursor:not-allowed}
.boilrdle .btn.ghost{background:var(--surface);border:1.5px solid var(--line);color:var(--mut)}
.boilrdle .btn.ghost:hover{border-color:var(--gold);color:var(--gold);filter:none}
.boilrdle .btn.sm{padding:8px 12px;font-size:12px;border-radius:9px}
.boilrdle .layout{display:grid;grid-template-columns:1.4fr .8fr;gap:16px;align-items:start;margin-top:16px}
@media(max-width:920px){.boilrdle .layout{grid-template-columns:1fr}}
.boilrdle .card{background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 40px -28px rgba(70,55,15,.4)}
.boilrdle .mapcard{padding:13px}
.boilrdle .maphd{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 11px;gap:10px}
.boilrdle .maphd .t{font-family:'Space Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.16em;color:var(--mut);text-transform:uppercase}
.boilrdle .legend{display:flex;align-items:center;gap:7px;font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em}
.boilrdle .bar{width:104px;height:10px;border-radius:6px;background:linear-gradient(90deg,#f6ecd1,#f5cc7a,#ec7a35,#c41e10)}
.boilrdle .mapbox{border-radius:12px;overflow:hidden;background:#f6f3ea;max-height:80vh;display:flex;justify-content:center}
.boilrdle svg.map{width:100%;height:auto;display:block;max-height:80vh}
.boilrdle circle.win{animation:flash 1.3s ease-in-out infinite}
@keyframes flash{0%,100%{opacity:1}50%{opacity:.55}}
.boilrdle .panel{padding:16px}
.boilrdle .levbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.boilrdle .levbar .lv{font-family:'Space Mono',ui-monospace,monospace;font-weight:700;font-size:12px;color:var(--gold);letter-spacing:.08em;text-transform:uppercase}
.boilrdle .dots{display:flex;gap:5px;flex-wrap:wrap}
.boilrdle .dots i{width:9px;height:9px;border-radius:50%;background:var(--line);display:inline-block}
.boilrdle .dots i.done{background:var(--rush)} .boilrdle .dots i.cur{background:var(--ink);box-shadow:0 0 0 3px rgba(194,154,18,.2)}
.boilrdle .inputrow{position:relative}
.boilrdle .guessbox{display:flex;gap:8px}
.boilrdle input[type=text]{flex:1;background:#fbfaf6;border:1.5px solid var(--line);color:var(--ink);font-family:'Outfit';font-size:15px;font-weight:600;padding:13px 14px;border-radius:12px;outline:none;width:100%}
.boilrdle input[type=text]:focus{border-color:var(--rush);box-shadow:0 0 0 3px rgba(194,154,18,.14)}
.boilrdle input::placeholder{color:#aaa28d}
.boilrdle .ac{position:absolute;z-index:30;left:0;right:0;top:54px;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;max-height:262px;overflow-y:auto;box-shadow:0 18px 38px -14px rgba(0,0,0,.25)}
.boilrdle .ac div{padding:10px 13px;cursor:pointer;border-bottom:1px solid #f0ece1;display:flex;gap:10px;align-items:baseline}
.boilrdle .ac div:last-child{border-bottom:none}
.boilrdle .ac div:hover,.boilrdle .ac div.hi{background:#faf3df}
.boilrdle .ac .ab{font-family:'Space Mono',ui-monospace,monospace;font-weight:700;color:var(--gold);font-size:12px;min-width:56px}
.boilrdle .ac .nm{font-size:13px}
.boilrdle .meta{display:flex;gap:10px;margin:13px 0 2px}
.boilrdle .stat{flex:1;background:#fbfaf6;border:1px solid var(--line);border-radius:12px;padding:9px 12px;text-align:center}
.boilrdle .stat .v{font-family:'Bungee',ui-sans-serif,sans-serif;font-size:18px;color:var(--gold);line-height:1}
.boilrdle .stat .k{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);margin-top:5px}
.boilrdle .guesses{margin-top:11px;display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;padding-right:2px}
.boilrdle .grow{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;background:#fbfaf6;border:1px solid var(--line);border-radius:11px;padding:9px 12px}
.boilrdle .grow.closest{border-color:var(--rush);background:#fdf6e3}
.boilrdle .sw{width:17px;height:17px;border-radius:5px;border:1px solid rgba(0,0,0,.18)}
.boilrdle .grow .ab{font-family:'Space Mono',ui-monospace,monospace;font-weight:700;font-size:13px;color:var(--ink)}
.boilrdle .grow .ab span{display:block;font-size:10.5px;color:var(--mut);font-family:'Outfit';font-weight:600;margin-top:2px}
.boilrdle .grow .km{font-family:'Space Mono',ui-monospace,monospace;font-weight:700;font-size:13px;text-align:right;white-space:nowrap;color:var(--ink)}
.boilrdle .banner{margin-top:13px;border-radius:14px;padding:15px;text-align:center}
.boilrdle .banner.good{background:linear-gradient(180deg,#fff7df,#fdeec0);border:1.5px solid var(--rush)}
.boilrdle .banner h2{font-family:'Bungee',sans-serif;font-size:22px;color:var(--gold);margin-bottom:3px}
.boilrdle .banner p{font-size:13.5px;line-height:1.5}
.boilrdle .banner .row{display:flex;gap:8px;justify-content:center;margin-top:11px;flex-wrap:wrap}
.boilrdle .empty{color:var(--mut);font-size:13px;text-align:center;padding:18px;border:1px dashed var(--line);border-radius:10px}
.boilrdle footer{text-align:center;margin-top:26px;color:#a59d88;font-family:'Space Mono',ui-monospace,monospace;font-size:10.5px;line-height:1.7}
.boilrdle footer a{color:var(--gold)}
.boilrdle .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--black);color:var(--gold2);font-weight:800;padding:12px 20px;border-radius:12px;pointer-events:none;z-index:99;font-size:14px}

.boilrdle .overlay{position:fixed;inset:0;background:rgba(25,20,8,.55);backdrop-filter:blur(3px);z-index:80;display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;overflow-y:auto}
.boilrdle .modal{background:var(--surface);border:1px solid var(--line);border-radius:20px;max-width:560px;width:100%;padding:22px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5)}
.boilrdle .modal h3{font-family:'Bungee';font-size:22px;color:var(--black);margin-bottom:4px}
.boilrdle .modal h3 .x{color:var(--rush)}
.boilrdle .modal .lead{color:var(--mut);font-size:13px;margin-bottom:16px;line-height:1.45}
.boilrdle .modal label{font-family:'Space Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);display:block;margin:14px 0 6px}
.boilrdle .tools{display:flex;gap:8px;margin-top:10px}
.boilrdle .tools .btn{flex:1}
.boilrdle .levels{display:flex;flex-direction:column;gap:6px;margin-top:6px;max-height:230px;overflow-y:auto}
.boilrdle .lrow{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:#fbfaf6;border:1px solid var(--line);border-radius:10px;padding:8px 11px}
.boilrdle .lrow .n{font-family:'Bungee';font-size:14px;color:var(--rush);min-width:22px}
.boilrdle .lrow .meta2{overflow:hidden}
.boilrdle .lrow .meta2 b{font-family:'Space Mono',ui-monospace,monospace;font-size:12px;color:var(--gold)}
.boilrdle .lrow .meta2 small{display:block;font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.boilrdle .lrow .ctl{display:flex;gap:4px}
.boilrdle .iconbtn{border:1px solid var(--line);background:#fff;border-radius:7px;width:26px;height:26px;cursor:pointer;font-size:13px;color:var(--mut);line-height:1}
.boilrdle .iconbtn:hover{border-color:var(--gold);color:var(--gold)}
.boilrdle .share-in{width:100%;font-family:'Space Mono',ui-monospace,monospace;font-size:11px;background:#fbfaf6;border:1.5px solid var(--line);border-radius:10px;padding:9px 11px;color:var(--ink)}
.boilrdle .modalfoot{display:flex;gap:8px;margin-top:18px}
.boilrdle .modalfoot .btn{flex:1}
`;
