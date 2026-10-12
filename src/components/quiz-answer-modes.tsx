"use client";

import { useMemo, useRef, useState } from "react";
import type { AnswerMode, QuizQuestion } from "@/lib/learning-data";
export type { AnswerMode } from "@/lib/learning-data";

/**
 * Các cách trả lời đa dạng, mô phỏng giao diện bài làm của
 * math-ui-with-tiered-ranking: chọn đáp án / nhập đáp án / trục số /
 * ghép phép tính / nối cặp.
 */

export const MODE_LABELS: Record<AnswerMode, string> = {
  choice: "Chọn đáp án",
  type: "Nhập đáp án",
  line: "Trục số",
  complete: "Ghép phép tính",
  match: "Nối cặp",
  select: "Chọn tất cả đúng",
  "image-choice": "Chọn hình ảnh",
  "image-select": "Chọn nhiều hình ảnh",
};

const ARITH_RE = /(-?\d+)\s*([+\-−×÷x*])\s*(-?\d+)/;

function parseArith(prompt: string) {
  const match = prompt.match(ARITH_RE);
  if (!match) return null;
  const rawOp = match[2];
  const op = rawOp === "x" || rawOp === "*" || rawOp === "×" ? "×" : rawOp === "÷" ? "÷" : rawOp === "−" ? "-" : rawOp;
  return { a: Number(match[1]), op, b: Number(match[3]) };
}

function numericOptions(q: QuizQuestion): number[] {
  return q.options
    .map((option) => Number(option.trim()))
    .filter((n) => Number.isFinite(n) && Math.abs(n) <= 999);
}

export function lineMaxFor(q: QuizQuestion): number {
  const nums = numericOptions(q);
  const target = Number(q.correctAnswer.trim());
  return Math.max(5, target, ...nums) + 2;
}

/** Chọn cách trả lời cho bài hành trình (ổn định theo số thứ tự câu): xen kẽ 4 đáp án với các dạng đặc biệt. */
export function answerModeFor(q: QuizQuestion, index: number): AnswerMode {
  const answerNum = Number(q.correctAnswer.trim());
  if (!Number.isFinite(answerNum)) return "choice";
  // Chỉ câu có phép tính rõ ràng trong đề mới dùng cách trả lời đặc biệt;
  // các câu khác giữ 4 đáp án để không mất ngữ cảnh (VD "Số nào bé nhất?").
  const arith = parseArith(q.prompt);
  if (!arith) return "choice";
  const nums = numericOptions(q);
  if (nums.length < 2) return "choice";
  const seq: AnswerMode[] = ["choice", "complete", "select", "type", "choice", "line", "choice", "match"];
  const mode = seq[index % seq.length];
  if (mode === "line" && lineMaxFor(q) > 20) return "choice";
  return mode;
}

/** Chọn cách trả lời cho khảo sát đầu vào: đa phần vẫn là 4 đáp án, thỉnh thoảng một dạng đặc biệt. */
export function surveyAnswerModeFor(q: QuizQuestion, index: number): AnswerMode {
  const answerNum = Number(q.correctAnswer.trim());
  if (!Number.isFinite(answerNum)) return "choice";
  const arith = parseArith(q.prompt);
  if (!arith) return "choice";
  const nums = numericOptions(q);
  if (nums.length < 2) return "choice";
  if (index % 3 !== 0) return "choice";
  const specials: AnswerMode[] = ["complete", "type", "line", "match", "select"];
  const mode = specials[Math.floor(index / 3) % specials.length];
  if (mode === "line" && lineMaxFor(q) > 20) return "choice";
  return mode;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isOpToken = (s: string) => ["+", "-", "×", "÷"].includes(s);

/** Tính giá trị chuỗi token như ["3","+","2"] → 5. Trả về null nếu không hợp lệ. */
export function evalTokens(tokens: string[]): number | null {
  const parts: (number | string)[] = [];
  let cur = "";
  for (const t of tokens) {
    if (/^\d+$/.test(t)) cur += t;
    else if (isOpToken(t)) {
      if (!cur) return null;
      parts.push(Number(cur), t);
      cur = "";
    } else return null;
  }
  if (!cur) return null;
  parts.push(Number(cur));

  const stack: (number | string)[] = [parts[0]];
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i] as string;
    const n = parts[i + 1] as number;
    if (op === "×") stack[stack.length - 1] = (stack[stack.length - 1] as number) * n;
    else if (op === "÷") {
      if (n === 0) return null;
      stack[stack.length - 1] = (stack[stack.length - 1] as number) / n;
    } else stack.push(op, n);
  }
  let r = stack[0] as number;
  for (let i = 1; i < stack.length; i += 2) {
    const n = stack[i + 1] as number;
    r = stack[i] === "+" ? r + n : r - n;
  }
  return r;
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Tạo phép tính có 2 dấu (+/−) với kết quả target để tăng độ khó. */
function buildExpressionFor(target: number): { terms: string[]; sample: string } {
  if (target < 2) {
    const a = target + 1;
    return { terms: [String(a), "-", "1"], sample: `${a} − 1` };
  }
  if (target < 3 || Math.random() < 0.5) {
    // a + b − c = target  →  a + b = target + c
    const c = randInt(1, Math.min(4, Math.max(1, target)));
    const sum = target + c;
    const a = randInt(1, sum - 1);
    const b = sum - a;
    return { terms: [String(a), "+", String(b), "-", String(c)], sample: `${a} + ${b} − ${c}` };
  }
  // a + b + c = target
  const a = randInt(1, target - 2);
  const b = randInt(1, target - a - 1);
  const c = target - a - b;
  return { terms: [String(a), "+", String(b), "+", String(c)], sample: `${a} + ${b} + ${c}` };
}

/** Bộ ô số để ghép phép tính có kết quả đúng (2 dấu phép tính). */
export function buildTileEquation(q: QuizQuestion): { tiles: string[]; target: number; sample: string } {
  const target = Number(q.correctAnswer.trim());
  const { terms, sample } = buildExpressionFor(target);
  const usedNums = new Set(terms.filter((t) => /^\d+$/.test(t)).map(Number));
  const distractors = numericOptions(q).filter((n) => !usedNums.has(n) && n !== target);
  const extra = distractors.map(String);
  let d = 0;
  while (extra.length < 3) {
    const candidate = String(d);
    if (!usedNums.has(d) && !extra.includes(candidate) && !terms.includes(candidate)) extra.push(candidate);
    d += 1;
  }
  return { tiles: shuffle([...terms, ...extra.slice(0, 3)]), target, sample };
}

function exprFor(value: number, used: Set<string>): string {
  for (let a = 1; a < value; a += 1) {
    const s = `${a}+${value - a}`;
    if (!used.has(s)) {
      used.add(s);
      return s;
    }
  }
  const s = `${value}+0`;
  used.add(s);
  return s;
}

/** Bộ thẻ để nối các phép tính có cùng kết quả (3 cặp). */
export function buildMatchCards(q: QuizQuestion): { id: number; expr: string; value: number }[] {
  const arith = parseArith(q.prompt);
  const target = Number(q.correctAnswer.trim());
  const values: number[] = [target];
  const candidates = numericOptions(q).filter((n) => n !== target && n >= 2);
  for (const c of candidates) if (values.length < 3) values.push(c);
  let fallback = target + 2;
  while (values.length < 3) {
    if (!values.includes(fallback)) values.push(fallback);
    fallback += 1;
  }

  const used = new Set<string>();
  const cards: { id: number; expr: string; value: number }[] = [];
  let id = 0;
  for (const v of values) {
    if (v === target && arith) {
      const expr = `${arith.a}${arith.op === "-" ? "−" : arith.op}${arith.b}`;
      used.add(expr);
      cards.push({ id: id++, expr, value: v });
    } else {
      cards.push({ id: id++, expr: exprFor(v, used), value: v });
    }
    cards.push({ id: id++, expr: exprFor(v, used), value: v });
  }
  return shuffle(cards);
}

type InputState = "idle" | "correct" | "wrong";

/* ------------------------------------------------------------------ */
/* 1. Nhập đáp án (bàn phím số)                                        */
/* ------------------------------------------------------------------ */

export function TypeInput({
  locked,
  state,
  onChange,
}: {
  locked: boolean;
  state: InputState;
  onChange: (v: string) => void;
}) {
  const [value, setValue] = useState("");

  const update = (next: string) => {
    if (locked) return;
    setValue(next);
    onChange(next);
  };

  const press = (key: string) => {
    if (locked) return;
    if (key === "⌫") return update(value.slice(0, -1));
    if (key === "−") return update(value.includes("-") ? value.replace("-", "") : value.length < 6 ? `-${value}` : value);
    if (value.replace("-", "").length >= 6) return;
    update(value === "-" ? `-${key}` : value + key);
  };

  return (
    <div className="tt-answer-area">
      <input
        className={`tt-input ${state === "correct" ? "correct" : state === "wrong" ? "wrong" : ""}`}
        value={value}
        disabled={locked}
        inputMode="numeric"
        placeholder="Nhập câu trả lời..."
        onChange={(event) => {
          const v = event.target.value.replace(/[^\d-]/g, "").slice(0, 6);
          update(v);
        }}
      />
      <div className="tt-keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "−", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            className={`tt-key ${key === "⌫" || key === "−" ? "op" : ""}`}
            onClick={() => press(key)}
            disabled={locked}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Trục số (kéo mũi tên / chạm / phím ← →)                          */
/* ------------------------------------------------------------------ */

export function NumberLineInput({
  q,
  locked,
  state,
  onChange,
}: {
  q: QuizQuestion;
  locked: boolean;
  state: InputState;
  onChange: (v: number) => void;
}) {
  const max = lineMaxFor(q);
  const [value, setValue] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const set = (v: number) => {
    const clamped = Math.max(0, Math.min(max, v));
    setValue(clamped);
    onChange(clamped);
  };

  const fromClientX = (x: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    set(Math.round(((x - rect.left) / rect.width) * max));
  };

  const ticks = Array.from({ length: max + 1 }, (_, i) => i);
  const pct = (v: number) => (v / max) * 100;

  return (
    <div className="tt-answer-area">
      <div className="tt-numline" tabIndex={0} onKeyDown={(e) => {
        if (locked) return;
        if (e.key === "ArrowRight") set(value + 1);
        if (e.key === "ArrowLeft") set(value - 1);
      }}>
        <div
          ref={trackRef}
          className="tt-numline-track"
          onPointerDown={(e) => {
            if (locked) return;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setDragging(true);
            fromClientX(e.clientX);
          }}
          onPointerMove={(e) => dragging && !locked && fromClientX(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          {ticks.map((t) => (
            <div key={t} className={`tt-numline-tick ${t <= value ? "on" : ""}`} style={{ left: `${pct(t)}%` }}>
              <span>{t}</span>
              <i />
            </div>
          ))}
          <div className="tt-numline-base" />
          <div className="tt-numline-fill" style={{ width: `${pct(value)}%` }} />
          <div className={`tt-numline-pointer ${state === "correct" ? "correct" : state === "wrong" ? "wrong" : ""}`} style={{ left: `${pct(value)}%` }}>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Ghép phép tính từ các ô số                                       */
/* ------------------------------------------------------------------ */

export function TileEquation({
  q,
  locked,
  state,
  onChange,
}: {
  q: QuizQuestion;
  locked: boolean;
  state: InputState;
  onChange: (tokens: string[]) => void;
}) {
  const data = useMemo(
    () => buildTileEquation(q),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id, q.prompt, q.correctAnswer, q.options],
  );
  const [selected, setSelected] = useState<number[]>([]);

  const update = (next: number[]) => {
    setSelected(next);
    onChange(next.map((i) => data.tiles[i]));
  };

  const add = (i: number) => !locked && !selected.includes(i) && update([...selected, i]);
  const remove = (pos: number) => !locked && update(selected.filter((_, k) => k !== pos));

  const expr = selected.map((i) => (data.tiles[i] === "-" ? "−" : data.tiles[i])).join(" ");

  return (
    <div className="tt-answer-area">
      <div className="tt-equation">
        <span className="tt-sym">{data.target}</span>
        <span className="tt-sym op">=</span>
        <span className={`tt-blank wide ${state === "correct" ? "correct" : state === "wrong" ? "wrong" : ""}`}>
          {expr || "?"}
        </span>
      </div>

      <div className="tt-tile-row" style={{ minHeight: 60 }}>
        {selected.length === 0 ? (
          <p className="tt-hint">Chạm vào các ô bên dưới để tạo phép tính</p>
        ) : (
          selected.map((i, pos) => (
            <button key={`${i}-${pos}`} type="button" className={`tt-tile ${["+", "-", "×", "÷"].includes(data.tiles[i]) ? "op" : ""}`} onClick={() => remove(pos)} disabled={locked}>
              {data.tiles[i] === "-" ? "−" : data.tiles[i]}
            </button>
          ))
        )}
      </div>

      <div className="tt-tile-row">
        {data.tiles.map((label, i) =>
          selected.includes(i) ? (
            <span key={i} className="tt-tile empty" />
          ) : (
            <button key={i} type="button" className={`tt-tile ${["+", "-", "×", "÷"].includes(label) ? "op" : ""}`} onClick={() => add(i)} disabled={locked}>
              {label === "-" ? "−" : label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Nối cặp phép tính cùng kết quả                                    */
/* ------------------------------------------------------------------ */

export function MatchBoard({ q, locked, onDone }: { q: QuizQuestion; locked: boolean; onDone: (mistakes: number) => void }) {
  const cards = useMemo(
    () => buildMatchCards(q),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id, q.prompt, q.correctAnswer, q.options],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);

  const click = (id: number) => {
    if (locked || matched.includes(id) || wrong.length) return;
    if (selected === null) return setSelected(id);
    if (selected === id) return setSelected(null);
    const a = cards.find((c) => c.id === selected)!;
    const b = cards.find((c) => c.id === id)!;
    if (a.value === b.value) {
      const next = [...matched, a.id, b.id];
      setMatched(next);
      setSelected(null);
      if (next.length === cards.length) setTimeout(() => onDone(mistakes), 350);
    } else {
      setMistakes((m) => m + 1);
      setWrong([a.id, b.id]);
      setTimeout(() => {
        setWrong([]);
        setSelected(null);
      }, 550);
    }
  };

  return (
    <div className="tt-answer-area">
      <div className="tt-match-grid">
        {cards.map((c) => {
          const isMatched = matched.includes(c.id);
          const isSel = selected === c.id;
          const isWrong = wrong.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => click(c.id)}
              disabled={locked}
              className={`tt-match-card ${isMatched ? "matched" : isWrong ? "wrong" : isSel ? "sel" : ""}`}
            >
              {c.expr}
              {isMatched && <span className="tt-match-check">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="tt-hint">
        Chọn 2 ô có cùng kết quả · Lỗi: <span className={mistakes ? "tt-hint-error" : ""}>{mistakes}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Chọn tất cả phép tính có kết quả đúng                             */
/* ------------------------------------------------------------------ */

function evalExprText(expr: string): number | null {
  const match = expr.trim().match(/^(\d+)\s*([+−-])\s*(\d+)$/);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[3]);
  return match[2] === "+" ? a + b : a - b;
}

/** 6 ô biểu thức: 2 ô đúng (bằng đáp án) + 4 ô sai. */
export function buildSelectOptions(q: QuizQuestion): { options: { expr: string; ok: boolean }[]; okExprs: string[] } {
  const answerNum = Number(q.correctAnswer.trim());
  const arith = parseArith(q.prompt);
  if (!Number.isFinite(answerNum) || !arith) return { options: [], okExprs: [] };

  const seen = new Set<string>();
  const options: { expr: string; ok: boolean }[] = [];
  const okExprs: string[] = [];
  const add = (expr: string, ok: boolean) => {
    if (seen.has(expr)) return;
    seen.add(expr);
    options.push({ expr, ok });
    if (ok) okExprs.push(expr);
  };

  const sym = arith.op === "-" ? "−" : arith.op;
  add(`${arith.a} ${sym} ${arith.b}`, true);
  if (arith.op === "+" || arith.op === "×") add(`${arith.b} ${sym} ${arith.a}`, true);
  if (okExprs.length < 2) add(`${answerNum} + 0`, true);

  const wrongCandidates = [
    `${arith.a + 1} + ${arith.b}`,
    `${arith.a + 2} + ${arith.b}`,
    `${arith.a + 3} + ${arith.b}`,
    `${arith.a} + ${arith.b + 4}`,
  ];
  for (const expr of wrongCandidates) {
    if (options.length >= 6) break;
    const value = evalExprText(expr);
    if (value === null || value === answerNum) continue;
    add(expr, false);
  }
  let extra = 1;
  while (options.length < 6 && extra < 25) {
    add(`${answerNum + extra} + 0`, false);
    extra += 1;
  }
  return { options: shuffle(options), okExprs };
}

export function SelectAllOptions({
  q,
  locked,
  state,
  onChange,
}: {
  q: QuizQuestion;
  locked: boolean;
  state: InputState;
  onChange: (chosen: string[]) => void;
}) {
  const data = useMemo(
    () => buildSelectOptions(q),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id, q.prompt, q.correctAnswer, q.options],
  );
  const [chosen, setChosen] = useState<string[]>([]);

  const toggle = (expr: string) => {
    if (locked) return;
    const next = chosen.includes(expr) ? chosen.filter((e) => e !== expr) : [...chosen, expr];
    setChosen(next);
    onChange(next);
  };

  if (!data.options.length) return null;

  return (
    <div className="tt-answer-area">
      <div className="tt-options tt-select-grid">
        {data.options.map((option) => {
          const isChosen = chosen.includes(option.expr);
          const stateClass =
            state === "idle"
              ? isChosen
                ? "chosen"
                : ""
              : option.ok
                ? "correct"
                : isChosen
                  ? "wrong"
                  : "muted";
          return (
            <button key={option.expr} type="button" className={`tt-option ${stateClass}`} onClick={() => toggle(option.expr)} disabled={locked}>
              <strong>{option.expr}</strong>
              {state !== "idle" && option.ok && <span className="tt-option-badge">✓</span>}
              {state === "wrong" && !option.ok && isChosen && <span className="tt-option-badge">✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ImageChoiceAnswers({
  q,
  selected,
  locked,
  multi = false,
  onChoose,
}: {
  q: QuizQuestion;
  selected: string[];
  locked: boolean;
  multi?: boolean;
  onChoose: (value: string) => void;
}) {
  const assetById = new Map((q.imageAssets ?? []).map((asset) => [asset.id, asset]));
  const correctAnswers = new Set(q.correctAnswer.split("|"));

  return (
    <div className={`tt-options tt-image-options${multi ? " multi" : ""}`}>
      {q.options.map((option, index) => {
        const asset = assetById.get(q.optionImageIds?.[index] ?? "");
        const chosen = selected.includes(option);
        const isCorrect = correctAnswers.has(option);
        const state = locked
          ? isCorrect ? "correct" : chosen ? "wrong" : "muted"
          : chosen ? "chosen" : "";
        return (
          <button
            key={option}
            type="button"
            className={`tt-option tt-image-option ${state}`}
            disabled={locked}
            onClick={() => onChoose(option)}
          >
            {asset && <img src={asset.src} alt={asset.name} />}
            <strong>{option}</strong>
            {locked && isCorrect && <span className="tt-option-badge">✓</span>}
            {locked && chosen && !isCorrect && <span className="tt-option-badge">✕</span>}
          </button>
        );
      })}
    </div>
  );
}
