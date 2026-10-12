"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { difficultyMeta, type SurveyQuestion } from "@/lib/learning-data";
import { computePlacement, type PlacementAnswer, type PlacementResult } from "@/lib/placement";
import { makeVariant } from "@/lib/survey-variant";
import { smartLotusApi } from "@/lib/api";
import {
  buildSelectOptions,
  evalTokens,
  MatchBoard,
  MODE_LABELS,
  NumberLineInput,
  SelectAllOptions,
  surveyAnswerModeFor,
  TileEquation,
  TypeInput,
  type AnswerMode,
} from "./quiz-answer-modes";
import { QuizIllustration } from "./quiz-illustrations";

type PlacementSurveyProps = {
  questions: SurveyQuestion[];
  studentName: string;
  onExit: () => void;
  onComplete: (placement: PlacementResult, answers: PlacementAnswer[]) => void;
};

export default function PlacementSurvey({ questions, studentName, onExit, onComplete }: PlacementSurveyProps) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [variant, setVariant] = useState<SurveyQuestion | null>(null);
  const [retryLoading, setRetryLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [finished, setFinished] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    try {
      return window.localStorage.getItem("smart-lotus-quiz-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [typed, setTyped] = useState("");
  const [lineValue, setLineValue] = useState(0);
  const [tokens, setTokens] = useState<string[]>([]);
  const [lastCorrect, setLastCorrect] = useState(false);

  const total = questions.length;
  const question = questions[Math.min(index, total - 1)];
  const active = variant ?? question;
  const meta = difficultyMeta[active.difficulty];

  const wrongFirst = selected !== null && !lastCorrect && attempts === 0;
  const wrongSecond = selected !== null && !lastCorrect && attempts === 1;
  const wrongThird = selected !== null && !lastCorrect && attempts === 2;
  const correctNow = selected !== null && lastCorrect;
  const mode: AnswerMode = surveyAnswerModeFor(active, index);
  const inputState: "idle" | "correct" | "wrong" = selected === null ? "idle" : correctNow ? "correct" : "wrong";
  const canCheck =
    mode === "type"
      ? typed.trim() !== ""
      : mode === "line"
        ? true
        : mode === "complete" || mode === "select"
          ? tokens.length > 0
          : false;

  const HINTS: Record<AnswerMode, string> = {
    choice: "Chọn một đáp án để tiếp tục · Sai có thể làm lại câu tương tự (tối đa 2 lần)",
    type: "Gõ đáp án rồi bấm Kiểm tra",
    line: "Kéo mũi tên hoặc chạm vào trục số (phím ← →)",
    complete: "Chạm các ô bên dưới để tạo phép tính",
    match: "Chọn 2 ô có cùng kết quả",
    select: "Chọn tất cả các ô có kết quả bằng nhau rồi bấm Kiểm tra",
    "image-choice": "Chọn một hình ảnh để tiếp tục",
    "image-select": "Chọn tất cả hình ảnh đúng rồi bấm Kiểm tra",
  };

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem("smart-lotus-quiz-theme", next);
      } catch {
        /* bỏ qua */
      }
      return next;
    });
  }

  function grade(answerText: string, isCorrect: boolean) {
    if (selected || finished || stopping) return;
    setSelected(answerText);
    setLastCorrect(isCorrect);
    if (!isCorrect && attempts >= 2) {
      // Sai đến lần thứ 3: dừng khảo sát và đánh giá ngay tại điểm này.
      const nextAnswers: PlacementAnswer[] = [...answers, { level: question.level, correct: false, retried: true }];
      setAnswers(nextAnswers);
      setStopping(true);
      window.setTimeout(() => {
        setFinished(true);
        onComplete(computePlacement(nextAnswers), nextAnswers);
      }, 2200);
    }
  }

  function choose(option: string) {
    grade(option, option === active.correctAnswer);
  }

  function checkInput() {
    if (selected !== null || stopping || finished) return;
    const answer = active.correctAnswer.trim();
    if (mode === "type") {
      if (!typed.trim()) return;
      grade(typed.trim(), typed.trim() === answer);
    } else if (mode === "line") {
      grade(String(lineValue), String(lineValue) === answer);
    } else if (mode === "complete") {
      const result = evalTokens(tokens);
      const ok = result !== null && tokens.some((t) => ["+", "-", "×", "÷"].includes(t)) && String(result) === answer;
      grade(tokens.join(" "), ok);
    } else if (mode === "select") {
      const { okExprs } = buildSelectOptions(active);
      const ok = tokens.length === okExprs.length && okExprs.every((expr) => tokens.includes(expr));
      grade(tokens.join(" | "), ok);
    }
  }

  function resetInputs() {
    setTyped("");
    setLineValue(0);
    setTokens([]);
    setLastCorrect(false);
  }

  async function retryQuestion() {
    // Sai: cho một câu tương tự cùng dạng nhưng giá trị khác (AI; dự phòng cục bộ).
    if (retryLoading || stopping) return;
    setRetryLoading(true);
    let nextVariant: SurveyQuestion;
    try {
      const generated = await smartLotusApi.generateSurveyVariant(question);
      nextVariant = generated.question;
    } catch {
      nextVariant = makeVariant(question);
    }
    setVariant(nextVariant);
    setSelected(null);
    setAttempts((value) => value + 1);
    resetInputs();
    setRetryLoading(false);
  }

  function recordAndNext() {
    if (!selected || finished) return;
    const isCorrect = lastCorrect;
    const nextAnswers: PlacementAnswer[] = [...answers, { level: question.level, correct: isCorrect, retried: attempts > 0 }];
    setAnswers(nextAnswers);
    if (index >= total - 1) {
      setFinished(true);
      onComplete(computePlacement(nextAnswers), nextAnswers);
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setAttempts(0);
    setVariant(null);
    resetInputs();
  }

  if (finished) {
    return (
      <main className="phase-screen">
        <div className="phase-confetti c1">✦</div>
        <div className="phase-confetti c2">●</div>
        <div className="phase-confetti c3">◆</div>
        <section className="phase-card">
          <div className="unlock-ring"><Icon name="sparkles" size={38} /></div>
          <span className="eyebrow purple">KHẢO SÁT ĐẦU VÀO</span>
          <h1>Đang phân tích kết quả…</h1>
          <p>Chúng mình đang tìm bài học bắt đầu phù hợp nhất cho {studentName}.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`tt-quiz ${theme === "light" ? "light" : ""}`}>
      <div className="tt-topbar">
        <button className="tt-exit" onClick={onExit} aria-label="Thoát khảo sát">✕</button>
        <div className="tt-progress-track">
          <div className="tt-progress-fill" style={{ width: `${Math.max(((index + (selected !== null ? 1 : 0)) / total) * 100, 3)}%` }} />
        </div>
        <button className="tt-theme-toggle" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối" title="Đổi giao diện sáng/tối">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <div className="tt-stats">
          <span className="tt-stat"><Icon name="sparkles" size={14} /> {studentName}</span>
        </div>
      </div>

      <div className="tt-stage">
        <div key={`${active.id}-${index}-${attempts}`} className="tt-question">
          <div className="tt-chips">
            <span className="tt-phase-chip normal"><Icon name="target" size={14} /> Khảo sát đầu vào</span>
            <span className="tt-mode-chip">{MODE_LABELS[mode]}</span>
            <span className="tt-diff-chip" style={{ color: meta.color }}>
              {"★".repeat(meta.stars)} Level {question.level} · {question.skill}
            </span>
            <span className="tt-count">Câu {index + 1}/{total}</span>
          </div>

          {mode === "match" ? (
            <h1 className="tt-prompt">Nối các phép tính có cùng kết quả</h1>
          ) : mode === "select" ? (
            <h1 className="tt-prompt">Nối các ô cùng một đáp án</h1>
          ) : mode === "complete" ? null : (
            <h1 className="tt-prompt">{active.prompt}</h1>
          )}

          {mode !== "match" && mode !== "complete" && mode !== "select" && <QuizIllustration question={active} />}

          {mode === "choice" && (
            <div className="tt-options">
              {active.options.map((option, optionIndex) => {
                const isChosen = selected === option;
                const isCorrect = option === active.correctAnswer;
                const state = selected !== null ? (isCorrect ? "correct" : isChosen ? "wrong" : "muted") : "";
                return (
                  <button className={`tt-option ${state}`} key={option} onClick={() => choose(option)} disabled={selected !== null}>
                    <span className="tt-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                    <strong>{option}</strong>
                    {selected !== null && isCorrect && <Icon name="check" size={18} className="tt-option-badge" />}
                    {selected !== null && isChosen && !isCorrect && <Icon name="close" size={18} className="tt-option-badge" />}
                  </button>
                );
              })}
            </div>
          )}
          {mode === "type" && <TypeInput locked={selected !== null} state={inputState} onChange={setTyped} />}
          {mode === "line" && <NumberLineInput q={active} locked={selected !== null} state={inputState} onChange={setLineValue} />}
          {mode === "complete" && <TileEquation q={active} locked={selected !== null} state={inputState} onChange={setTokens} />}
          {mode === "select" && <SelectAllOptions q={active} locked={selected !== null} state={inputState} onChange={setTokens} />}
          {mode === "match" && (
            <MatchBoard q={active} locked={selected !== null} onDone={(mistakes) => grade("Ghép cặp", mistakes === 0)} />
          )}

          {selected === null && !stopping && mode !== "match" && (
            <p className="tt-hint">{HINTS[mode]}</p>
          )}
        </div>
      </div>

      <div className={`tt-footer ${correctNow ? "correct" : selected !== null ? "wrong" : ""}`}>
        <div className="tt-footer-inner">
          <div className="tt-feedback">
            {correctNow && (
              <div className="tt-feedback-row">
                <span className="tt-feedback-icon">✓</span>
                <div>
                  <p className="tt-feedback-title">Chính xác! Tuyệt lắm!</p>
                </div>
              </div>
            )}
            {wrongFirst && (
              <div className="tt-feedback-row">
                <span className="tt-feedback-icon wrong">✕</span>
                <div>
                  <p className="tt-feedback-title">Chưa đúng rồi!</p>
                  <p className="tt-feedback-text">Hãy thử câu tương tự với giá trị khác. Bạn còn 2 lượt thử.</p>
                </div>
              </div>
            )}
            {wrongSecond && (
              <div className="tt-feedback-row">
                <span className="tt-feedback-icon wrong">✕</span>
                <div>
                  <p className="tt-feedback-title">Chưa đúng! Đây là lượt thử cuối cùng.</p>
                  <p className="tt-feedback-text">Thêm một câu tương tự nữa với giá trị khác nhé.</p>
                </div>
              </div>
            )}
            {wrongThird && (
              <div className="tt-feedback-row">
                <span className="tt-feedback-icon wrong">✕</span>
                <div>
                  <p className="tt-feedback-title">Bạn đã làm sai 3 lần ở câu này.</p>
                  <p className="tt-feedback-text">
                    Đáp án đúng: <b>{active.correctAnswer}</b>
                    Khảo sát dừng lại và đánh giá ngay tại điểm này…
                  </p>
                </div>
              </div>
            )}
          </div>
          {selected !== null && !wrongThird ? (
            correctNow ? (
              <button className="tt-next" onClick={recordAndNext}>
                {index === total - 1 ? "Hoàn thành khảo sát" : "Câu tiếp theo"}
              </button>
            ) : (
              <button className="tt-next" onClick={() => void retryQuestion()} disabled={retryLoading || stopping}>
                {retryLoading ? "Đang tạo câu tương tự…" : attempts === 0 ? "Làm câu tương tự" : "Làm câu tương tự (lần cuối)"}
              </button>
            )
          ) : selected === null && !stopping && mode !== "choice" && mode !== "match" ? (
            <button className="tt-next" onClick={checkInput} disabled={!canCheck}>
              Kiểm tra
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
