export type Difficulty = "A" | "B" | "C" | "D" | "E";
export type QuizPhase = "normal" | "challenge";
export type AnswerMode = "choice" | "type" | "line" | "complete" | "match" | "select" | "image-choice" | "image-select";
export type QuizImageAsset = { id: string; src: string; name: string };
export type QuizVisualElement = { assetId: string; x: number; y: number; size: number };

export type CurriculumLevel = {
  id: number;
  title: string;
  shortTitle: string;
  competency: string;
  lessons: string[];
  completed: number;
  total: number;
  color: string;
  icon: string;
};

export type QuizQuestion = {
  id: number;
  phase: QuizPhase;
  difficulty: Difficulty;
  skill: string;
  prompt: string;
  illustration?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  answerMode?: AnswerMode;
  imageAssets?: QuizImageAsset[];
  visualElements?: QuizVisualElement[];
  optionImageIds?: Array<string | null>;
};

export type SurveyQuestion = QuizQuestion & { level: number };

export function isAnswerModeCompatible(question: QuizQuestion, mode: AnswerMode): boolean {
  if (mode === "choice") return true;
  if (mode === "image-choice" || mode === "image-select") {
    if (question.options.length !== 4
      || !question.optionImageIds
      || question.optionImageIds.length !== question.options.length) return false;
    const assetIds = new Set((question.imageAssets ?? []).map((asset) => asset.id));
    if (question.optionImageIds.some((assetId) => !assetId || !assetIds.has(assetId))
      || new Set(question.optionImageIds).size !== question.optionImageIds.length) return false;
    const answers = mode === "image-select" ? question.correctAnswer.split("|") : [question.correctAnswer];
    return answers.length > 0
      && answers.every((answer) => question.options.includes(answer))
      && new Set(answers).size === answers.length;
  }

  const answer = Number(question.correctAnswer.trim());
  if (!Number.isSafeInteger(answer)) return false;
  if (mode === "type") return Math.abs(answer) <= 999999;
  if (answer < 0 || answer > 999) return false;
  if (mode === "select") {
    const arithmetic = question.prompt.match(/(\d+)\s*([+\-−×÷x*])\s*(\d+)/);
    if (!arithmetic) return false;
    const left = Number(arithmetic[1]);
    const right = Number(arithmetic[3]);
    const result = arithmetic[2] === "+" ? left + right
      : ["×", "x", "*"].includes(arithmetic[2]) ? left * right
        : arithmetic[2] === "÷" ? left / right
          : left - right;
    if (result !== answer) return false;
  }
  if (mode === "line") {
    const numericOptions = question.options
      .map((option) => Number(option.trim()))
      .filter((option) => Number.isFinite(option) && Math.abs(option) <= 999);
    return Math.max(5, answer, ...numericOptions) + 2 <= 20;
  }
  return true;
}

export const curriculum: CurriculumLevel[] = [
  {
    id: 1,
    title: "Làm quen với Toán học",
    shortTitle: "Làm quen với Toán",
    competency: "So sánh và làm quen với số",
    lessons: ["So sánh nhiều hơn – ít hơn", "So sánh bằng nhau", "So sánh số", "Thứ tự số", "Làm quen với số 1–5"],
    completed: 5,
    total: 5,
    color: "#ec4899",
    icon: "shapes",
  },
  {
    id: 2,
    title: "Các số từ 0 đến 10",
    shortTitle: "Các số từ 0–10",
    competency: "Đọc, viết, đếm và so sánh số ≤ 10",
    lessons: ["Số 0–5", "Số 6–10", "Đọc, viết số 0–10", "So sánh số", ">, <, =", "Sắp xếp số"],
    completed: 6,
    total: 6,
    color: "#8b5cf6",
    icon: "numbers",
  },
  {
    id: 3,
    title: "Cộng và trừ trong phạm vi 10",
    shortTitle: "Cộng trừ trong 10",
    competency: "Thực hiện phép cộng, trừ trong phạm vi 10",
    lessons: ["Ý nghĩa phép cộng", "Phép cộng ≤ 10", "Ý nghĩa phép trừ", "Phép trừ ≤ 10", "Quan hệ cộng – trừ", "Điền số còn thiếu", "Bài toán thực tế"],
    completed: 3,
    total: 7,
    color: "#f59e0b",
    icon: "math",
  },
  {
    id: 4,
    title: "Các số đến 100",
    shortTitle: "Các số đến 100",
    competency: "Hiểu cấu tạo và thứ tự số ≤ 100",
    lessons: ["Các số 11–20", "Chục và đơn vị", "Các số đến 50", "Các số đến 100", "So sánh số", "Sắp xếp số", "Số liền trước – liền sau"],
    completed: 0,
    total: 7,
    color: "#14b8a6",
    icon: "abacus",
  },
  {
    id: 5,
    title: "Cộng và trừ trong phạm vi 100",
    shortTitle: "Cộng trừ trong 100",
    competency: "Tính toán và vận dụng",
    lessons: ["Cộng không nhớ", "Trừ không nhớ", "Cộng với số có một chữ số", "Trừ với số có một chữ số", "Tính nhẩm", "Điền số", "Bài toán có lời văn"],
    completed: 0,
    total: 7,
    color: "#3b82f6",
    icon: "plus",
  },
  {
    id: 6,
    title: "Toán học trong cuộc sống",
    shortTitle: "Toán trong cuộc sống",
    competency: "Vận dụng kiến thức vào tình huống thực tế",
    lessons: ["Số tròn chục", "Độ dài", "Xăng-ti-mét", "Xem giờ", "Ngày và tuần", "Bài toán thực tế", "Ôn tập tổng hợp", "Thử thách cuối lớp 1"],
    completed: 0,
    total: 8,
    color: "#22c55e",
    icon: "clock",
  },
];

export const questions: QuizQuestion[] = [
  {
    id: 2,
    phase: "normal",
    difficulty: "B",
    skill: "Cơ bản",
    prompt: "3 + 2 bằng bao nhiêu?",
    options: ["4", "5", "6", "7"],
    correctAnswer: "5",
    explanation: "Có 3 quả táo, thêm 2 quả nên có tất cả 5 quả.",
  },
  {
    id: 3,
    phase: "normal",
    difficulty: "B",
    skill: "Cơ bản",
    prompt: "8 − 3 bằng bao nhiêu?",
    options: ["4", "5", "6", "7"],
    correctAnswer: "5",
    explanation: "Từ 8 bớt đi 3, ta còn 5.",
  },
  {
    id: 4,
    phase: "normal",
    difficulty: "B",
    skill: "So sánh",
    prompt: "Điền dấu thích hợp: 7  ☐  5",
    options: [">", "<", "=", "+"],
    correctAnswer: ">",
    explanation: "7 lớn hơn 5 nên ta điền dấu >.",
  },
  {
    id: 5,
    phase: "normal",
    difficulty: "B",
    skill: "Thứ tự số",
    prompt: "Số nào đứng ngay sau số 8?",
    options: ["6", "7", "9", "10"],
    correctAnswer: "9",
    explanation: "Dãy số tăng dần là 7, 8, 9 nên số sau 8 là 9.",
  },
  {
    id: 6,
    phase: "challenge",
    difficulty: "C",
    skill: "Vận dụng",
    prompt: "Điền số còn thiếu: 4 + ☐ = 9",
    options: ["3", "4", "5", "6"],
    correctAnswer: "5",
    explanation: "Vì 9 − 4 = 5 nên số cần điền là 5.",
  },
  {
    id: 7,
    phase: "challenge",
    difficulty: "D",
    skill: "Giải quyết vấn đề",
    prompt: "Lan có 3 viên bi, mẹ cho thêm 4 viên. Lan có tất cả bao nhiêu viên bi?",
    options: ["6 viên", "7 viên", "8 viên", "9 viên"],
    correctAnswer: "7 viên",
    explanation: "Ta thực hiện phép cộng 3 + 4 = 7 viên bi.",
  },
  {
    id: 8,
    phase: "challenge",
    difficulty: "C",
    skill: "Vận dụng",
    prompt: "10 − ☐ = 4. Số thích hợp là số nào?",
    options: ["4", "5", "6", "7"],
    correctAnswer: "6",
    explanation: "Vì 10 − 6 = 4 nên số cần điền là 6.",
  },
  {
    id: 9,
    phase: "challenge",
    difficulty: "D",
    skill: "Tìm quy luật",
    prompt: "Chọn số tiếp theo của dãy: 2, 4, 6, ☐",
    options: ["7", "8", "9", "10"],
    correctAnswer: "8",
    explanation: "Mỗi số tăng thêm 2: 2, 4, 6, 8.",
  },
  {
    id: 10,
    phase: "challenge",
    difficulty: "E",
    skill: "Thử thách",
    prompt: "Hoa có một số nhãn vở. Mẹ cho thêm 3 chiếc thì Hoa có 8 chiếc. Ban đầu Hoa có bao nhiêu nhãn vở?",
    options: ["3 chiếc", "4 chiếc", "5 chiếc", "6 chiếc"],
    correctAnswer: "5 chiếc",
    explanation: "Số nhãn vở ban đầu là 8 − 3 = 5 chiếc.",
  },
];

export const difficultyMeta: Record<Difficulty, { name: string; stars: number; color: string }> = {
  A: { name: "Nhận biết", stars: 1, color: "#22c55e" },
  B: { name: "Cơ bản", stars: 2, color: "#84cc16" },
  C: { name: "Vận dụng", stars: 3, color: "#f59e0b" },
  D: { name: "Giải quyết vấn đề", stars: 4, color: "#f97316" },
  E: { name: "Thử thách", stars: 5, color: "#ec4899" },
};
