"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName, LotusLogo, LotusMascot } from "./icons";
import { curriculum, difficultyMeta, questions, type QuizQuestion, type SurveyQuestion } from "@/lib/learning-data";
import { adminMetrics } from "@/lib/role-data";
import { calculateQuestionScore, calculateQuizScore, formatDuration } from "@/lib/scoring";
import { smartLotusApi, type AttemptPayload, type DashboardData, type Role } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  answerModeFor,
  buildSelectOptions,
  evalTokens,
  MatchBoard,
  ImageChoiceAnswers,
  MODE_LABELS,
  NumberLineInput,
  SelectAllOptions,
  shuffle,
  TileEquation,
  TypeInput,
  type AnswerMode,
} from "./quiz-answer-modes";
import { QuizIllustration } from "./quiz-illustrations";
import { difficultiesForScore, evaluatePathLocal, type AttemptSummary, type PathEvaluation, type PlacementResult } from "@/lib/placement";
import MathLevelMap from "./game-level-map";
import Classroom from "./classroom";
import AssignmentBuilder from "./assignment-builder";
import TeacherOverview from "./teacher-overview";
import PlacementSurvey from "./placement-survey";
import StudentClassrooms from "./student-classrooms";
import type { Assignment } from "@/lib/assignment-data";

type StudentView = "home" | "classrooms" | "exercises" | "roadmap" | "compete" | "achievements";
type TeacherView = "overview" | "classes" | "assignments";
type Screen = "app" | "quiz" | "result" | "survey" | "guide";
type AuthMode = "login" | "register";
type QuizMode = "journey" | "review" | "demo" | "assignment";
type AttemptMode = "normal" | "retry" | "hard";

const MAP_CHAPTER_SIZE = [17, 17, 17, 17, 16, 16];

/** Quy đổi lá sen trên bản đồ 100 bài về bài học trong lộ trình 6 chương. */
function lessonForMapPad(lessonNumber: number) {
  const n = Math.max(1, Math.min(100, Math.round(lessonNumber)));
  let chapter = 0;
  let start = 1;
  for (let i = 0; i < MAP_CHAPTER_SIZE.length; i += 1) {
    if (n < start + MAP_CHAPTER_SIZE[i]) {
      chapter = i;
      break;
    }

    start += MAP_CHAPTER_SIZE[i];
  }
  const level = chapter + 1;
  const levelMeta = curriculum[chapter] ?? curriculum[0];
  const local = n - start;
  const lessonIndex = Math.min(
    levelMeta.lessons.length - 1,
    Math.floor((local / MAP_CHAPTER_SIZE[chapter]) * levelMeta.lessons.length)
  );
  return { level, levelMeta, lessonIndex, lessonTitle: levelMeta.lessons[lessonIndex] };
}

type QuizResult = {
  score: number;
  baseScore: number;
  bonus: number;
  correct: number;
  normalCorrect: number;
  hardCorrect: number;
  duration: number;
  challengeDuration: number;
  total: number;
  answers: AttemptPayload["answers"];
};

const fallbackDashboard: DashboardData = {
  user: {
    id: 0,
    displayName: "Học sinh",
    email: "",
    role: "student",
    avatar: "SL",
    lotusPoints: 0,
    currentStreak: 0,
  },
  stats: { completedLessons: 0, totalLessons: 0, averageScore: 0, learningMinutes: 0 },
  recentAttempts: [],
  todayActivity: { minutesLearned: 0, lessonsCompleted: 0, pointsEarned: 0, correctAnswers: 0, attempts: 0, accuracySum: 0 },
  weeklyLeaderboard: [],
  lowScoreAttempts: 0,
  placement: null,
  attemptHistory: [],
};

const navItems: Array<{ id: StudentView; label: string; icon: IconName }> = [
  { id: "home", label: "Trang chủ", icon: "home" },
  { id: "classrooms", label: "Lớp học", icon: "school" },
  { id: "exercises", label: "Bài tập", icon: "target" },
  { id: "roadmap", label: "Lộ trình", icon: "map" },
  { id: "compete", label: "Thi đấu", icon: "trophy" },
  { id: "achievements", label: "Thành tích", icon: "medal" },
];

const leaderboard = [
  { name: "Trần Gia Hân", points: 2890, avatar: "GH", color: "#f59e0b" },
  { name: "Lê Hoàng Nam", points: 2650, avatar: "HN", color: "#14b8a6" },
  { name: "Phạm Bảo Ngọc", points: 2480, avatar: "BN", color: "#3b82f6" },
  { name: "Nguyễn Minh Anh", points: 2240, avatar: "MA", color: "#8b5cf6" },
  { name: "Đỗ Khánh Linh", points: 1980, avatar: "KL", color: "#ec4899" },
];

function formatTodayLabel(date: Date) {
  const label = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Các dạng câu hỏi không dùng: vị trí (trên/dưới/trái/phải, ở đâu, so với) và nhận biết hình dạng/con vật. */
const BANNED_QUESTION_RE =
  /(ở đâu|so với|bên trái|bên phải|ở trên|ở dưới|trên cây|dưới cây|trên mặt nước|dưới mặt nước|vị trí nào|ở vị trí|quan sát hình|quan sát tranh|nhìn hình|nhìn tranh|hình vẽ|tranh vẽ|hình nào là hình|hình tròn|hình vuông|hình tam giác|hình chữ nhật|con vật nào)/i;

/** Câu đếm đồ vật cần hình minh họa cũng bị loại (không sinh hình ảnh). */
const COUNTING_QUESTION_RE = /(có tất cả|đếm)/i;

function isAllowedQuestion(question: QuizQuestion) {
  if (BANNED_QUESTION_RE.test(question.prompt)) return false;
  if (COUNTING_QUESTION_RE.test(question.prompt)) return false;
  if (question.illustration && question.illustration.trim()) return false;
  return true;
}

function questionPromptKey(prompt: string) {
  return prompt.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function makeFreshFallbackQuestions(
  bank: QuizQuestion[],
  excludedPrompts: Set<string>,
  count: number,
  difficulties: Array<"A" | "B" | "C" | "D" | "E"> = ["A", "B", "C", "D", "E"],
  curriculumLevel = 1,
): QuizQuestion[] {
  if (count <= 0) return [];

  const candidates = shuffle(bank);
  const selected: QuizQuestion[] = [];
  const selectedPrompts = new Set(excludedPrompts);
  const normalCount = Math.ceil(count / 2);
  const allowedDifficulties: QuizQuestion["difficulty"][] = difficulties.length
    ? difficulties
    : ["A", "B", "C", "D", "E"];

  for (const question of candidates) {
    const key = questionPromptKey(question.prompt);
    if (selectedPrompts.has(key)) continue;
    selectedPrompts.add(key);
    selected.push(question);
    if (selected.length === count) break;
  }

  const maxValue = curriculumLevel <= 3 ? 10 : 100;
  let attempt = 0;
  while (selected.length < count && attempt < count * 100) {
    attempt += 1;
    const type = Math.floor(Math.random() * 4);
    const first = 1 + Math.floor(Math.random() * maxValue);
    const second = Math.floor(Math.random() * (maxValue - first + 1));
    const answer = first + second;
    const prompt =
      type === 0
        ? `${first} + ${second} = ?`
        : type === 1
          ? `${answer} − ${first} = ?`
          : type === 2
            ? `${first} + ☐ = ${answer}. Số cần điền là?`
            : `☐ − ${second} = ${first}. Số ban đầu là?`;
    const key = questionPromptKey(prompt);
    if (selectedPrompts.has(key)) continue;

    const correctAnswer = String(type === 1 || type === 2 ? second : answer);
    const optionValues = new Set([correctAnswer]);
    for (const offset of shuffle([1, 2, 3, 4])) {
      const candidateAnswer = Number(correctAnswer) + (Math.random() < 0.5 ? -offset : offset);
      if (candidateAnswer >= 0 && candidateAnswer <= maxValue * 2) optionValues.add(String(candidateAnswer));
      if (optionValues.size === 4) break;
    }
    while (optionValues.size < 4) optionValues.add(String(Number(correctAnswer) + optionValues.size + 1));

    selectedPrompts.add(key);
    selected.push({
      id: selected.length + 1,
      phase: selected.length < normalCount ? "normal" : "challenge",
      difficulty: allowedDifficulties[Math.floor(Math.random() * allowedDifficulties.length)],
      skill: "Phép tính",
      prompt,
      options: shuffle([...optionValues]),
      correctAnswer,
      explanation: "",
    });
  }

  return selected.map((question, index) => ({ ...question, id: index + 1 }));
}

/** Ngân hàng câu hỏi dự phòng đã lọc (chỉ câu không cần hình minh họa). */
const FILTERED_BANK = questions.filter(isAllowedQuestion);

/** Câu phép tính tự viết dùng cho Luyện tập tự do (đảm bảo có đủ dạng trả lời). */
const DEMO_ARITHMETIC: QuizQuestion[] = [
  {
    id: 9001,
    phase: "normal",
    difficulty: "B",
    skill: "Phép cộng",
    prompt: "3 + 4 = ?",
    options: ["7", "6", "8", "9"],
    correctAnswer: "7",
    explanation: "3 cộng 4 bằng 7.",
  },
  {
    id: 9002,
    phase: "normal",
    difficulty: "B",
    skill: "Phép trừ",
    prompt: "9 − 2 = ?",
    options: ["7", "6", "8", "5"],
    correctAnswer: "7",
    explanation: "9 bớt 2 còn 7.",
  },
  {
    id: 9003,
    phase: "normal",
    difficulty: "B",
    skill: "Phép cộng",
    prompt: "2 + 5 = ?",
    options: ["7", "6", "8", "9"],
    correctAnswer: "7",
    explanation: "2 cộng 5 bằng 7.",
  },
];

function slugifyLesson(value: string | undefined | null) {
  const source = value ?? "bai-hoc";
  const slug = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "bai-hoc";
}

type TodayGoal = {
  date: string;
  minutes: number;
  correctAnswers: number;
  points: number;
  attempts: number;
  accuracySum: number;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Làm càng nhanh (so với ~30 giây/câu) thì càng được cộng thêm phút vào mục tiêu. */
function speedBonusMinutes(totalQuestions: number, durationSeconds: number) {
  const baseline = totalQuestions * 30;
  if (durationSeconds >= baseline) return 0;
  return Math.max(1, Math.round((baseline - durationSeconds) / 60));
}

export default function SmartLotusApp() {
  const [role, setRole] = useState<Role>("student");
  const [greetingName, setGreetingName] = useState("Minh Anh");
  const [authenticated, setAuthenticated] = useState(false);
  const [view, setView] = useState<StudentView>("home");
  const [teacherView, setTeacherView] = useState<TeacherView>("overview");
  const [screen, setScreen] = useState<Screen>("app");
  const [dashboard, setDashboard] = useState<DashboardData>(fallbackDashboard);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(questions);
  const quizGenerationId = useRef(0);
  const quizInteracted = useRef(false);
  const quizLessonNumber = useRef<number | undefined>(undefined);
  const seenQuizPrompts = useRef(new Set<string>());
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[] | null>(null);
  const [placement, setPlacement] = useState<PlacementResult | null>(null);
  const [evaluation, setEvaluation] = useState<PathEvaluation | null>(null);
  const [attemptHistory, setAttemptHistory] = useState<AttemptSummary[]>([]);
  const [initialIntel, setInitialIntel] = useState(50);
  const [quizMode, setQuizMode] = useState<QuizMode>("journey");
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [journeyFailed, setJourneyFailed] = useState(false);
  const [skipEligible, setSkipEligible] = useState(false);
  const [studyStreak, setStudyStreak] = useState(0);
  const [quizLesson, setQuizLesson] = useState<{ level: number; lessonTitle: string } | null>(null);
  const [todayGoal, setTodayGoal] = useState<TodayGoal>({
    date: todayKey(),
    minutes: 0,
    correctAnswers: 0,
    points: 0,
    attempts: 0,
    accuracySum: 0,
  });
  const [result, setResult] = useState<QuizResult | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");
  const knownClassroomInvitations = useRef(new Set<string>());

  useEffect(() => {
    const updateTodayLabel = () => setTodayLabel(formatTodayLabel(new Date()));
    updateTodayLabel();
    const interval = window.setInterval(updateTodayLabel, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authenticated || role !== "student") return;
    let active = true;
    knownClassroomInvitations.current = new Set();
    const checkInvitations = async () => {
      try {
        const { invitations } = await smartLotusApi.getClassroomInvitations();
        if (!active) return;
        if (invitations.some((invitation) => !knownClassroomInvitations.current.has(invitation.id))) {
          setToast("Bạn có lời mời vào lớp mới. Mở mục Lớp học để phản hồi.");
        }
        knownClassroomInvitations.current = new Set(invitations.map((invitation) => invitation.id));
      } catch (error) {
        console.error("Check classroom invitation notifications error", error);
      }
    };
    void checkInvitations();
    const timer = window.setInterval(() => void checkInvitations(), 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authenticated, role]);

  const loadDashboard = useCallback(async (nextRole: Role) => {
    setLoading(true);
    try {
      const data = await smartLotusApi.getDashboard(nextRole);
      setDashboard(data);
      setPlacement(data.placement);
      setAttemptHistory(data.attemptHistory);
      setStudyStreak(data.user.currentStreak);
      setTodayGoal({
        date: todayKey(),
        minutes: data.todayActivity.minutesLearned,
        correctAnswers: data.todayActivity.correctAnswers,
        points: data.todayActivity.pointsEarned,
        attempts: data.todayActivity.attempts,
        accuracySum: data.todayActivity.accuracySum,
      });
      if (data.placement) {
        const nextEvaluation = evaluatePathLocal(data.placement, data.attemptHistory);
        setEvaluation(nextEvaluation);
        setInitialIntel(nextEvaluation.intelligenceScore);
      } else {
        setEvaluation(null);
        setInitialIntel(50);
      }
    } catch {
      setDashboard((current) => ({ ...current, user: { ...current.user, role: nextRole } }));
    } finally {
      setLoading(false);
    }
  }, []);

  function applySessionProfile(metadata: Record<string, unknown>, email?: string) {
    const displayName = typeof metadata.displayName === "string" && metadata.displayName.trim() ? metadata.displayName.trim() : undefined;
    if (!displayName && !email) return;
    setDashboard((current) => ({
      ...current,
      user: {
        ...current.user,
        displayName: displayName ?? current.user.displayName,
        email: email ?? current.user.email,
        avatar: displayName ? displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() : current.user.avatar,
      },
    }));
  }

  /** Khôi phục kết quả khảo sát đã lưu trên tài khoản khi máy không còn dữ liệu cục bộ. */
  function restorePlacementFromMetadata(metadata: Record<string, unknown>) {
    const raw = metadata?.placement;
    if (!raw || typeof raw !== "object") return;
    const candidate = raw as Partial<PlacementResult>;
    if (typeof candidate.level !== "number" || typeof candidate.lessonIndex !== "number") return;
    const nextPlacement = candidate as PlacementResult;
    const nextEvaluation = evaluatePathLocal(nextPlacement, []);
    setPlacement(nextPlacement);
    setEvaluation(nextEvaluation);
  }

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted || !data.session) return;
      const savedRole = data.session.user.user_metadata?.role;
      const storedRole = window.localStorage.getItem("smart-lotus-role");
      const nextRole: Role = savedRole === "teacher" || savedRole === "admin" || savedRole === "student"
        ? savedRole
        : storedRole === "teacher" || storedRole === "admin" ? storedRole : "student";
      const savedFirstName = data.session.user.user_metadata?.firstName;
      setRole(nextRole);
      applySessionProfile(data.session.user.user_metadata, data.session.user.email);
      restorePlacementFromMetadata(data.session.user.user_metadata);
      if (typeof savedFirstName === "string" && savedFirstName.trim()) setGreetingName(savedFirstName.trim());
      setAuthenticated(true);
      void loadDashboard(nextRole);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !session || (event !== "SIGNED_IN" && event !== "USER_UPDATED")) return;
      const savedRole = session.user.user_metadata?.role;
      const savedFirstName = session.user.user_metadata?.firstName;
      setRole(savedRole === "teacher" || savedRole === "admin" ? savedRole : "student");
      applySessionProfile(session.user.user_metadata, session.user.email);
      restorePlacementFromMetadata(session.user.user_metadata);
      if (typeof savedFirstName === "string" && savedFirstName.trim()) setGreetingName(savedFirstName.trim());
      setAuthenticated(true);
      void loadDashboard(session.user.user_metadata?.role === "teacher" || session.user.user_metadata?.role === "admin" ? session.user.user_metadata.role : "student");
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function completeAuthentication(nextRole: Role, firstName?: string, justRegistered = false) {
    setRole(nextRole);
    if (firstName?.trim()) setGreetingName(firstName.trim());
    setAuthenticated(true);
    if (justRegistered && nextRole === "student") {
      void loadDashboard(nextRole);
      setView("exercises");
      setScreen("guide");
      return;
    }
    const pendingSurvey = window.localStorage.getItem("smart-lotus-pending-survey");
    if (nextRole === "student" && pendingSurvey === "1") {
      window.localStorage.removeItem("smart-lotus-pending-survey");
      setView("exercises");
      setScreen("guide");
      return;
    }
    setView("home");
    void loadDashboard(nextRole);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthenticated(false);
    setProfileOpen(false);
    setToast("Bạn đã đăng xuất khỏi Smart Lotus");
  }

  function openProfileEditor() {
    setProfileOpen(false);
    setProfileEditorOpen(true);
  }

  function updateProfile(displayName: string, avatarUrl: string, pendingEmail?: string) {
    const nextGreetingName = displayName.trim().split(/\s+/).pop() || greetingName;
    setDashboard((current) => ({ ...current, user: { ...current.user, displayName: displayName.trim(), avatarUrl, avatar: displayName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() } }));
    setGreetingName(nextGreetingName);
    setProfileEditorOpen(false);
    setToast(pendingEmail ? "Đã gửi email xác minh địa chỉ mới" : "Thông tin cá nhân đã được cập nhật");
  }

  async function completeQuiz(quizResult: QuizResult) {
    setResult(quizResult);
    setScreen("result");
    if (quizMode === "demo") {
      setToast("🎮 Hoàn thành lượt luyện tập tự do. Kết quả không ảnh hưởng hành trình học.");
      return;
    }
    if (quizMode === "assignment") {
      if (!activeAssignment) {
        setToast("Không tìm thấy bài tập đang làm.");
        return;
      }
      try {
        const response = await smartLotusApi.submitAssignment(activeAssignment.id, {
          durationSeconds: Math.max(1, quizResult.duration),
          challengeDurationSeconds: Math.max(0, Math.round(quizResult.challengeDuration)),
          answers: quizResult.answers.map(({ questionId, answer }) => ({ questionId, answer })),
        });
        setResult((current) => current ? {
          ...current,
          score: response.submission.score,
          baseScore: response.submission.score,
          bonus: 0,
          correct: response.submission.correctAnswers,
          total: response.submission.totalQuestions,
        } : current);
        setToast("Đã nộp bài tập cho giáo viên.");
      } catch (submitError) {
        setToast(submitError instanceof Error ? submitError.message : "Không thể nộp bài. Hãy thử lại.");
      }
      return;
    }
    const lesson = currentLesson();
    const lessonSlug = `level-${lesson.level}-${slugifyLesson(lesson.lessonTitle)}`;
    const attemptSummary: AttemptSummary = {
      lessonSlug,
      correctAnswers: quizResult.correct,
      totalQuestions: quizResult.total,
      score: quizResult.score,
      durationSeconds: quizResult.duration,
      completedAt: new Date().toISOString(),
    };
    const nextHistory = [...attemptHistory, attemptSummary].slice(-20);
    setAttemptHistory(nextHistory);

    const percent = quizResult.total > 0 ? quizResult.correct / quizResult.total : 0;
    const difficultyRank: Record<QuizQuestion["difficulty"], number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
    const highestDifficulty = quizQuestions.reduce<QuizQuestion["difficulty"]>(
      (highest, question) => difficultyRank[question.difficulty] > difficultyRank[highest] ? question.difficulty : highest,
      "A",
    );
    const isJourney = quizMode === "journey";
    const failedJourney = isJourney && percent < 0.5;

    updateTodayGoal(quizResult);

    if (placement) {
      const refreshed = await refreshEvaluation(placement, nextHistory);
      let nextEvaluation = refreshed;
      if (failedJourney && nextEvaluation) {
        nextEvaluation = { ...nextEvaluation, intelligenceScore: Math.max(0, nextEvaluation.intelligenceScore - 5) };
        setEvaluation(nextEvaluation);
      }
      setJourneyFailed(failedJourney);
      setSkipEligible(isJourney && percent >= 0.9 && (nextEvaluation?.intelligenceScore ?? 0) > 90);
    }

    try {
      const response = await smartLotusApi.submitAttempt({
        lessonSlug,
        correctAnswers: quizResult.correct,
        totalQuestions: quizResult.total,
        score: quizResult.score,
        durationSeconds: quizResult.duration,
        highestDifficulty,
        answers: quizResult.answers,
      });
      accumulateLotusPoints(response.totalPoints);
      const streakMessage = updateStudyStreak();
      setDashboard((current) => ({
        ...current,
        lowScoreAttempts: current.lowScoreAttempts + (quizResult.score < 50 ? 1 : 0),
      }));
      await loadDashboard("student");
      if (failedJourney) {
        setToast("Không đủ điều kiện vượt bài! Chỉ số thông minh bị trừ 5 điểm. Hãy vào Ôn tập để lấy lại.");
      } else if (streakMessage) {
        setToast(`${streakMessage}. Điểm sen +${quizResult.score}`);
      } else {
        setToast(`Kết quả đã được lưu! Điểm sen +${quizResult.score}`);
      }
    } catch {
      setToast(failedJourney ? "Không đủ điều kiện vượt bài! Chỉ số thông minh bị trừ 5 điểm." : "Không thể đồng bộ kết quả. Hãy kiểm tra kết nối rồi thử lại.");
    }
  }

  function startAssignment(assignment: Assignment) {
    if (!assignment.questions?.length) {
      setToast("Bài tập này chưa có câu hỏi.");
      return;
    }
    setActiveAssignment(assignment);
    setQuizQuestions(assignment.questions);
    quizGenerationId.current += 1;
    quizInteracted.current = false;
    setQuizMode("assignment");
    setQuizLesson({
      level: assignment.curriculumLevel ?? 1,
      lessonTitle: assignment.topic ?? assignment.title,
    });
    setJourneyFailed(false);
    setSkipEligible(false);
    setScreen("quiz");
  }

  async function skipLesson() {
    const nextEvaluation = evaluation ? { ...evaluation, lessonIndex: evaluation.lessonIndex + 2 } : null;
    if (nextEvaluation) {
      setEvaluation(nextEvaluation);
    }
    let placementSaved = true;
    if (placement) {
      const nextPlacement = { ...placement, lessonIndex: placement.lessonIndex + 2 };
      setPlacement(nextPlacement);
      try {
        await smartLotusApi.savePlacement(nextPlacement);
      } catch {
        placementSaved = false;
      }
    }
    setSkipEligible(false);
    setScreen("app");
    setView("exercises");
    setToast(placementSaved ? "🐸 Ếch đã nhảy qua 2 lá sen!" : "Đã nhảy bài nhưng chưa đồng bộ được lộ trình lên máy chủ.");
  }

  function currentLesson() {
    if (quizLesson) {
      const levelMeta = curriculum[quizLesson.level - 1] ?? curriculum[0];
      const lessonIndex = Math.max(0, levelMeta.lessons.indexOf(quizLesson.lessonTitle));
      return { level: quizLesson.level, levelMeta, lessonIndex, lessonTitle: quizLesson.lessonTitle };
    }
    const activeLevel = evaluation?.startLevel ?? placement?.level ?? 1;
    const levelMeta = curriculum[activeLevel - 1] ?? curriculum[0];
    const lessonIndex = Math.min(evaluation?.lessonIndex ?? placement?.lessonIndex ?? 0, levelMeta.lessons.length - 1);
    return { level: activeLevel, levelMeta, lessonIndex, lessonTitle: levelMeta.lessons[lessonIndex] };
  }

  function currentLessonTitle() {
    return currentLesson().lessonTitle;
  }

  function journeyLocked() {
    const currentIntel = evaluation?.intelligenceScore ?? initialIntel;
    return initialIntel < 30 && currentIntel < 50;
  }

  /** Cập nhật mục tiêu hôm nay: thời gian làm bài (bấm bắt đầu → kết thúc) + thưởng tốc độ. */
  function updateTodayGoal(quizResult: QuizResult) {
    setTodayGoal((prev) => {
      const today = todayKey();
      const base: TodayGoal =
        prev.date === today
          ? prev
          : { date: today, minutes: 0, correctAnswers: 0, points: 0, attempts: 0, accuracySum: 0 };
      const accuracy = quizResult.total > 0 ? (quizResult.correct / quizResult.total) * 100 : 0;
      const next: TodayGoal = {
        ...base,
        minutes: base.minutes + quizResult.duration / 60 + speedBonusMinutes(quizResult.total, quizResult.duration),
        correctAnswers: base.correctAnswers + quizResult.correct,
        points: base.points + quizResult.score,
        attempts: base.attempts + 1,
        accuracySum: base.accuracySum + accuracy,
      };
      return next;
    });
  }

  /** Cộng dồn điểm sen theo tổng các bài làm. */
  function accumulateLotusPoints(serverTotal: number) {
    setDashboard((current) => ({ ...current, user: { ...current.user, lotusPoints: serverTotal } }));
    return serverTotal;
  }

  /** Chuỗi ngày học: tại mốc 5/10/15 ngày, chỉ số thông minh được cộng thêm. */
  function updateStudyStreak(): string | null {
    const alreadyActiveToday = dashboard.todayActivity.lessonsCompleted > 0;
    const previousStreak = dashboard.user.currentStreak;
    const count = alreadyActiveToday ? previousStreak : previousStreak + 1;
    setStudyStreak(count);
    if (alreadyActiveToday) return null;

    const hit = [5, 10, 15].find((milestone) => previousStreak < milestone && count >= milestone);
    if (!hit) return null;
    const bonus = hit === 5 ? 2 : hit === 10 ? 3 : 4;
    setEvaluation((previous) => previous
      ? { ...previous, intelligenceScore: Math.min(100, previous.intelligenceScore + bonus) }
      : previous);
    return `🔥 Chuỗi ${hit} ngày! Chỉ số thông minh +${bonus}`;
  }

  async function startQuiz(mode: QuizMode = "journey", lessonNumber?: number, attemptMode: AttemptMode = "normal") {
    if (mode === "demo") {
      quizGenerationId.current += 1;
      quizLessonNumber.current = undefined;
      // Luyện tập tự do: ngân hàng câu tự viết, không AI, không ảnh hưởng hành trình.
      // Chèn câu phép tính vào các vị trí dạng đặc biệt để demo có đủ 6 cách trả lời.
      setQuizMode(mode);
      setJourneyFailed(false);
      setSkipEligible(false);
      quizLessonNumber.current = lessonNumber;
      setQuizLesson(null);
      const bank = FILTERED_BANK.length ? FILTERED_BANK : questions;
      const specialSlots = new Set([1, 2, 3, 5, 7]);
      setQuizQuestions(
        Array.from({ length: 20 }, (_, i) => {
          const base = specialSlots.has(i % 8)
            ? DEMO_ARITHMETIC[i % DEMO_ARITHMETIC.length]
            : bank[i % bank.length];
          return { ...base, id: i + 1 };
        }),
      );
      setScreen("quiz");
      setToast("🎮 Luyện tập tự do: 20 câu đủ dạng trả lời, không ảnh hưởng hành trình và chỉ số.");
      return;
    }
    if (mode === "journey" && journeyLocked()) {
      setToast("Chỉ số thông minh đang quá thấp (dưới 50/100). Hãy vào Ôn tập để lấy lại điểm rồi quay lại hành trình nhé!");
      setView("exercises");
      return;
    }
    setQuizMode(mode);
    setJourneyFailed(false);
    setSkipEligible(false);
    const lesson = lessonNumber ? lessonForMapPad(lessonNumber) : currentLesson();
    setQuizLesson({ level: lesson.level, lessonTitle: lesson.lessonTitle });
    const isJourney = mode === "journey";
    const topic = isJourney ? `${lesson.lessonTitle} — ${lesson.levelMeta.title}` : `Ôn tập — ${lesson.lessonTitle}`;
    const intelligenceScore = evaluation?.intelligenceScore ?? 50;
    let difficulties: Array<"A" | "B" | "C" | "D" | "E">;
    if (!isJourney) {
      difficulties = ["A", "B"];
    } else if (attemptMode === "hard") {
      difficulties = intelligenceScore >= 60 ? ["C", "D", "E"] : ["B", "C", "D"];
    } else {
      difficulties = evaluation?.recommendedDifficulties?.length
        ? evaluation.recommendedDifficulties
        : difficultiesForScore(intelligenceScore);
    }
    const generationId = ++quizGenerationId.current;
    quizInteracted.current = false;
    const questionBank = FILTERED_BANK.length ? FILTERED_BANK : questions;
    const excludePrompts = [...seenQuizPrompts.current].slice(-40);
    const fallbackQuestions = makeFreshFallbackQuestions(questionBank, seenQuizPrompts.current, 10);
    fallbackQuestions.forEach((question) => seenQuizPrompts.current.add(questionPromptKey(question.prompt)));
    setQuizQuestions(fallbackQuestions);
    setScreen("quiz");
    setToast("Đang tạo đề bằng Ollama; bạn có thể bắt đầu học ngay.");

    void (async () => {
      try {
      const generated = await smartLotusApi.generateQuiz({
        topic,
        curriculumLevel: lesson.level,
        difficulties,
        count: 10,
        intelligenceScore,
        variationSeed: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        excludePrompts,
      });
      if (generationId !== quizGenerationId.current || quizInteracted.current) return;
      const uniqueQuestions = new Map<string, QuizQuestion>();
      generated.questions.filter(isAllowedQuestion).forEach((question) => {
        const key = questionPromptKey(question.prompt);
        if (!seenQuizPrompts.current.has(key) && !uniqueQuestions.has(key)) uniqueQuestions.set(key, question);
      });
      const aiQuestions = [...uniqueQuestions.values()].slice(0, 10);
      const selectedPrompts = new Set([...seenQuizPrompts.current, ...aiQuestions.map((question) => questionPromptKey(question.prompt))]);
      const fallbackFill = makeFreshFallbackQuestions(questionBank, selectedPrompts, 10 - aiQuestions.length);
      const finalQuestions = [...aiQuestions, ...fallbackFill].map((question, index) => ({ ...question, id: index + 1 }));
      if (finalQuestions.length === 10) {
        finalQuestions.forEach((question) => seenQuizPrompts.current.add(questionPromptKey(question.prompt)));
        setQuizQuestions(finalQuestions);
      }
      setToast(
        generated.source === "ai" && aiQuestions.length === 10
          ? isJourney
            ? attemptMode === "hard"
              ? `Đã tạo đề bàn khó cho "${lesson.lessonTitle}" bằng Ollama`
              : attemptMode === "retry"
                ? `Đã tạo đề làm lại "${lesson.lessonTitle}" bằng Ollama`
                : `Đã tạo đề "${lesson.lessonTitle}" (chỉ số ${intelligenceScore}/100) bằng Ollama`
            : "Đã tạo đề ôn tập 10 câu bằng Ollama"
          : generated.source === "ai"
            ? `AI chỉ tạo được ${aiQuestions.length}/10 câu; đã bổ sung câu hỏi có sẵn`
            : "AI chưa tạo được đề hợp lệ; đang dùng câu hỏi có sẵn"
      );
      } catch {
        if (generationId === quizGenerationId.current && !quizInteracted.current) {
          setToast("Ollama chưa phản hồi; đang dùng câu hỏi có sẵn");
        }
      }
    })();
  }

  async function refreshEvaluation(placementResult: PlacementResult, attempts: AttemptSummary[]): Promise<PathEvaluation | null> {
    if (!placementResult) return null;
    try {
      const { evaluation: nextEvaluation } = await smartLotusApi.evaluatePath({ placement: placementResult, attempts });
      setEvaluation(nextEvaluation);
      return nextEvaluation;
    } catch {
      const localEvaluation = evaluatePathLocal(placementResult, attempts);
      setEvaluation(localEvaluation);
      return localEvaluation;
    }
  }

  async function beginSurvey() {
    // Tài khoản mới: làm mới hoàn toàn hành trình ếch, chỉ số thông minh và điểm sen.
    setPlacement(null);
    setEvaluation(null);
    setAttemptHistory([]);
    setStudyStreak(0);
    setInitialIntel(50);

    setLoading(true);
    try {
      const generated = await smartLotusApi.generateSurvey(30);
      if (!generated.questions.length) throw new Error("Không nhận được câu hỏi khảo sát");
      setSurveyQuestions(generated.questions);
      setScreen("survey");
      setToast(generated.source === "ai" ? "Đã tạo đề khảo sát 30 câu bằng Ollama" : "Đang dùng đề khảo sát dự phòng");
    } catch {
      setSurveyQuestions(null);
      setScreen("app");
      setView("home");
      setToast("Chưa tạo được đề khảo sát, bạn có thể bắt đầu học luôn");
    } finally {
      setLoading(false);
    }
  }

  async function finishSurvey(surveyPlacement: PlacementResult) {
    setPlacement(surveyPlacement);
    setSurveyQuestions(null);
    setScreen("app");
    setView("roadmap");
    const levelMeta = curriculum[surveyPlacement.level - 1] ?? curriculum[0];
    const lessonTitle = levelMeta.lessons[Math.min(surveyPlacement.lessonIndex, levelMeta.lessons.length - 1)];
    setToast(`Khảo sát xong! Bạn bắt đầu từ Level ${surveyPlacement.level} — ${lessonTitle}`);
    let placementSaved = false;
    try {
      await smartLotusApi.savePlacement(surveyPlacement);
      placementSaved = true;
    } catch {
      /* kết quả vẫn giữ trên thiết bị nếu server tạm thời không sẵn sàng */
    }
    await supabase.auth.updateUser({ data: { placement: surveyPlacement } }).catch(() => undefined);
    if (!placementSaved) setToast("Khảo sát đã xong nhưng chưa đồng bộ được lên máy chủ. Hãy giữ trang này mở và thử đăng nhập lại.");
    const initialEvaluation = evaluatePathLocal(surveyPlacement, []);
    setInitialIntel(initialEvaluation.intelligenceScore);
    setEvaluation(initialEvaluation);
    void refreshEvaluation(surveyPlacement, attemptHistory);
    await loadDashboard("student");
  }

  function exitQuiz() {
    quizGenerationId.current += 1;
    if (quizMode === "assignment") {
      setQuizQuestions(questions);
      setActiveAssignment(null);
      setScreen("app");
      setView("classrooms");
      return;
    }
    if (quizMode === "demo") {
      setQuizQuestions(questions);
      setScreen("app");
      setView("exercises");
      setToast("Đã thoát luyện tập tự do.");
      return;
    }
    setEvaluation((prev) => {
      const next = prev ? { ...prev, intelligenceScore: Math.max(0, prev.intelligenceScore - 5) } : prev;
      return next;
    });
    setQuizQuestions(questions);
    setScreen("app");
    setView("exercises");
    setToast("Đã thoát bài. Chỉ số thông minh bị trừ 5 điểm.");
  }

  if (screen === "guide") {
    return <OnboardingGuide studentName={greetingName} onStart={() => void beginSurvey()} />;
  }

  if (screen === "survey" && surveyQuestions) {
    return (
      <PlacementSurvey
        questions={surveyQuestions}
        studentName={greetingName}
        onExit={() => {
          setSurveyQuestions(null);
          setScreen("app");
          setView("home");
          void loadDashboard("student");
        }}
        onComplete={finishSurvey}
      />
    );
  }

  if (screen === "quiz") {
    return (
      <QuizExperience
        quizQuestions={quizQuestions}
        onExit={exitQuiz}
        onComplete={completeQuiz}
        onInteract={() => {
          quizInteracted.current = true;
        }}
        isDemo={quizMode === "demo"}
        isAssignment={quizMode === "assignment"}
      />
    );
  }

  if (screen === "result" && result) {
    return (
      <ResultScreen
        result={result}
        journeyFailed={journeyFailed}
        skipEligible={skipEligible}
        onSkip={skipLesson}
        onHome={() => {
          setScreen("app");
          setView(quizMode === "assignment" ? "classrooms" : "home");
          if (quizMode === "assignment") setActiveAssignment(null);
          else void loadDashboard("student");
        }}
        onRetry={() => {
          if (quizMode === "demo") {
            setScreen("quiz");
            return;
          }
          if (quizMode === "assignment" && activeAssignment?.questions) {
            setQuizQuestions(activeAssignment.questions);
            setScreen("quiz");
            return;
          }
          void startQuiz(quizMode, quizLessonNumber.current, "retry");
        }}
        onPrevious={() => {
          setScreen("app");
          setView(quizMode === "assignment" ? "classrooms" : "exercises");
          if (quizMode === "assignment") setActiveAssignment(null);
          else setToast("Hãy ôn lại bài trước: Đếm và so sánh số");
        }}
        onNext={() => {
          if (quizMode === "assignment") {
            setScreen("app");
            setView("classrooms");
            setActiveAssignment(null);
            return;
          }
          if (dashboard.lowScoreAttempts > 3) {
            setToast("Bạn cần ôn lại bài trước khi mở bài tiếp theo.");
            return;
          }
          setScreen("app");
          setView("exercises");
          setToast("Bài tiếp theo: Trừ trong phạm vi 10");
        }}
        nextLocked={dashboard.lowScoreAttempts > 3}
      />
    );
  }

  if (!authenticated) {
    return <AuthScreen onAuthenticated={completeAuthentication} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-head">
          <LotusLogo />
          <button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><Icon name="close" /></button>
        </div>
        <nav className="main-nav" aria-label="Điều hướng chính">
          {role === "student" ? (
            navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => { setView(item.id); setMobileOpen(false); }}
              >
                <Icon name={item.icon} size={21} />
                <span>{item.label}</span>
                {item.id === "compete" && <span className="nav-dot" />}
              </button>
            ))
          ) : role === "teacher" ? (
            <>
              <button className={`nav-item ${teacherView === "overview" ? "active" : ""}`} onClick={() => { setTeacherView("overview"); setMobileOpen(false); }}><Icon name="chart" /><span>Tổng quan lớp</span></button>
              <button className={`nav-item ${teacherView === "classes" ? "active" : ""}`} onClick={() => { setTeacherView("classes"); setMobileOpen(false); }}><Icon name="school" /><span>Lớp học</span></button>
              <button className={`nav-item ${teacherView === "assignments" ? "active" : ""}`} onClick={() => { setTeacherView("assignments"); setMobileOpen(false); }}><Icon name="book" /><span>Bài tập</span></button>
              <button className="nav-item"><Icon name="wand" /><span>Tạo câu hỏi AI</span><span className="soon-chip">Sớm</span></button>
            </>
          ) : (
            <>
              <button className="nav-item active"><Icon name="chart" /><span>Tổng quan</span></button>
              <button className="nav-item"><Icon name="users" /><span>Người dùng</span></button>
              <button className="nav-item"><Icon name="book" /><span>Nội dung</span></button>
              <button className="nav-item"><Icon name="database" /><span>Dữ liệu</span></button>
              <button className="nav-item"><Icon name="settings" /><span>Cấu hình</span></button>
            </>
          )}
        </nav>
        <div className="sidebar-promo">
          <div className="promo-orbit"><Icon name="sparkles" size={25} /></div>
          <strong>{role === "student" ? "Mục tiêu hôm nay" : "Smart Lotus 1.0"}</strong>
          <p>{role === "student" ? `Đã học ${Math.round(todayGoal.minutes)}/20 phút · Chuỗi ${studyStreak} ngày` : "Hệ thống đang hoạt động ổn định."}</p>
          <div className="mini-progress"><span style={{ width: role === "student" ? `${Math.min(100, (todayGoal.minutes / 20) * 100)}%` : "100%" }} /></div>
          <small>{role === "student" ? `🎯 Độ chính xác ${todayGoal.attempts ? Math.round(todayGoal.accuracySum / todayGoal.attempts) : 0}% · Đúng ${todayGoal.correctAnswers} câu` : "Tất cả dịch vụ sẵn sàng"}</small>
        </div>
        {role === "student" && (
          <div className="sidebar-intel" style={{ margin: "14px 0 0", padding: 14, borderRadius: 15, background: "linear-gradient(145deg,#f4edff,#fbf9ff)", border: "1px solid #e8dcff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 8.5, fontWeight: 800, letterSpacing: .6, color: "#7c3aed" }}><Icon name="sparkles" size={13} /> CHỈ SỐ THÔNG MINH</span>
              <strong style={{ fontSize: 15, color: "#6d28d9" }}>{evaluation?.intelligenceScore ?? "—"}<span style={{ fontSize: 9, color: "#9b8daf" }}> /100</span></strong>
            </div>
            <div className="mini-progress" style={{ marginTop: 8 }}><i style={{ width: `${evaluation?.intelligenceScore ?? 0}%`, background: "linear-gradient(90deg,#8b5cf6,#ec4899)" }} /></div>
            {studyStreak > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, fontWeight: 700, color: "#e87926" }}>
                <span>🔥 Chuỗi {studyStreak} ngày</span>
                <span>{dashboard.user.lotusPoints.toLocaleString("vi-VN")} 🌸</span>
              </div>
            )}
          </div>
        )}
        <div className="sidebar-footer"><span>© 2026 Smart Lotus</span><button>Trợ giúp</button></div>
      </aside>

      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" />}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Icon name="menu" /></button>
            <div className="mobile-logo"><LotusLogo compact /></div>
            <div className="page-heading">
              <span>{role === "student" ? "Không gian học tập" : role === "teacher" ? "Trung tâm giáo viên" : "Bảng điều hành"}</span>
              <strong>{role === "student" ? navItems.find((item) => item.id === view)?.label : role === "teacher" ? teacherView === "overview" ? "Tổng quan lớp" : teacherView === "classes" ? "Lớp học" : "Bài tập" : "Quản trị hệ thống"}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            {role === "student" && (
              <>
                <div className="streak-pill"><Icon name="flame" size={19} /><strong>{studyStreak}</strong><span>ngày</span></div>
                <button className="points-pill" onClick={() => setView("achievements")} aria-label="Xem điểm sen và thành tích"><span style={{ fontSize: 15 }}>🌸</span><strong>{dashboard.user.lotusPoints.toLocaleString("vi-VN")}</strong><span>điểm sen</span></button>
              </>
            )}
            <button className="icon-button notification-button" aria-label={role === "student" ? "Xem lời mời vào lớp" : "Thông báo"} onClick={() => { if (role === "student") setView("classrooms"); }}><Icon name="bell" /><span /></button>
            <div className="profile-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
                {dashboard.user.avatarUrl ? <img className="avatar avatar-image" src={dashboard.user.avatarUrl} alt="Avatar" /> : <span className="avatar">{dashboard.user.avatar}</span>}
                <span className="profile-copy"><strong>{dashboard.user.displayName}</strong><small>{role === "student" ? "Học sinh · Lớp 1A" : role === "teacher" ? "Giáo viên chủ nhiệm" : "Quản trị hệ thống"}</small></span>
                <Icon name="chevron" size={16} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <button onClick={openProfileEditor}><Icon name="settings" /> Thông tin cá nhân</button>
                  <button className="profile-signout" onClick={signOut}><Icon name="logout" /> Đăng xuất</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className="content-area"
          style={role === "student" && view === "exercises" ? { paddingBottom: 10 } : undefined}
        >
          {loading && <div className="loading-line" />}
          {role === "student" ? (
            <StudentContent view={view} dashboard={dashboard} greetingName={greetingName} todayLabel={todayLabel} evaluation={evaluation} initialIntel={initialIntel} todayGoal={todayGoal} studyStreak={studyStreak} attemptHistory={attemptHistory} onStartQuiz={(lessonNumber, attemptMode) => void startQuiz("journey", lessonNumber, attemptMode)} onStartReview={() => void startQuiz("review")} onStartDemo={() => void startQuiz("demo")} onOpenExercises={() => setView("exercises")} onOpenCompetition={() => setView("compete")} onStartAssignment={startAssignment} />
          ) : role === "teacher" ? (
            teacherView === "overview" ? (
              <TeacherOverview
                teacherName={dashboard.user.displayName}
                onToast={setToast}
                onCreateAssignment={() => setTeacherView("assignments")}
                onSendNotification={(title, description) => setToast(`Đã gửi thông báo: ${title} — ${description}`)}
              />
            ) : teacherView === "classes" ? (
              <Classroom />
            ) : (
              <AssignmentBuilder onBack={() => setTeacherView("overview")} onToast={setToast} />
            )
          ) : (
            <AdminDashboard />
          )}
        </main>
      </div>
      {profileEditorOpen && <ProfileEditor user={dashboard.user} onClose={() => setProfileEditorOpen(false)} onSaved={updateProfile} />}
      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
    </div>
  );
}

function ProfileEditor({ user, onClose, onSaved }: { user: DashboardData["user"]; onClose: () => void; onSaved: (displayName: string, avatarUrl: string, pendingEmail?: string) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [error, setError] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn một tệp hình ảnh.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh phải nhỏ hơn 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setError("Tên hiển thị phải có ít nhất 2 ký tự.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/i.test(normalizedEmail)) {
      setError("Email phải là địa chỉ Gmail hợp lệ, ví dụ: ban@gmail.com.");
      return;
    }
    const emailChanged = normalizedEmail !== user.email.toLowerCase();
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({
      ...(emailChanged ? { email: normalizedEmail } : {}),
      data: {
        displayName: trimmedName,
        firstName: trimmedName.split(/\s+/).pop(),
      },
    });
    if (!updateError) {
      try {
        await smartLotusApi.updateProfile({ displayName: trimmedName, avatarUrl });
      } catch {
        setSaving(false);
        setError("Thông tin Auth đã cập nhật nhưng hồ sơ học tập chưa đồng bộ. Vui lòng thử lại.");
        return;
      }
    }
    setSaving(false);
    if (updateError) {
      setError("Không thể lưu thông tin. Vui lòng thử lại.");
      return;
    }
    onSaved(trimmedName, avatarUrl, emailChanged ? normalizedEmail : undefined);
  }

  async function sendEmailVerification() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/i.test(normalizedEmail)) {
      setError("Email phải là địa chỉ Gmail hợp lệ, ví dụ: ban@gmail.com.");
      return;
    }
    if (normalizedEmail === user.email.toLowerCase()) {
      setError("Hãy nhập email mới trước khi xác minh.");
      return;
    }
    setSendingVerification(true);
    setError("");
    setVerificationNotice("");
    const { error: verificationError } = await supabase.auth.updateUser({ email: normalizedEmail });
    setSendingVerification(false);
    if (verificationError) {
      setError("Không thể gửi email xác minh. Hãy kiểm tra email hoặc thử lại sau.");
      return;
    }
    setVerificationNotice("Đã gửi thư xác minh. Hãy bấm đường link trong Gmail, sau đó tải lại trang.");
  }

  return (
    <div className="profile-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <div className="profile-editor-heading"><div><span className="section-kicker">HỒ SƠ CÁ NHÂN</span><h2 id="profile-editor-title">Thông tin của bạn</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" size={17} /></button></div>
        <div className="profile-preview">
          {avatarUrl ? <img className="profile-preview-avatar avatar-image" src={avatarUrl} alt="Avatar xem trước" /> : <span className="profile-preview-avatar">{user.avatar}</span>}
          <label className="avatar-upload">Đổi avatar<input type="file" accept="image/*" onChange={handleAvatarChange} /></label>
        </div>
        <form className="profile-editor-form" onSubmit={saveProfile}>
          <label>Tên hiển thị<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label>Email mới<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setVerificationNotice(""); }} /></label>
          {email.trim().toLowerCase() !== user.email.toLowerCase() && <><button className="verify-email-button" type="button" onClick={sendEmailVerification} disabled={sendingVerification}>{sendingVerification ? "Đang gửi..." : "Gửi email xác minh"}<Icon name="mail" size={14} /></button><p className="profile-email-notice"><Icon name="mail" size={14} /> Email mới chỉ có hiệu lực sau khi bạn bấm link xác minh được gửi về hộp thư.</p></>}
          {verificationNotice && <p className="profile-email-success" role="status"><Icon name="check" size={14} />{verificationNotice}</p>}
          <label>Đối tượng<input value={user.role === "student" ? "Học sinh" : user.role === "teacher" ? "Giáo viên" : "Quản trị viên"} readOnly /></label>
          {error && <p className="auth-error" role="alert"><Icon name="close" size={14} />{error}</p>}
          <div className="profile-editor-actions"><button className="secondary-button" type="button" onClick={onClose}>Hủy</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
        </form>
      </section>
    </div>
  );
}

type RegistrationWard = { name: string; code: number };
type RegistrationProvince = { name: string; code: number; wards: RegistrationWard[] };
type RegistrationSchoolLevel = "primary" | "lowerSecondary" | "upperSecondary" | "integrated";

const REGISTRATION_GRADES = Array.from({ length: 12 }, (_, i) => `Khối ${i + 1}`);
const REGISTRATION_GRADES_BY_LEVEL: Record<RegistrationSchoolLevel, string[]> = {
  primary: REGISTRATION_GRADES.slice(0, 5),
  lowerSecondary: REGISTRATION_GRADES.slice(5, 9),
  upperSecondary: REGISTRATION_GRADES.slice(9, 12),
  integrated: REGISTRATION_GRADES,
};
const REGISTRATION_DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const REGISTRATION_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const REGISTRATION_YEARS = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() - i));

function AuthScreen({ onAuthenticated }: { onAuthenticated: (role: Role, firstName?: string, justRegistered?: boolean) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [school, setSchool] = useState("");
  const [schoolLevel, setSchoolLevel] = useState<RegistrationSchoolLevel | "">("");
  const [grade, setGrade] = useState("");
  const [className, setClassName] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [registrationProvinces, setRegistrationProvinces] = useState<RegistrationProvince[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("https://provinces.open-api.vn/api/v2/?depth=2")
      .then((response) => {
        if (!response.ok) throw new Error("Address data request failed");
        return response.json() as Promise<RegistrationProvince[]>;
      })
      .then((data) => {
        if (!active) return;
        setRegistrationProvinces(data);
      })
      .catch(() => {
        if (active) setLocationsError("Không tải được danh mục tỉnh/thành, xã/phường. Vui lòng tải lại trang.");
      })
      .finally(() => {
        if (active) setLocationsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const roleOptions: Array<{ role: Role; title: string; description: string; icon: IconName }> = [
    { role: "student", title: "Học sinh", description: "Học bài, luyện tập và chinh phục thành tích", icon: "book" },
    { role: "teacher", title: "Giáo viên", description: "Theo dõi lớp học và hỗ trợ học sinh", icon: "school" },
    { role: "admin", title: "Quản trị viên", description: "Vận hành nội dung và hệ thống Smart Lotus", icon: "shield" },
  ];
  const visibleRoleOptions = mode === "register" ? roleOptions.filter((option) => option.role !== "admin") : roleOptions;
  const availableGrades = schoolLevel ? REGISTRATION_GRADES_BY_LEVEL[schoolLevel] : REGISTRATION_GRADES;

  function changeAuthMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setShowRecovery(false);
    if (nextMode === "register" && selectedRole === "admin") setSelectedRole(null);
  }

  function getSavedRole(metadata: Record<string, unknown>, fallback?: string | null): Role {
    const savedRole = metadata.role;
    if (savedRole === "student" || savedRole === "teacher" || savedRole === "admin") return savedRole;
    if (fallback === "student" || fallback === "teacher" || fallback === "admin") return fallback;
    return "student";
  }

  function isValidGmail(value: string) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(value.trim());
  }

  function isValidPassword(value: string) {
    return value.length >= 9 && /[A-Za-z]/.test(value) && /\d/.test(value);
  }

  function getAuthErrorMessage(message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes("email signups are disabled") || normalized.includes("signup is disabled")) return "Supabase đang tắt đăng ký email. Hãy bật Enable email provider và Allow new users to sign up.";
    if (normalized.includes("error sending confirmation email")) return "Supabase không gửi được email xác nhận. Hãy cấu hình SMTP hoặc tắt Confirm email trong Supabase rồi thử lại.";
    if (normalized.includes("email rate limit exceeded")) return "Supabase đang giới hạn gửi email. Hãy thử lại sau ít phút hoặc cấu hình SMTP riêng.";
    if (normalized.includes("redirect url") || normalized.includes("invalid redirect")) return "URL chuyển hướng chưa được cho phép trong Supabase Authentication → URL Configuration.";
    if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) return "Không kết nối được Supabase. Hãy khởi động lại dev server sau khi sửa .env.local.";
    if (normalized.includes("invalid login credentials")) return "Email hoặc mật khẩu không đúng.";
    if (normalized.includes("email not confirmed")) return "Email chưa được xác minh. Hãy kiểm tra hộp thư của bạn.";
    if (normalized.includes("user already registered") || normalized.includes("already been registered")) return "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.";
    if (normalized.includes("password should be at least") || normalized.includes("password must")) return "Mật khẩu cần ít nhất 9 ký tự, gồm chữ cái và số.";
    if (normalized.includes("invalid email")) return "Địa chỉ email không hợp lệ.";
    if (normalized.includes("rate limit") || normalized.includes("too many")) return "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.";
    if (normalized.includes("internal server error") || normalized.includes("status 500")) return "Máy chủ xác thực trả lỗi 500 (Internal Server Error). Nếu dùng SSH tunnel, hãy kiểm tra tunnel tới 127.0.0.1:30800 đang chạy (chạy deploy-k8s/tunnel.ps1).";
    return `Supabase từ chối yêu cầu: ${message}`;
  }

  async function recoverPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidGmail(normalizedEmail)) {
      setError("Nhập đúng địa chỉ Gmail để nhận liên kết khôi phục.");
      emailInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError("");
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: window.location.origin,
    });
    setSubmitting(false);
    if (recoveryError) {
      setError(getAuthErrorMessage(recoveryError.message));
      return;
    }
    setNotice("Nếu Gmail này có tài khoản, liên kết khôi phục đã được gửi. Hãy kiểm tra hộp thư.");
  }

  async function continueWithFacebook() {
    setError("");
    setNotice("");
    if (mode === "register" && !selectedRole) {
      setError("Vui lòng chọn đối tượng sử dụng trước khi tiếp tục.");
      return;
    }
    setSubmitting(true);
    if (selectedRole) window.localStorage.setItem("smart-lotus-role", selectedRole);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) {
      setSubmitting(false);
      setError(getAuthErrorMessage(oauthError.message));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setShowRecovery(false);
    if (mode === "register" && !selectedRole) {
      setError("Vui lòng chọn đối tượng sử dụng trước khi tiếp tục.");
      return;
    }
    if (!email.trim() || !password.trim() || (mode === "register" && (!lastName.trim() || !firstName.trim()))) {
      setError(mode === "login" ? "Vui lòng nhập email và mật khẩu." : "Vui lòng điền đầy đủ thông tin đăng ký.");
      return;
    }
    if (!isValidGmail(email)) {
      setError("Vui lòng nhập đúng địa chỉ Gmail, ví dụ: ban@gmail.com.");
      return;
    }
    if (mode === "register") {
      if (!/^0\d{9}$/.test(phone)) {
        setError("Số điện thoại phải có 10 chữ số và bắt đầu bằng 0.");
        return;
      }
      if (!province || !district || !schoolLevel || !school.trim()) {
        setError("Vui lòng chọn tỉnh/thành phố, xã/phường, cấp trường và nhập tên trường.");
        return;
      }
      if (selectedRole === "student" && (!grade || !className.trim())) {
        setError("Vui lòng chọn khối và nhập lớp học của bạn.");
        return;
      }
      if (!day || !month || !year) {
        setError("Vui lòng chọn ngày, tháng và năm sinh.");
        return;
      }
    }
    if (mode === "register" && !isValidPassword(password)) {
      setError("Mật khẩu phải có ít nhất 9 ký tự, gồm ít nhất 1 chữ cái và 1 chữ số.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "register") {
        if (!selectedRole) throw new Error("Vui lòng chọn đối tượng sử dụng trước khi tiếp tục.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: {
            displayName: `${lastName.trim()} ${firstName.trim()}`,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            role: selectedRole,
            phone,
            province,
            district,
            ward: district,
            school: school.trim(),
            schoolLevel,
            grade,
            className: className.trim(),
            birthDate: `${day}/${month}/${year}`,
          } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          if (selectedRole === "student") window.localStorage.setItem("smart-lotus-pending-survey", "1");
          setNotice("Gmail này có thể đã đăng ký hoặc đang chờ xác minh. Hãy kiểm tra hộp thư hoặc đăng nhập.");
          setShowRecovery(true);
          setMode("login");
          setPassword("");
          return;
        }
        onAuthenticated(selectedRole, firstName, true);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw signInError;
      if (!data.session) throw new Error("Không tạo được phiên đăng nhập");
      const savedRole = getSavedRole(data.user.user_metadata, window.localStorage.getItem("smart-lotus-role"));
      window.localStorage.setItem("smart-lotus-role", savedRole);
      onAuthenticated(savedRole, data.user.user_metadata?.firstName);
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "auth error";
      console.error("Supabase sign-up/sign-in error", authError);
      setShowRecovery(mode === "login" && message.toLowerCase().includes("invalid login"));
      setError(getAuthErrorMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <section className="auth-layout">
        <div className="auth-intro">
          <LotusLogo />
          <span className="auth-kicker"><Icon name="sparkles" size={14} /> HỌC TẬP CÁ NHÂN HÓA</span>
          <h1>Mỗi ngày một bước tiến cùng Smart Lotus.</h1>
          <p>Chọn đúng không gian dành cho bạn để bắt đầu hành trình học tập phù hợp nhất.</p>
          <div className="auth-mascot"><LotusMascot /></div>
        </div>
        <div className="auth-panel">
          <div className="auth-panel-head">
            <div><span className="section-kicker">BẮT ĐẦU NGAY</span><h2>{mode === "login" ? "Chào mừng trở lại" : "Tạo tài khoản mới"}</h2></div>
            <div className="auth-switch" role="tablist" aria-label="Chế độ xác thực">
              <button className={mode === "login" ? "active" : ""} onClick={() => changeAuthMode("login")} type="button">Đăng nhập</button>
              <button className={mode === "register" ? "active" : ""} onClick={() => changeAuthMode("register")} type="button">Đăng ký</button>
            </div>
          </div>
          {mode === "register" && <>
            <div className="auth-role-label"><strong>1. Bạn là ai?</strong><span>Bắt buộc</span></div>
            <div className="auth-role-grid register-role-grid">
              {visibleRoleOptions.map((option) => (
                <button key={option.role} type="button" className={`auth-role ${selectedRole === option.role ? "selected" : ""}`} onClick={() => { setSelectedRole(option.role); setError(""); }} aria-pressed={selectedRole === option.role}>
                  <span className="auth-role-icon"><Icon name={option.icon} size={19} /></span><span><strong>{option.title}</strong><small>{option.description}</small></span>{selectedRole === option.role && <Icon name="check" size={17} />}
                </button>
              ))}
            </div>
          </>}
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-role-label"><strong>{mode === "register" ? "2. Thông tin tài khoản" : "Thông tin tài khoản"}</strong><span>Bảo mật</span></div>
            {mode === "register" && <div className="auth-name-fields"><label>Họ<input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Nguyễn" /></label><label>Tên<input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Minh Anh" /></label></div>}
            <label>Email<input ref={emailInputRef} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.com" /></label>
            {mode === "register" && (
              <label>Số điện thoại<input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0901234567" /></label>
            )}
            {mode === "register" && (
              <div className="auth-register-grid auth-register-grid-3">
                <label>Tỉnh/TP<select value={province} disabled={locationsLoading || Boolean(locationsError)} onChange={(event) => { setProvince(event.target.value); setDistrict(""); setSchool(""); setGrade(""); setClassName(""); }}>
                  <option value="">{locationsLoading ? "Đang tải..." : "Chọn"}</option>
                  {registrationProvinces.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
                </select></label>
                <label>Xã/Phường<select value={district} disabled={!province} onChange={(event) => { setDistrict(event.target.value); setSchool(""); setGrade(""); setClassName(""); }}>
                  <option value="">Chọn</option>
                  {registrationProvinces.find((item) => item.name === province)?.wards.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
                </select></label>
                <label>Cấp trường<select value={schoolLevel} onChange={(event) => { setSchoolLevel(event.target.value as RegistrationSchoolLevel | ""); setGrade(""); setClassName(""); }}>
                  <option value="">Chọn</option>
                  <option value="primary">Tiểu học</option>
                  <option value="lowerSecondary">Trung học cơ sở (THCS)</option>
                  <option value="upperSecondary">Trung học phổ thông (THPT)</option>
                  <option value="integrated">Trường liên cấp / Khác</option>
                </select></label>
              </div>
            )}
            {mode === "register" && <label>Tên trường<input value={school} disabled={!district || !schoolLevel} onChange={(event) => setSchool(event.target.value)} placeholder="Nhập tên trường" /></label>}
            {mode === "register" && selectedRole === "student" && (
              <div className="auth-register-grid">
                <label>Khối<select value={grade} onChange={(event) => setGrade(event.target.value)} disabled={!school || !schoolLevel}>
                  <option value="">Chọn</option>
                  {availableGrades.map((item) => <option key={item} value={item}>{item}</option>)}
                </select></label>
                <label>Lớp<input list="registration-classes" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Ví dụ: 1A" disabled={!grade} />
                  <datalist id="registration-classes">{["A", "B", "C", "D", "E", "F", "G", "H"].map((letter) => <option key={letter} value={`${grade.replace("Khối ", "")}${letter}`} />)}</datalist>
                </label>
              </div>
            )}
            {mode === "register" && (
              <div className="auth-register-grid auth-register-grid-3">
                <label>Ngày<select value={day} onChange={(event) => setDay(event.target.value)}>
                  <option value="">Ngày</option>
                  {REGISTRATION_DAYS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select></label>
                <label>Tháng<select value={month} onChange={(event) => setMonth(event.target.value)}>
                  <option value="">Tháng</option>
                  {REGISTRATION_MONTHS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select></label>
                <label>Năm<select value={year} onChange={(event) => setYear(event.target.value)}>
                  <option value="">Năm</option>
                  {REGISTRATION_YEARS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select></label>
              </div>
            )}
            <label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
            {mode === "register" && locationsError && <p className="auth-error" role="alert">{locationsError}</p>}
            {error && <p className="auth-error" role="alert"><Icon name="close" size={14} />{error}</p>}
            {notice && <p className="auth-notice" role="status"><Icon name="check" size={14} />{notice}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? "Đang xử lý..." : mode === "login" ? "Đăng nhập vào Smart Lotus" : "Tạo tài khoản"}{!submitting && <Icon name="arrow" size={17} />}</button>
            {showRecovery && mode === "login" && <button className="recovery-button" type="button" onClick={recoverPassword} disabled={submitting}><Icon name="lock" size={14} /> Quên tài khoản hoặc mật khẩu?</button>}
          </form>
          <div className="auth-other-methods">
            <span>ĐĂNG NHẬP BẰNG PHƯƠNG THỨC KHÁC</span>
            <div className="auth-method-icons">
              <button className="auth-method-icon facebook-icon" type="button" onClick={continueWithFacebook} disabled={submitting} aria-label="Đăng nhập bằng Facebook" title="Đăng nhập bằng Facebook"><span>f</span></button>
              <button className="auth-method-icon email-icon" type="button" onClick={() => emailInputRef.current?.focus()} aria-label="Đăng nhập bằng email" title="Đăng nhập bằng email"><Icon name="mail" size={19} /></button>
            </div>
          </div>
          <p className="auth-note"><Icon name="shield" size={14} /> Demo trải nghiệm: thông tin chỉ dùng để mở đúng giao diện của bạn.</p>
        </div>
      </section>
    </main>
  );
}

function OnboardingGuide({ studentName, onStart }: { studentName: string; onStart: () => void }) {
  const steps = [
    { icon: "📝", title: "Khảo sát đầu vào", text: "Làm 30 câu để hệ thống đo chỉ số thông minh và chọn điểm bắt đầu phù hợp." },
    { icon: "🐸", title: "Hành trình ếch xanh", text: "Chinh phục 100 bài chia 6 chương theo lộ trình. Bấm lá sen hiện tại để làm bài." },
    { icon: "📚", title: "Ôn tập khi cần", text: "Chỉ số thấp thì vào Ôn tập để lấy lại điểm, đạt 50/100 là mở lại hành trình." },
    { icon: "🌸", title: "Điểm sen và chuỗi ngày", text: "Làm bài kiếm điểm sen, giữ chuỗi ngày học để chỉ số thông minh tăng thêm ở mốc 5, 10, 15 ngày." },
  ];
  return (
    <main className="phase-screen">
      <div className="phase-confetti c1">✦</div><div className="phase-confetti c2">●</div><div className="phase-confetti c3">◆</div>
      <section className="phase-card" style={{ maxWidth: 680 }}>
        <span className="eyebrow purple">CHÀO MỪNG {studentName.toUpperCase()}!</span>
        <h1 style={{ marginTop: 8 }}>Hướng dẫn nhanh Smart Lotus 🎉</h1>
        <p>Chỉ cần vài bước là bạn đã sẵn sàng chinh phục dòng sông tri thức.</p>
        <div style={{ margin: "24px 0", display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          {steps.map((step, index) => (
            <div key={step.title} style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "13px 15px", borderRadius: 14, background: "#f8f5ff", border: "1px solid #eae1fb" }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{step.icon}</span>
              <div>
                <strong style={{ fontSize: 13 }}>{index + 1}. {step.title}</strong>
                <p style={{ margin: "4px 0 0", color: "#817a8b", fontSize: 11, lineHeight: 1.55 }}>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
        <button className="primary-button big" onClick={onStart}><Icon name="play" size={18} /> Bắt đầu khảo sát đầu vào <Icon name="arrow" size={17} /></button>
        <p style={{ margin: "14px 0 0", color: "#9b94a2", fontSize: 9.5 }}>Khảo sát gồm 30 câu · có thể làm lại câu tương tự khi sai</p>
      </section>
    </main>
  );
}

function StudentContent({ view, dashboard, greetingName, todayLabel, evaluation, initialIntel, todayGoal, studyStreak, attemptHistory, onStartQuiz, onStartReview, onStartDemo, onOpenExercises, onOpenCompetition, onStartAssignment }: { view: StudentView; dashboard: DashboardData; greetingName: string; todayLabel: string; evaluation: PathEvaluation | null; initialIntel: number; todayGoal: TodayGoal; studyStreak: number; attemptHistory: AttemptSummary[]; onStartQuiz: (lessonNumber?: number, mode?: AttemptMode) => void; onStartReview: () => void; onStartDemo: () => void; onOpenExercises: () => void; onOpenCompetition: () => void; onStartAssignment: (assignment: Assignment) => void }) {
  const currentIntel = evaluation?.intelligenceScore ?? initialIntel;
  const journeyLocked = initialIntel < 30 && currentIntel < 50;
  if (view === "classrooms") return <StudentClassrooms onStartAssignment={onStartAssignment} />;
  if (view === "exercises") return <ExerciseMapView onStartQuiz={onStartQuiz} onStartReview={onStartReview} onStartDemo={onStartDemo} initialCleared={clearedLessonsBefore(evaluation)} journeyLocked={journeyLocked} intelScore={currentIntel} lotusPoints={dashboard.user.lotusPoints} />;
  if (view === "roadmap") return <RoadmapView onStartQuiz={onStartQuiz} evaluation={evaluation} />;
  if (view === "compete") return <CompetitionView weeklyLeaderboard={dashboard.weeklyLeaderboard} currentAvatar={dashboard.user.avatar} />;
  if (view === "achievements") return <AchievementsView dashboard={dashboard} />;
  return <StudentDashboard dashboard={dashboard} greetingName={greetingName} todayLabel={todayLabel} todayGoal={todayGoal} studyStreak={studyStreak} evaluation={evaluation} attemptHistory={attemptHistory} onStartQuiz={onStartQuiz} onOpenExercises={onOpenExercises} onOpenCompetition={onOpenCompetition} />;
}

function clearedLessonsBefore(evaluation: PathEvaluation | null) {
  const startLevel = evaluation?.startLevel ?? 1;
  const lessonIndex = evaluation?.lessonIndex ?? 0;
  // Bản đồ hành trình có 100 bài chia 6 chương theo lộ trình.
  const mapChapterSize = [17, 17, 17, 17, 16, 16];
  let total = 0;
  for (const item of curriculum) {
    const size = mapChapterSize[item.id - 1] ?? 17;
    if (item.id < startLevel) {
      total += size;
    } else if (item.id === startLevel) {
      total += Math.min(Math.round((lessonIndex / Math.max(1, item.total - 1)) * (size - 1)), size - 1);
    }
  }
  return total;
}

function weeklyMinutes(attempts: AttemptSummary[]) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const today = new Date();
  for (const attempt of attempts) {
    const date = attempt.completedAt ? new Date(attempt.completedAt) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const daysAgo = Math.floor((today.getTime() - date.getTime()) / 86400000);
    if (daysAgo < 0 || daysAgo > 6) continue;
    const index = (date.getDay() + 6) % 7;
    buckets[index] += (attempt.durationSeconds ?? 0) / 60;
  }
  return buckets;
}

function StudentDashboard({ dashboard, greetingName, todayLabel, todayGoal, studyStreak, evaluation, attemptHistory, onStartQuiz, onOpenExercises, onOpenCompetition }: { dashboard: DashboardData; greetingName: string; todayLabel: string; todayGoal: TodayGoal; studyStreak: number; evaluation: PathEvaluation | null; attemptHistory: AttemptSummary[]; onStartQuiz: () => void; onOpenExercises: () => void; onOpenCompetition: () => void }) {
  const todayMinutes = todayGoal.minutes;
  const todayPoints = todayGoal.points;
  const todayCorrect = todayGoal.correctAnswers;
  const todayAccuracy = todayGoal.attempts ? Math.round(todayGoal.accuracySum / todayGoal.attempts) : 0;
  const journeyCleared = clearedLessonsBefore(evaluation);
  const overallAccuracy = attemptHistory.length
    ? Math.round(
        (attemptHistory.reduce((sum, attempt) => sum + (attempt.totalQuestions ? attempt.correctAnswers / attempt.totalQuestions : 0), 0) / attemptHistory.length) * 100
      )
    : 0;
  const weekly = weeklyMinutes(attemptHistory);
  const totalWeekMinutes = Math.round(weekly.reduce((sum, minutes) => sum + minutes, 0));
  const averageWeekMinutes = Math.round(totalWeekMinutes / 7);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const activeLevel = evaluation?.startLevel ?? 1;
  const nextLevelMeta = curriculum[activeLevel - 1] ?? curriculum[0];
  const nextLessonIndex = Math.min(evaluation?.lessonIndex ?? 0, nextLevelMeta.lessons.length - 1);
  const nextLessonTitle = nextLevelMeta.lessons[nextLessonIndex];
  const dailyCorrectGoal = 30;
  const dailyPointGoal = 3000;
  const completedTasks = [todayMinutes >= 20, todayCorrect >= dailyCorrectGoal, todayPoints >= dailyPointGoal].filter(Boolean).length;
  const rankedStudents = dashboard.weeklyLeaderboard.length ? dashboard.weeklyLeaderboard : leaderboard.map((person) => ({ name: person.name, avatar: person.avatar, points: person.points, isCurrentUser: person.avatar === dashboard.user.avatar }));
  return (
    <>
      <section className="welcome-banner">
        <div className="banner-decoration one" /><div className="banner-decoration two" />
        <div className="welcome-copy">
          <span className="eyebrow"><Icon name="sparkles" size={16} /> {todayLabel || "Hôm nay"}</span>
          <h1>Chào buổi sáng, {greetingName}! <span>👋</span></h1>
          <p>Mỗi bài toán là một cánh sen mới. Cùng khám phá bài học hôm nay nhé!</p>
          <div className="banner-actions">
            <button className="primary-button light" onClick={onStartQuiz}><Icon name="play" size={18} /> Tiếp tục học</button>
            <span><Icon name="clock" size={17} /> Còn khoảng 8 phút</span>
          </div>
        </div>
        <div className="welcome-mascot"><LotusMascot /></div>
      </section>

      <section className="stat-grid" aria-label="Thống kê học tập">
        <StatCard icon="book" tone="purple" value={`${journeyCleared}/40`} label="Bài học hoàn thành" change={`${attemptHistory.length} bài luyện gần đây`} />
        <StatCard icon="target" tone="green" value={`${overallAccuracy}%`} label="Độ chính xác" change={attemptHistory.length ? `Từ ${attemptHistory.length} bài làm` : "Chưa có bài làm mới"} />
        <StatCard icon="flame" tone="orange" value={`${studyStreak} ngày`} label="Chuỗi học liên tục" change="Cập nhật theo hoạt động học" />
        <StatCard icon="gem" tone="pink" value={dashboard.user.lotusPoints.toLocaleString("vi-VN")} label="Điểm hoa sen" change="Tổng điểm tích lũy" />
      </section>

      <div className="dashboard-grid">
        <section className="card current-lesson-card">
          <div className="card-heading">
            <div><span className="section-kicker">BÀI HỌC TIẾP THEO</span><h2>Cùng học tiếp nào!</h2></div>
            <button className="text-button" onClick={onOpenExercises}>Xem lộ trình <Icon name="arrow" size={16} /></button>
          </div>
          <div className="lesson-feature">
            <div className="lesson-art">
              <div className="math-orb">{activeLevel}<span>✦</span></div>
              <span className="float-symbol s1">+</span><span className="float-symbol s2">=</span><span className="float-symbol s3">🐸</span>
            </div>
            <div className="lesson-info">
              <div className="lesson-tags"><span>LEVEL {activeLevel}</span><span><Icon name="target" size={13} /> 10 câu AI</span></div>
              <h3>{nextLessonTitle}</h3>
              <p>{nextLevelMeta.competency}</p>
              <div className="progress-label"><span>Tiến độ bài học</span><strong>{nextLessonIndex}/{nextLevelMeta.total} dạng</strong></div>
              <div className="progress-bar"><span style={{ width: `${(nextLessonIndex / Math.max(1, nextLevelMeta.total)) * 100}%` }} /></div>
              <button className="primary-button" onClick={onStartQuiz}>Học ngay <Icon name="arrow" size={18} /></button>
            </div>
          </div>
        </section>

        <section className="card daily-card">
          <div className="card-heading"><div><span className="section-kicker">NHIỆM VỤ</span><h2>Mục tiêu hôm nay</h2></div><span className="task-score">{completedTasks}/3</span></div>
          <div className="task-list">
            <TaskItem icon="clock" tone="purple" title="Học đủ 20 phút" progress={Math.min(100, todayMinutes * 5)} meta={`${Math.round(todayMinutes)} / 20 phút · làm nhanh được cộng thêm`} done={todayMinutes >= 20} />
            <TaskItem icon="target" tone="green" title={`Đúng ${dailyCorrectGoal} câu hôm nay`} progress={Math.min(100, (todayCorrect / dailyCorrectGoal) * 100)} meta={todayCorrect >= dailyCorrectGoal ? "Đã hoàn thành" : `${Math.min(todayCorrect, dailyCorrectGoal)} / ${dailyCorrectGoal} câu đúng`} done={todayCorrect >= dailyCorrectGoal} />
            <TaskItem icon="gem" tone="orange" title={`Kiếm ${dailyPointGoal.toLocaleString("vi-VN")} điểm sen`} progress={Math.min(100, (todayPoints / dailyPointGoal) * 100)} meta={`${Math.min(todayPoints, dailyPointGoal).toLocaleString("vi-VN")} / ${dailyPointGoal.toLocaleString("vi-VN")} điểm`} done={todayPoints >= dailyPointGoal} />
          </div>
          <div className="reward-note"><span>🔥</span><div><strong>Chuỗi {studyStreak} ngày · Độ chính xác {todayAccuracy}%</strong><p>Làm bài càng nhanh, càng được cộng thêm phút vào mục tiêu.</p></div></div>
        </section>
      </div>

      <div className="dashboard-grid lower-grid">
        <section className="card activity-card">
          <div className="card-heading"><div><span className="section-kicker">HOẠT ĐỘNG</span><h2>Nhịp học tuần này</h2></div><button className="period-button">7 ngày qua <Icon name="chevron" size={15} /></button></div>
          <div className="chart-wrap">
            <div className="chart-scale"><span>30p</span><span>20p</span><span>10p</span><span>0p</span></div>
            <div className="bar-chart">
              {weekly.map((minutes, index) => (
                <div className="bar-column" key={index}><div className={`chart-bar ${index === todayIndex ? "peak" : ""}`} style={{ height: `${Math.max(2, Math.min(30, minutes)) * 3}px` }}>{index === todayIndex && <span>{Math.round(minutes)}p</span>}</div><small>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"][index]}</small></div>
              ))}
            </div>
          </div>
          <div className="chart-summary"><span><i /> Tổng thời gian: <strong>{Math.floor(totalWeekMinutes / 60) > 0 ? `${Math.floor(totalWeekMinutes / 60)} giờ ${totalWeekMinutes % 60} phút` : `${totalWeekMinutes} phút`}</strong></span><span>Trung bình <strong>{averageWeekMinutes} phút/ngày</strong></span></div>
        </section>

        <section className="card rank-card">
          <div className="card-heading"><div><span className="section-kicker">XẾP HẠNG TUẦN</span><h2>Vườn sen chăm chỉ</h2></div><button className="text-button" onClick={onOpenCompetition}>Xem tất cả <Icon name="arrow" size={14} /></button></div>
          <div className="mini-leaderboard">
            {rankedStudents.slice(0, 4).map((person, index) => (
              <div className={`rank-row ${person.isCurrentUser ? "is-me" : ""}`} key={person.name}>
                <span className={`rank-number rank-${index + 1}`}>{index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span>
                <span className="small-avatar" style={{ background: ["#f59e0b", "#14b8a6", "#3b82f6", "#8b5cf6"][index] }}>{person.avatar}</span>
                <div><strong>{person.name}{person.isCurrentUser && <em>Bạn</em>}</strong><small>Lớp 1A</small></div>
                <b>{person.points.toLocaleString("vi-VN")} <Icon name="gem" size={13} /></b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ icon, tone, value, label, change }: { icon: IconName; tone: string; value: string; label: string; change: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon name={icon} /></span><div><strong>{value}</strong><p>{label}</p><small>{change}</small></div></article>;
}

function TaskItem({ icon, tone, title, progress, meta, done = false }: { icon: IconName; tone: string; title: string; progress: number; meta: string; done?: boolean }) {
  return <div className="task-item"><span className={`task-icon ${tone}`}>{done ? <Icon name="check" /> : <Icon name={icon} />}</span><div className="task-copy"><div><strong>{title}</strong><small className={done ? "done-text" : ""}>{meta}</small></div><div className="task-progress"><span style={{ width: `${progress}%` }} /></div></div></div>;
}

function RoadmapView({ onStartQuiz, evaluation }: { onStartQuiz: () => void; evaluation: PathEvaluation | null }) {
  const startLevel = evaluation?.startLevel ?? 1;
  const lessonIndex = evaluation?.lessonIndex ?? 0;
  const intelligenceScore = evaluation?.intelligenceScore ?? 0;
  const [expanded, setExpanded] = useState(startLevel);

  const levelProgress = (levelId: number) => {
    const level = curriculum[levelId - 1];
    if (levelId < startLevel) return { completed: level.total, isCurrent: false, locked: false, complete: true };
    if (levelId === startLevel) return { completed: Math.min(lessonIndex, level.total), isCurrent: true, locked: false, complete: false };
    return { completed: 0, isCurrent: false, locked: true, complete: false };
  };

  const completedLessons = curriculum.reduce(
    (sum, level) => sum + (level.id < startLevel ? level.total : level.id === startLevel ? Math.min(lessonIndex, level.total) : 0),
    0
  );
  const totalLessons = curriculum.reduce((sum, level) => sum + level.total, 0);
  const percent = Math.round((completedLessons / totalLessons) * 100);

  return (
    <div className="view-stack">
      <section className="page-intro roadmap-intro">
        <div>
          <span className="eyebrow purple"><Icon name="map" size={16} /> LỘ TRÌNH TOÁN LỚP 1</span>
          <h1>Vườn tri thức của bạn</h1>
          <p>{evaluation?.summary ?? "Hoàn thành từng chặng để những cánh sen tri thức cùng nở rộ."}</p>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, maxWidth: 520, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", color: "var(--purple)", fontSize: 9, fontWeight: 800, letterSpacing: .6 }}><Icon name="sparkles" size={15} /> CHỈ SỐ TỔNG THÔNG MINH</span>
            <div className="progress-bar" style={{ flex: "1 1 180px", height: 11, margin: 0 }}><span style={{ width: `${intelligenceScore}%`, background: "linear-gradient(90deg,#8b5cf6,#ec4899)" }} /></div>
            <strong style={{ color: "var(--purple)", fontSize: 16 }}>{intelligenceScore}<small style={{ fontSize: 10, color: "#98919e" }}> / 100</small></strong>
          </div>
          {evaluation && (
            <p style={{ margin: "10px 0 0", color: "#8d8696", fontSize: 10 }}>
              🎯 {evaluation.suggestions.slice(0, 2).join(" · ")}
            </p>
          )}
        </div>
        <div className="overall-progress">
          <div className="progress-ring small" style={{ "--progress": `${percent}%` } as React.CSSProperties}><strong>{percent}%</strong></div>
          <div><strong>{completedLessons} / {totalLessons} bài</strong><span>Đã hoàn thành</span></div>
        </div>
      </section>
      <section className="roadmap-list">
        {curriculum.map((level) => {
          const progress = levelProgress(level.id);
          const { isCurrent, locked, complete } = progress;
          return (
            <article className={`roadmap-card ${isCurrent ? "current" : ""} ${locked ? "locked" : ""}`} key={level.id}>
              <button className="roadmap-main" onClick={() => !locked && setExpanded(expanded === level.id ? 0 : level.id)}>
                <span className="level-node" style={{ background: level.color }}>{complete ? <Icon name="check" /> : locked ? <Icon name="lock" /> : level.id}</span>
                <span className="level-copy"><small>LEVEL {level.id} {isCurrent && <em>ĐANG HỌC</em>}</small><strong>{level.title}</strong><span>{level.competency}</span></span>
                <span className="level-progress"><strong>{progress.completed}/{level.total}</strong><span className="mini-progress"><i style={{ width: `${(progress.completed / level.total) * 100}%`, background: level.color }} /></span></span>
                <Icon name="chevron" className={expanded === level.id ? "rotate" : ""} />
              </button>
              {expanded === level.id && !locked && (
                <div className="lesson-list">
                  {level.lessons.map((lesson, index) => {
                    const lessonDone = index < progress.completed;
                    const active = isCurrent && index === progress.completed;
                    return <div className={`lesson-row ${active ? "active" : ""}`} key={lesson}><span>{lessonDone ? <Icon name="check" /> : active ? <Icon name="play" /> : index + 1}</span><div><strong>{lesson}</strong><small>{lessonDone ? "Đã hoàn thành" : active ? "Bài học tiếp theo · 10 câu" : "Chưa học"}</small></div>{active && <button onClick={onStartQuiz}>Học ngay</button>}</div>;
                  })}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ExerciseMapView({ onStartQuiz, onStartReview, onStartDemo, initialCleared, journeyLocked, intelScore, lotusPoints }: { onStartQuiz: (lessonNumber: number, mode: AttemptMode) => void; onStartReview: () => void; onStartDemo: () => void; initialCleared: number; journeyLocked: boolean; intelScore: number; lotusPoints: number }) {
  const [mode, setMode] = useState<"journey" | "review" | null>(null);

  const choiceCard = (disabled = false) => ({
    flex: 1,
    minHeight: 170,
    borderRadius: 20,
    border: disabled ? "1px solid #e5e1e9" : "1px solid #e3ddf0",
    background: disabled ? "#f7f5f8" : "#fff",
    padding: "24px 22px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    textAlign: "left",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.62 : 1,
    boxShadow: disabled ? "none" : "var(--shadow)",
  } as CSSProperties);

  const backButton = {
    border: "1px solid #e3ddf0",
    borderRadius: 10,
    padding: "7px 12px",
    background: "#fff",
    color: "#77758b",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  } as CSSProperties;

  if (mode === null) {
    return (
      <div className="view-stack exercise-view">
        <section style={{ border: "1px solid #e9e2d6", borderRadius: 22, padding: "30px 32px", background: "#fff", boxShadow: "var(--shadow)" }}>
          <span className="eyebrow purple"><Icon name="target" size={16} /> CHỌN PHẦN HỌC</span>
          <h1 style={{ margin: "10px 0 6px", fontSize: 25, letterSpacing: "-.6px" }}>Hôm nay bạn muốn học gì?</h1>
          <p style={{ margin: "0 0 18px", color: "#817a8b", fontSize: 12 }}>Chọn một trong ba phần bên dưới để bắt đầu.</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button style={choiceCard(journeyLocked)} onClick={() => { if (!journeyLocked) setMode("journey"); }}>
              <span style={{ fontSize: 30 }}>🐸</span>
              <strong style={{ fontSize: 15 }}>Hành trình ếch xanh {journeyLocked && "🔒"}</strong>
              <small style={{ color: "#918a99", fontSize: 11, lineHeight: 1.5 }}>{journeyLocked ? "Đang khóa — cần đạt 50/100 chỉ số thông minh để mở lại." : "Chinh phục dòng sông, mỗi bài 10 câu ngẫu nhiên do AI."}</small>
            </button>
            <button style={choiceCard()} onClick={() => setMode("review")}>
              <span style={{ fontSize: 30 }}>📚</span>
              <strong style={{ fontSize: 15 }}>Ôn tập bài</strong>
              <small style={{ color: "#918a99", fontSize: 11, lineHeight: 1.5 }}>Ôn lại kiến thức để củng cố và tăng chỉ số thông minh.</small>
            </button>
            <button style={choiceCard()} onClick={onStartDemo}>
              <span style={{ fontSize: 30 }}>🎮</span>
              <strong style={{ fontSize: 15 }}>Luyện tập tự do</strong>
              <small style={{ color: "#918a99", fontSize: 11, lineHeight: 1.5 }}>20 câu với đủ dạng trả lời — làm thử thoải mái, không ảnh hưởng hành trình và chỉ số.</small>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="view-stack exercise-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
        <span style={{ color: "#7c3aed", fontSize: 11, fontWeight: 800, letterSpacing: .6 }}>
          {mode === "journey" ? "🐸 HÀNH TRÌNH ẾCH XANH" : "📚 ÔN TẬP BÀI"}
        </span>
        <button style={backButton} onClick={() => setMode(null)}>↩ Quay lại lựa chọn</button>
      </div>
      {mode === "review" ? (
        <section style={{ border: "1px solid #e9e2d6", borderRadius: 22, padding: "30px 32px", background: "#fff", boxShadow: "var(--shadow)" }}>
          <span className="eyebrow purple"><Icon name="book" size={16} /> ÔN TẬP BÀI</span>
          <h1 style={{ margin: "10px 0 6px", fontSize: 25, letterSpacing: "-.6px" }}>Ôn tập để lấy lại điểm</h1>
          <p style={{ margin: 0, color: "#817a8b", fontSize: 12, lineHeight: 1.6 }}>
            {journeyLocked
              ? `Chỉ số thông minh của bạn đang ở mức ${intelScore}/100. Hãy ôn tập chăm chỉ để đạt 50/100 và mở lại Hành trình ếch xanh.`
              : "Làm bài ôn tập giúp củng cố kiến thức và tăng chỉ số thông minh của bạn."}
          </p>
          <div style={{ margin: "18px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 420 }}>
            <span style={{ whiteSpace: "nowrap", color: "var(--purple)", fontSize: 10, fontWeight: 800 }}>CHỈ SỐ HIỆN TẠI</span>
            <div className="progress-bar" style={{ flex: 1, height: 10, margin: 0 }}><span style={{ width: `${intelScore}%`, background: "linear-gradient(90deg,#8b5cf6,#ec4899)" }} /></div>
            <strong style={{ color: "var(--purple)", fontSize: 15 }}>{intelScore}<small style={{ color: "#98919e", fontSize: 10 }}> /100</small></strong>
          </div>
          <button className="primary-button big" onClick={onStartReview}><Icon name="play" size={18} /> Bắt đầu ôn tập (10 câu)</button>
        </section>
      ) : (
        <MathLevelMap onStartQuiz={onStartQuiz} initialCleared={initialCleared} lotusPoints={lotusPoints} />
      )}
    </div>
  );
}

function WaterSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const points = Array.from({ length: 18 }, (_, index) => ({
      x: (index * 137) % 700,
      y: (index * 83) % 520,
      phase: index * 1.7,
    }));
    let animationFrame = 0;
    let frame = 0;

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(46, 146, 161, .18)");
      gradient.addColorStop(1, "rgba(20, 94, 132, .3)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.lineWidth = 1;
      points.forEach((point) => {
        const x = ((point.x + Math.sin(frame * .012 + point.phase) * 42) % (width + 100)) - 50;
        const y = ((point.y + Math.cos(frame * .01 + point.phase) * 38) % (height + 100)) - 50;
        context.strokeStyle = "rgba(226, 255, 245, .2)";
        for (let ring = 0; ring < 3; ring += 1) {
          const radius = 24 + ring * 20 + ((frame + point.phase * 10) % 44);
          context.beginPath();
          context.ellipse(x, y, radius * 1.8, radius * .55, -.12, 0, Math.PI * 2);
          context.stroke();
        }
      });
      frame += 1;
      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    animationFrame = window.requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="water-surface-canvas" aria-hidden="true" />;
}

function CompetitionView({ weeklyLeaderboard, currentAvatar }: { weeklyLeaderboard: DashboardData["weeklyLeaderboard"]; currentAvatar: string }) {
  const rankedStudents = weeklyLeaderboard.length ? weeklyLeaderboard : leaderboard.map((person) => ({ name: person.name, avatar: person.avatar, points: person.points, isCurrentUser: person.avatar === currentAvatar }));
  return (
    <div className="view-stack">
      <section className="page-intro compete-intro"><div><span className="eyebrow amber"><Icon name="trophy" size={16} /> ĐẤU TRƯỜNG TUẦN</span><h1>Đường đua Hoa Sen</h1><p>Giải bài nhanh, thu thập điểm và cùng bạn bè chinh phục đỉnh cao.</p></div><div className="league-badge">🏆<div><small>HẠNG HIỆN TẠI</small><strong>Hạng Bạc · #4</strong></div></div></section>
      <div className="competition-grid">
        <section className="card challenge-card"><div className="challenge-art"><LotusMascot mood="celebrate" /></div><div><span className="live-chip"><i /> ĐANG DIỄN RA</span><h2>Thử thách tốc độ</h2><p>10 câu hỏi · Cộng trừ trong phạm vi 10</p><div className="challenge-meta"><span><Icon name="clock" /> 05:00</span><span><Icon name="gem" /> Tối đa 1.750 điểm</span></div><button className="primary-button">Vào thi đấu <Icon name="arrow" /></button></div></section>
        <section className="card league-card"><div className="card-heading"><div><span className="section-kicker">BẢNG XẾP HẠNG</span><h2>Top học sinh tuần này</h2></div><span className="ends-chip">7 ngày qua</span></div><div className="full-leaderboard">{rankedStudents.map((person, index) => <div className={`rank-row ${person.isCurrentUser ? "is-me" : ""}`} key={person.name}><span className="rank-number">{index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span><span className="small-avatar" style={{ background: ["#f59e0b", "#14b8a6", "#3b82f6", "#8b5cf6"][index % 4] }}>{person.avatar}</span><div><strong>{person.name}{person.isCurrentUser && <em>Bạn</em>}</strong><small>{person.points.toLocaleString("vi-VN")} điểm trong tuần</small></div><b>{person.points.toLocaleString("vi-VN")} <Icon name="gem" size={13} /></b></div>)}</div></section>
      </div>
    </div>
  );
}

function AchievementsView({ dashboard }: { dashboard: DashboardData }) {
  const hasFastQuiz = dashboard.recentAttempts.some((attempt) => attempt.durationSeconds <= 180);
  const badges = [
    { icon: "🔥", title: "Ngọn lửa bền bỉ", desc: "Học liên tục 5 ngày", unlocked: dashboard.user.currentStreak >= 5, color: "orange" },
    { icon: "🎯", title: "Mắt thần chính xác", desc: "Đạt 90% chính xác", unlocked: dashboard.stats.averageScore >= 90, color: "green" },
    { icon: "🌸", title: "Sen hồng đầu tiên", desc: "Hoàn thành Level 1", unlocked: dashboard.stats.completedLessons >= 5, color: "pink" },
    { icon: "⚡", title: "Tia chớp toán học", desc: "Hoàn thành bài trong 3 phút", unlocked: hasFastQuiz, color: "purple" },
    { icon: "👑", title: "Vua thử thách", desc: "Đạt 10/10 câu đúng", unlocked: dashboard.recentAttempts.some((attempt) => attempt.correctAnswers >= 10), color: "blue" },
    { icon: "💎", title: "Kho báu tri thức", desc: "Kiếm 5.000 điểm sen", unlocked: dashboard.user.lotusPoints >= 5000, color: "cyan" },
  ];
  const unlockedCount = badges.filter((badge) => badge.unlocked).length;
  return (
    <div className="view-stack">
      <section className="page-intro achievements-intro"><div><span className="eyebrow pink"><Icon name="medal" size={16} /> BỘ SƯU TẬP</span><h1>Thành tích của {dashboard.user.displayName}</h1><p>Mỗi huy hiệu ghi dấu một bước tiến đáng tự hào trên hành trình học tập.</p></div><div className="achievement-total"><span>{unlockedCount}</span><div><strong>/ {badges.length} huy hiệu</strong><small>Đã mở khóa</small></div></div></section>
      <section className="badge-grid">{badges.map((badge) => <article className={`badge-card ${!badge.unlocked ? "locked" : ""}`} key={badge.title}><div className={`badge-art ${badge.color}`}>{badge.icon}{!badge.unlocked && <span><Icon name="lock" size={16} /></span>}</div><div><strong>{badge.title}</strong><p>{badge.desc}</p><small>{badge.unlocked ? "Đã mở khóa" : "Chưa mở khóa"}</small></div></article>)}</section>
      <section className="card score-history"><div className="card-heading"><div><span className="section-kicker">TIẾN BỘ</span><h2>Dấu mốc gần đây</h2></div></div><div className="timeline">{dashboard.recentAttempts.length ? dashboard.recentAttempts.slice(0, 3).map((attempt) => <div key={attempt.id}><span><Icon name={attempt.correctAnswers >= 9 ? "medal" : "target"} /></span><div><strong>Hoàn thành bài học</strong><p>{attempt.correctAnswers}/{attempt.totalQuestions} câu đúng · {attempt.score.toLocaleString("vi-VN")} điểm sen</p></div><time>{new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric" }).format(new Date(attempt.completedAt))}</time></div>) : <div><span><Icon name="sparkles" /></span><div><strong>Bắt đầu hành trình thành tích</strong><p>Hoàn thành bài quiz đầu tiên để ghi dấu tiến bộ.</p></div><time>Chưa có</time></div>}</div></section>
    </div>
  );
}

function AdminDashboard() {
  return (
    <div className="view-stack">
      <section className="page-intro admin-intro"><div><span className="eyebrow purple"><Icon name="shield" size={16}/> SMART LOTUS ADMIN</span><h1>Tổng quan hệ thống</h1><p>Dữ liệu cập nhật theo thời gian thực từ hệ thống học tập.</p></div><span className="system-online"><i/> Hệ thống ổn định</span></section>
      <section className="stat-grid admin-stats">{adminMetrics.map((metric, index) => <StatCard key={metric.label} icon={(["users", "school", "book", "chart"] as IconName[])[index]} tone={metric.tone} value={metric.value} label={metric.label} change={metric.change}/>)}</section>
      <div className="admin-grid">
        <section className="card admin-chart"><div className="card-heading"><div><span className="section-kicker">TƯƠNG TÁC</span><h2>Hoạt động 7 ngày qua</h2></div><button className="period-button">Tuần này <Icon name="chevron" size={15}/></button></div><div className="line-chart"><div className="grid-lines"><i/><i/><i/><i/></div><svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-label="Biểu đồ hoạt động"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".3"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><path d="M0 180 C80 170 90 110 170 120 S270 80 340 105 S440 38 510 70 S620 45 700 25 V220 H0Z" fill="url(#area)"/><path d="M0 180 C80 170 90 110 170 120 S270 80 340 105 S440 38 510 70 S620 45 700 25" fill="none" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round"/><g fill="#fff" stroke="#8b5cf6" strokeWidth="4"><circle cx="0" cy="180" r="6"/><circle cx="170" cy="120" r="6"/><circle cx="340" cy="105" r="6"/><circle cx="510" cy="70" r="6"/><circle cx="700" cy="25" r="6"/></g></svg><div className="chart-days">{["T2","T3","T4","T5","T6","T7","CN"].map(day=><span key={day}>{day}</span>)}</div></div></section>
        <section className="card system-card"><div className="card-heading"><div><span className="section-kicker">TRẠNG THÁI</span><h2>Dịch vụ hệ thống</h2></div></div><div className="service-list"><ServiceStatus icon="database" name="PostgreSQL" detail="Kết nối bình thường"/><ServiceStatus icon="shield" name="Xác thực" detail="Hoạt động ổn định"/><ServiceStatus icon="wand" name="AI sinh câu hỏi" detail="Sẵn sàng tích hợp" standby/><ServiceStatus icon="book" name="Kho nội dung" detail="40 bài đã xuất bản"/></div></section>
      </div>
    </div>
  );
}

function ServiceStatus({ icon, name, detail, standby = false }: { icon: IconName; name: string; detail: string; standby?: boolean }) {
  return <div><span><Icon name={icon}/></span><div><strong>{name}</strong><small>{detail}</small></div><em className={standby ? "standby" : ""}>{standby ? "Chờ API" : "Online"}</em></div>;
}

function QuizExperience({ quizQuestions, onExit, onComplete, onInteract, isDemo = false, isAssignment = false }: { quizQuestions: QuizQuestion[]; onExit: () => void; onComplete: (result: QuizResult) => void; onInteract: () => void; isDemo?: boolean; isAssignment?: boolean }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [normalCorrect, setNormalCorrect] = useState(0);
  const [hardCorrect, setHardCorrect] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [challengeStartedAt, setChallengeStartedAt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AttemptPayload["answers"]>([]);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [typed, setTyped] = useState("");
  const [lineValue, setLineValue] = useState(0);
  const [tokens, setTokens] = useState<string[]>([]);
  const [selectedImageOptions, setSelectedImageOptions] = useState<string[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const question = quizQuestions[index];
  const meta = difficultyMeta[question.difficulty];
  const normalTotal = Math.max(1, Math.ceil(quizQuestions.length / 2));
  const mode = isAssignment ? question.answerMode ?? "choice" : answerModeFor(question, index);
  const inputState: "idle" | "correct" | "wrong" = selected === null ? "idle" : lastCorrect ? "correct" : "wrong";

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("smart-lotus-quiz-theme");
      if (saved === "light") setTheme("light");
    } catch {
      /* bỏ qua */
    }
  }, []);

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

  function recordAnswer(answerText: string, isCorrect: boolean) {
    if (selected !== null) return;
    onInteract();
    const earned = calculateQuestionScore(question, isCorrect);
    setSelected(answerText);
    setLastCorrect(isCorrect);
    setScore((value) => value + earned);
    if (isCorrect) {
      setCorrect((value) => value + 1);
      if (question.phase === "challenge") setHardCorrect((value) => value + 1);
      else setNormalCorrect((value) => value + 1);
    }
    const savedAnswer = isAssignment && mode !== "choice" && isCorrect ? question.correctAnswer : answerText;
    setAnswers((value) => [...value, { questionId: question.id, answer: savedAnswer, correct: isCorrect }]);
  }

  function chooseAnswer(option: string) {
    recordAnswer(option, option === question.correctAnswer);
  }

  const canCheck =
    mode === "type"
      ? typed.trim() !== ""
      : mode === "line"
        ? true
        : mode === "image-select"
          ? selectedImageOptions.length > 0
        : mode === "complete" || mode === "select"
          ? tokens.length > 0
          : false;

  function checkInput() {
    if (selected !== null) return;
    const answer = question.correctAnswer.trim();
    if (mode === "type") {
      if (!typed.trim()) return;
      recordAnswer(typed.trim(), typed.trim() === answer);
    } else if (mode === "line") {
      recordAnswer(String(lineValue), String(lineValue) === answer);
    } else if (mode === "complete") {
      const result = evalTokens(tokens);
      const ok = result !== null && tokens.some((t) => ["+", "-", "×", "÷"].includes(t)) && String(result) === answer;
      recordAnswer(tokens.join(" "), ok);
    } else if (mode === "select") {
      const { okExprs } = buildSelectOptions(question);
      const ok = tokens.length === okExprs.length && okExprs.every((expr) => tokens.includes(expr));
      recordAnswer(tokens.join(" | "), ok);
    } else if (mode === "image-select") {
      const selectedValues = question.options.filter((option) => selectedImageOptions.includes(option));
      const answer = selectedValues.join("|");
      recordAnswer(answer, answer === question.correctAnswer);
    }
  }

  function resetInputs() {
    setSelected(null);
    setLastCorrect(false);
    setTyped("");
    setLineValue(0);
    setTokens([]);
    setSelectedImageOptions([]);
  }

  function nextQuestion() {
    if (selected === null) return;
    if (index === quizQuestions.length - 1) {
      // Số câu đúng đã được cộng ngay khi chọn đáp án ở recordAnswer.
      const challengeDuration = challengeStartedAt === null ? 0 : Math.max(0, seconds - challengeStartedAt);
      const finalScore = calculateQuizScore(normalCorrect, hardCorrect, challengeDuration);
      onComplete({
        score: finalScore.total,
        baseScore: finalScore.baseScore,
        bonus: finalScore.bonus,
        correct,
        normalCorrect,
        hardCorrect,
        duration: Math.max(1, seconds),
        challengeDuration,
        total: quizQuestions.length,
        answers,
      });
      return;
    }
    if (index === normalTotal - 1) {
      setChallengeStartedAt(seconds);
    }
    setIndex((value) => value + 1);
    resetInputs();
  }

  const HINTS: Record<AnswerMode, string> = {
    choice: "Chọn một đáp án để tiếp tục",
    type: "Gõ đáp án rồi bấm Kiểm tra",
    line: "Kéo mũi tên hoặc chạm vào trục số (phím ← →)",
    complete: "Chạm các ô bên dưới để tạo phép tính",
    match: "Chọn 2 ô có cùng kết quả",
    select: "Chọn tất cả các ô có kết quả bằng nhau rồi bấm Kiểm tra",
    "image-choice": "Chọn một hình ảnh để tiếp tục",
    "image-select": "Chọn tất cả hình ảnh đúng rồi bấm Kiểm tra",
  };

  return (
    <main className={`tt-quiz ${theme === "light" ? "light" : ""} ${question.phase === "challenge" ? "is-challenge" : ""}`}>
      <div className="tt-topbar">
        <button className="tt-exit" onClick={() => setConfirmExit(true)} aria-label="Thoát bài">
          ✕
        </button>
        <div className="tt-progress-track">
          <div
            className="tt-progress-fill"
            style={{ width: `${Math.max(((index + (selected !== null ? 1 : 0)) / quizQuestions.length) * 100, 3)}%` }}
          />
        </div>
        <button className="tt-theme-toggle" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối" title="Đổi giao diện sáng/tối">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <div className="tt-stats">
          <span className="tt-stat"><Icon name="clock" size={14}/> {formatDuration(seconds)}</span>
          <span className="tt-stat tt-stat-gold"><Icon name="gem" size={14}/> {score.toLocaleString("vi-VN")}</span>
        </div>
      </div>

      <div className="tt-stage">
        <div key={index} className="tt-question">
          <div className="tt-chips">
            <span className={`tt-phase-chip ${question.phase}`}>
              <Icon name={question.phase === "normal" ? "book" : "flame"} size={14}/>
              {question.phase === "normal" ? "Vòng Khởi động" : "Vòng Thử thách"}
            </span>
            <span className="tt-mode-chip">{MODE_LABELS[mode]}</span>
            <span className="tt-diff-chip" style={{ color: meta.color }}>
              {"★".repeat(meta.stars)} Level {question.difficulty} · {meta.name}
            </span>
            <span className="tt-count">Câu {index + 1}/{quizQuestions.length}</span>
          </div>

          {mode === "match" ? (
            <h1 className="tt-prompt">Nối các phép tính có cùng kết quả</h1>
          ) : mode === "select" ? (
            <h1 className="tt-prompt">Nối các ô cùng một đáp án</h1>
          ) : mode === "complete" ? null : (
            <h1 className="tt-prompt">{question.prompt}</h1>
          )}
          {mode !== "match" && mode !== "complete" && mode !== "select" && <QuizIllustration question={question} />}

          {mode === "choice" && (
            <div className="tt-options">
              {question.options.map((option, optionIndex) => {
                const isChosen = selected === option;
                const isCorrect = option === question.correctAnswer;
                const state = selected !== null ? (isCorrect ? "correct" : isChosen ? "wrong" : "muted") : "";
                return (
                  <button
                    className={`tt-option ${state}`}
                    key={option}
                    onClick={() => chooseAnswer(option)}
                    disabled={selected !== null}
                  >
                    <span className="tt-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                    <strong>{option}</strong>
                    {selected !== null && isCorrect && <Icon name="check" size={18} className="tt-option-badge"/>}
                    {selected !== null && isChosen && !isCorrect && <Icon name="close" size={18} className="tt-option-badge"/>}
                  </button>
                );
              })}
            </div>
          )}
          {(mode === "image-choice" || mode === "image-select") && (
            <ImageChoiceAnswers
              q={question}
              selected={mode === "image-choice" && selected !== null ? [selected] : selectedImageOptions}
              locked={selected !== null}
              multi={mode === "image-select"}
              onChoose={(option) => {
                if (mode === "image-choice") chooseAnswer(option);
                else setSelectedImageOptions((current) => current.includes(option)
                  ? current.filter((value) => value !== option)
                  : [...current, option]);
              }}
            />
          )}
          {mode === "type" && <TypeInput locked={selected !== null} state={inputState} onChange={setTyped} />}
          {mode === "line" && <NumberLineInput q={question} locked={selected !== null} state={inputState} onChange={setLineValue} />}
          {mode === "complete" && <TileEquation q={question} locked={selected !== null} state={inputState} onChange={setTokens} />}
          {mode === "select" && <SelectAllOptions q={question} locked={selected !== null} state={inputState} onChange={setTokens} />}
          {mode === "match" && (
            <MatchBoard q={question} locked={selected !== null} onDone={(mistakes) => recordAnswer("Ghép cặp", mistakes === 0)} />
          )}
          {selected === null && mode !== "match" && mode !== "complete" && <p className="tt-hint">{HINTS[mode]}</p>}
        </div>
      </div>

      <div className={`tt-footer ${selected !== null ? (lastCorrect ? "correct" : "wrong") : ""}`}>
        <div className="tt-footer-inner">
          <div className="tt-feedback">
            {selected !== null && lastCorrect && (
              <div className="tt-feedback-row">
                <span className="tt-feedback-icon">✓</span>
                <div>
                  <p className="tt-feedback-title">Chính xác! Tuyệt lắm!</p>
                </div>
              </div>
            )}
            {selected !== null && !lastCorrect && (
              <div className="tt-feedback-row">
                <span className="tt-feedback-icon wrong">✕</span>
                <div>
                  <p className="tt-feedback-title">Gần đúng rồi!</p>
                  <p className="tt-feedback-text">
                    Đáp án đúng: <b>{question.correctAnswer}</b>
                  </p>
                </div>
              </div>
            )}
          </div>
          {selected !== null ? (
            <button className="tt-next" onClick={nextQuestion}>
              {index === quizQuestions.length - 1 ? "Xem kết quả" : "Câu tiếp theo"}
            </button>
          ) : mode !== "choice" && mode !== "image-choice" && mode !== "match" ? (
            <button className="tt-next" onClick={checkInput} disabled={!canCheck}>
              Kiểm tra
            </button>
          ) : null}
        </div>
      </div>

      {confirmExit && (
        <div className="profile-editor-backdrop" style={{ zIndex: 300 }}>
          <section className="profile-editor" role="dialog" aria-label="Xác nhận thoát bài">
            <h2 style={{ fontSize: 20, margin: "6px 0 0" }}>Thoát bài tập?</h2>
            <p style={{ margin: "14px 0 0", color: "#817a8b", fontSize: 12, lineHeight: 1.6 }}>
              {isDemo ? (
                "Nếu thoát bây giờ, tiến độ bài làm sẽ bị mất. Bạn chắc chắn muốn thoát?"
              ) : (
                <>Nếu thoát bây giờ, tiến độ bài làm sẽ bị mất và <strong style={{ color: "#b93c56" }}>chỉ số thông minh bị trừ 5 điểm</strong>. Bạn chắc chắn muốn thoát?</>
              )}
            </p>
            <div className="profile-editor-actions" style={{ marginTop: 18 }}>
              <button className="secondary-button" onClick={() => setConfirmExit(false)}>Ở lại làm tiếp</button>
              <button className="primary-button" style={{ background: "linear-gradient(135deg,#ef4444,#b91c1c)" }} onClick={onExit}>
                {isDemo ? "Thoát luyện tập" : "Thoát và trừ 5 điểm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function ResultScreen({ result, journeyFailed, skipEligible, onSkip, onHome, onRetry, onPrevious, onNext, nextLocked }: { result: QuizResult; journeyFailed: boolean; skipEligible: boolean; onSkip: () => void; onHome: () => void; onRetry: () => void; onPrevious: () => void; onNext: () => void; nextLocked: boolean }) {
  const total = result.total || 10;
  const normalTotal = Math.ceil(total / 2);
  const challengeTotal = total - normalTotal;
  const accuracy = total > 0 ? Math.round((result.correct / total) * 100) : 0;
  const passed = accuracy >= 50;
  const recommendation = result.score < 600 ? "retry" : result.score < 800 ? "previous" : "next";
  const bonusMessage = result.bonus > 0
    ? `Bạn nhận được +${result.bonus} điểm bonus vì hoàn thành phần khó trong ${formatDuration(result.challengeDuration)}.`
    : "Bạn đã vượt quá 3 phút ở phần khó nên không nhận được điểm bonus thời gian.";
  return (
    <main className="result-shell">
      <header className="result-header"><LotusLogo/><span><Icon name="check"/> Bài học đã hoàn thành</span></header>
      <section className="result-card">
        <div className="result-hero"><div className="result-mascot"><LotusMascot mood="celebrate"/></div><span className="eyebrow purple">KẾT QUẢ BÀI HỌC</span><h1>{passed ? "Tuyệt vời, Minh Anh!" : "Bạn đã rất cố gắng!"}</h1><p>{passed ? `Bạn đã hoàn thành đủ ${total} câu và vượt qua điều kiện của bài học.` : "Bạn đã hoàn thành bài. Hãy xem lại phần giải thích và thử thêm một lần nữa nhé!"}</p></div>
        {journeyFailed && (
          <div className="result-rewards" style={{ borderColor: "#f3c6dc", background: "#fff5fa", marginBottom: 16 }}>
            <span>⚠️</span>
            <div><small>HÀNH TRÌNH ẾCH XANH</small><strong>Không đủ điều kiện vượt bài (dưới 50%)</strong><p>Chỉ số thông minh của bạn bị trừ 5 điểm. Hãy vào Ôn tập để lấy lại điểm và quay lại hành trình nhé!</p></div>
          </div>
        )}
        {skipEligible && (
          <div className="result-rewards" style={{ borderColor: "#c7b3f5", background: "#f5f0ff", marginBottom: 16 }}>
            <span>🐸</span>
            <div><small>PHẦN THƯỞNG XUẤT SẮC</small><strong>Trên 90% và chỉ số thông minh trên 90</strong><p>Bạn được quyền nhảy qua 2 lá sen — bỏ qua 1 bài trong hành trình ếch xanh!</p></div>
            <button className="primary-button" onClick={onSkip}>Nhảy qua 2 lá sen <Icon name="arrow" /></button>
          </div>
        )}
        <div className="result-score-panel"><div className="result-ring" style={{ "--score": `${accuracy * 3.6}deg` } as CSSProperties}><div><strong>{result.correct}/{total}</strong><span>Câu chính xác</span></div></div><div className="result-metrics"><div><span className="metric-icon purple"><Icon name="gem"/></span><p><small>TỔNG ĐIỂM</small><strong>{result.score.toLocaleString("vi-VN")}</strong></p></div><div><span className="metric-icon green"><Icon name="target"/></span><p><small>ĐỘ CHÍNH XÁC</small><strong>{accuracy}%</strong></p></div><div><span className="metric-icon orange"><Icon name="clock"/></span><p><small>THỜI GIAN</small><strong>{formatDuration(result.duration)}</strong></p></div></div></div>
        <div className="result-breakdown"><div><span className="round-icon easy"><Icon name="book"/></span><p><strong>{normalTotal} câu thường · 60%</strong><small>{result.normalCorrect}/{normalTotal} đúng · {result.normalCorrect * 120} điểm</small></p><b>{result.normalCorrect * 120}/{normalTotal * 120} <Icon name="check"/></b></div><div><span className="round-icon hard"><Icon name="flame"/></span><p><strong>{challengeTotal} câu khó · 40%</strong><small>{result.hardCorrect}/{challengeTotal} đúng · {result.hardCorrect * 80} điểm</small></p><b>{result.hardCorrect * 80}/{challengeTotal * 80} <Icon name="check"/></b></div></div>
        <div className="result-rewards"><span>🌸</span><div><small>CHI TIẾT ĐIỂM</small><strong>Điểm nền {result.baseScore} + bonus {result.bonus}</strong><p>{bonusMessage}</p></div><i/><span>🔥</span><div><small>CHUỖI HỌC TẬP</small><strong>5 ngày liên tục</strong></div></div>
        <div className="result-next-steps"><div className="result-next-steps-heading"><div><span className="section-kicker">BƯỚC TIẾP THEO</span><h2>Chọn bài học phù hợp</h2></div><span>{nextLocked ? "Cần ôn lại trước khi học bài mới" : recommendation === "retry" ? "Nên củng cố bài này" : recommendation === "previous" ? "Nên ôn lại nền tảng" : "Bạn đã sẵn sàng tiến lên"}</span></div><div className="result-choice-grid"><button className={`result-choice ${recommendation === "previous" ? "recommended" : ""}`} onClick={onPrevious}><span className="result-choice-icon"><Icon name="arrow" className="rotate-left"/></span><span><strong>Bài trước đó</strong><small>Đếm và so sánh số</small></span>{recommendation === "previous" && <em>Nên chọn</em>}</button><button className={`result-choice ${recommendation === "retry" ? "recommended" : ""}`} onClick={onRetry}><span className="result-choice-icon"><Icon name="sparkles"/></span><span><strong>Làm lại bài này</strong><small>Củng cố kiến thức vừa học</small></span>{recommendation === "retry" && <em>Nên chọn</em>}</button><button className={`result-choice ${recommendation === "next" ? "recommended" : ""}`} onClick={onNext} disabled={nextLocked}><span className="result-choice-icon"><Icon name="arrow"/></span><span><strong>{nextLocked ? "Ôn lại trước" : "Bài tiếp theo"}</strong><small>{nextLocked ? "Đã dưới 50 điểm quá 3 lần" : "Trừ trong phạm vi 10"}</small></span>{!nextLocked && recommendation === "next" && <em>Nên chọn</em>}</button></div></div>
        <div className="result-actions"><button className="secondary-button" onClick={onHome}>Về trang chủ</button></div>
      </section>
    </main>
  );
}
