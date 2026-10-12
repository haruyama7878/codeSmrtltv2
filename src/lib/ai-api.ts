import "server-only";

import { questions, type Difficulty, type QuizQuestion, type SurveyQuestion } from "./learning-data";
import { makeVariant } from "./survey-variant";
import {
  difficultiesForScore,
  evaluatePathLocal,
  type AttemptSummary,
  type PathEvaluation,
  type PlacementResult,
} from "./placement";

export type GenerateQuizInput = {
  topic: string;
  curriculumLevel: number;
  difficulties: Difficulty[];
  count?: number;
  /** Chỉ số tổng thông minh 0–100 để cá nhân hóa độ khó */
  intelligenceScore?: number;
  variationSeed?: string;
  excludePrompts?: string[];
};

export type GeneratedQuiz = {
  source: "ai" | "question-bank";
  questions: QuizQuestion[];
};

type OllamaMessage = {
  role: "system" | "user";
  content: string;
};

type OllamaFormat = "json" | Record<string, unknown>;

async function requestOllamaChat(
  messages: OllamaMessage[],
  temperature: number,
  format: OllamaFormat = "json",
): Promise<Response> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL ?? "minicpm-v:latest";

  return fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      options: { temperature },
      format,
      stream: false,
      messages,
    }),
    cache: "no-store",
  });
}

async function parseOllamaResponse(response: Response): Promise<Record<string, unknown> | null> {
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("message" in payload)) return null;

  const message = payload.message;
  if (!message || typeof message !== "object" || !("content" in message)) return null;

  const content = message.content;
  const parsed: unknown = typeof content === "string" ? JSON.parse(content) : content;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
}

const VIETNAMESE_DIACRITIC_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const MATH_ONLY_PROMPT_RE = /^[\d\s()+\-−×÷=.?☐□<>]+$/u;

function isVietnameseQuestionText(value: string, allowMathOnly = false) {
  return VIETNAMESE_DIACRITIC_RE.test(value) || (allowMathOnly && MATH_ONLY_PROMPT_RE.test(value));
}

function isVietnameseAnswerOption(value: string) {
  return (
    !/[a-z]/i.test(value) ||
    isVietnameseQuestionText(value) ||
    /^[\d\s.,+-]*(?:cm|mm|m|kg|g|l|ml)$/i.test(value)
  );
}

function fallbackQuiz(count: number): GeneratedQuiz {
  return {
    source: "question-bank",
    questions: Array.from({ length: count }, (_, index) => {
      const base = questions[index % questions.length];
      return { ...base, id: index + 1 };
    }),
  };
}

/**
 * Adapter API AI duy nhất của Smart Lotus.
 * Dùng Ollama chạy trên máy chủ. Có thể cấu hình OLLAMA_BASE_URL và OLLAMA_MODEL.
 * Giao diện và route API không cần thay đổi khi đổi nhà cung cấp AI.
 */
export async function generateQuiz(input: GenerateQuizInput): Promise<GeneratedQuiz> {
  const count = Math.max(1, Math.min(20, input.count ?? 10));
  const normalCount = Math.ceil(count / 2);
  const quizFormat: OllamaFormat = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            phase: { type: "string", enum: ["normal", "challenge"] },
            difficulty: {
              type: "string",
              enum: input.difficulties.length ? input.difficulties : ["A", "B", "C", "D", "E"],
            },
            skill: { type: "string" },
            prompt: { type: "string" },
            options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
          },
          required: [
            "id",
            "phase",
            "difficulty",
            "skill",
            "prompt",
            "options",
            "correctAnswer",
            "explanation",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
  const response = await requestOllamaChat(
    [
        {
          role: "system",
          content:
            "Bạn là chuyên gia giáo dục tiểu học Việt Nam. BẮT BUỘC viết 100% nội dung bằng tiếng Việt có dấu; tuyệt đối không dùng tiếng Anh ở prompt, skill, lựa chọn hoặc lời giải. Dùng đúng lối trình bày đề trắc nghiệm trong mẫu: 'Câu 1. Tính: 37 + 62 = ...' với bốn lựa chọn ngắn A, B, C, D; trong JSON, options là mảng đúng 4 chuỗi, không thêm nhãn A-D vào chuỗi. Hãy tạo câu hỏi Toán lớp 1 an toàn, rõ ràng và trả về JSON {questions: QuizQuestion[]}. Không dùng kiến thức vượt chương trình. Tạo đúng count câu: nửa đầu phase normal, nửa sau phase challenge; id từ 1 đến count; correctAnswer phải trùng một options. Mỗi lần sinh hãy tạo một bộ câu hỏi khác, không lặp lại nội dung trong excludePrompts; variationSeed dùng để tạo biến thể mới. Câu hỏi PHẢI tự trả lời được. TUYỆT ĐỐI không tạo câu hỏi về vị trí (trên/dưới/trái/phải, 'ở đâu', 'so với'), nhận biết hình dạng/con vật, hoặc bất kỳ câu đếm số lượng nào (không dùng cụm 'Có bao nhiêu', 'có tất cả', 'đếm'); chỉ tạo câu hỏi về phép tính, so sánh và thứ tự số. Trường illustration LUÔN để chuỗi rỗng. TUYỆT ĐỐI không dùng tên file ảnh. Học sinh có chỉ số tổng thông minh intelligenceScore/100: hãy chọn độ khó của các câu sao cho phù hợp cá nhân, chỉ dùng các difficulty trong danh sách được cung cấp.",
        },
        {
          role: "user",
          content: `Hãy tạo đề toán theo yêu cầu. Toàn bộ câu hỏi và lời giải phải viết bằng tiếng Việt. Dữ liệu đầu vào: ${JSON.stringify({
            topic: input.topic,
            curriculumLevel: input.curriculumLevel,
            difficulties: input.difficulties,
            intelligenceScore: input.intelligenceScore,
            count,
            normalCount,
            variationSeed: input.variationSeed,
            excludePrompts: input.excludePrompts,
            requiredFields: ["id", "phase", "difficulty", "skill", "prompt", "options", "correctAnswer", "explanation"],
          })}`,
        },
    ],
    0.45,
    quizFormat,
  );

  if (!response.ok) return fallbackQuiz(count);

  try {
    const parsed = await parseOllamaResponse(response);
    if (!Array.isArray(parsed?.questions) || parsed.questions.length === 0) return fallbackQuiz(count);
    const validQuestions = parsed.questions.filter(isValidQuizQuestion).slice(0, count);
    return validQuestions.length ? { source: "ai", questions: validQuestions } : fallbackQuiz(count);
  } catch {
    return fallbackQuiz(count);
  }
}

function isValidQuizQuestion(value: unknown): value is QuizQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<QuizQuestion>;
  return (
    typeof question.id === "number" &&
    (question.phase === "normal" || question.phase === "challenge") &&
    typeof question.difficulty === "string" &&
    typeof question.skill === "string" &&
    isVietnameseQuestionText(question.skill) &&
    typeof question.prompt === "string" &&
    isVietnameseQuestionText(question.prompt, true) &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    question.options.every((option) => typeof option === "string" && isVietnameseAnswerOption(option)) &&
    typeof question.correctAnswer === "string" &&
    question.options.includes(question.correctAnswer) &&
    typeof question.explanation === "string" &&
    isVietnameseQuestionText(question.explanation)
  );
}

/* ------------------------------------------------------------------ */
/*  Placement survey (khảo sát đầu vào 30 câu)                          */
/* ------------------------------------------------------------------ */

export type GenerateSurveyInput = {
  count?: number;
};

export type GeneratedSurvey = {
  source: "ai" | "question-bank";
  questions: SurveyQuestion[];
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeOptions(answer: string, distractors: string[]): string[] {
  const seen = new Set<string>([answer]);
  const options = [answer];
  for (const option of distractors) {
    if (option !== answer && !seen.has(option)) {
      seen.add(option);
      options.push(option);
    }
  }
  let guard = 0;
  while (options.length < 4 && guard < 100) {
    guard += 1;
    const candidate = String(randInt(1, 90));
    if (!seen.has(candidate)) {
      seen.add(candidate);
      options.push(candidate);
    }
  }
  return shuffle(options);
}

function buildSurveyFallback(): Array<Omit<SurveyQuestion, "id">> {
  const result: Array<Omit<SurveyQuestion, "id">> = [];

  /* Level 1 – Làm quen với Toán học */
  const n1 = randInt(3, 9);
  const big = randInt(4, 9);
  const small = randInt(1, big - 1);
  const left = randInt(2, 6);
  const right = left + randInt(1, 3);
  const mid = randInt(2, 7);
  result.push(
    {
      level: 1, phase: "normal", difficulty: "A", skill: "Đếm đồ vật",
      prompt: "Có tất cả bao nhiêu quả táo?",
      illustration: "🍎 ".repeat(n1).trim(),
      options: makeOptions(String(n1), [String(n1 + 1), String(Math.max(1, n1 - 1)), String(n1 + 2)]),
      correctAnswer: String(n1),
      explanation: `Đếm lần lượt từng quả táo: 1, 2, …, ${n1}.`,
    },
    {
      level: 1, phase: "normal", difficulty: "A", skill: "Hình dạng cơ bản",
      prompt: "Hình nào có 4 cạnh bằng nhau?",
      options: makeOptions("Hình vuông", ["Hình tròn", "Hình tam giác", "Hình chữ nhật"]),
      correctAnswer: "Hình vuông",
      explanation: "Hình vuông có 4 cạnh bằng nhau.",
    },
    {
      level: 1, phase: "normal", difficulty: "A", skill: "Nhiều hơn – ít hơn",
      prompt: `Nhóm nào có nhiều quả cam hơn: nhóm ${big} quả hay nhóm ${small} quả?`,
      options: makeOptions(`${big} quả`, [`${small} quả`, `${big + 1} quả`, `${Math.max(1, small - 1)} quả`]),
      correctAnswer: `${big} quả`,
      explanation: `${big} lớn hơn ${small} nên nhóm ${big} quả nhiều hơn.`,
    },
    {
      level: 1, phase: "normal", difficulty: "B", skill: "Bằng nhau",
      prompt: `Bên trái có ${left} quả bóng, bên phải có ${right} quả bóng. Cần thêm mấy quả vào bên trái để hai bên bằng nhau?`,
      options: makeOptions(String(right - left), [String(right - left + 1), String(right - left + 2), String(right - left + 3)]),
      correctAnswer: String(right - left),
      explanation: `Vì ${right} − ${left} = ${right - left} nên cần thêm ${right - left} quả.`,
    },
    {
      level: 1, phase: "normal", difficulty: "B", skill: "Thứ tự số",
      prompt: `Số nào ở giữa ${mid} và ${mid + 2}?`,
      options: makeOptions(String(mid + 1), [String(mid - 1), String(mid + 3), String(mid + 2)]),
      correctAnswer: String(mid + 1),
      explanation: `Dãy số liên tiếp là ${mid}, ${mid + 1}, ${mid + 2}.`,
    }
  );

  /* Level 2 – Các số từ 0 đến 10 */
  const nextOf = randInt(1, 8);
  const cmpA = randInt(1, 9);
  const cmpB = cmpA + randInt(1, 3);
  const dots = randInt(3, 9);
  const seq = randInt(1, 7);
  result.push(
    {
      level: 2, phase: "normal", difficulty: "B", skill: "Số liền sau",
      prompt: `Số liền sau của ${nextOf} là số nào?`,
      options: makeOptions(String(nextOf + 1), [String(nextOf - 1), String(nextOf + 2), String(nextOf + 3)]),
      correctAnswer: String(nextOf + 1),
      explanation: `Đếm tiếp: ${nextOf}, ${nextOf + 1}. Vậy số liền sau là ${nextOf + 1}.`,
    },
    {
      level: 2, phase: "normal", difficulty: "B", skill: "So sánh số",
      prompt: `Điền dấu thích hợp: ${cmpA} ☐ ${cmpB}`,
      options: makeOptions("<", [">", "=", "+"]),
      correctAnswer: "<",
      explanation: `${cmpA} bé hơn ${cmpB} nên điền dấu <.`,
    },
    {
      level: 2, phase: "normal", difficulty: "B", skill: "Đếm và biểu diễn số",
      prompt: "Có tất cả bao nhiêu chấm tròn?",
      illustration: "🔵 ".repeat(dots).trim(),
      options: makeOptions(String(dots), [String(dots + 1), String(Math.max(1, dots - 1)), String(dots + 2)]),
      correctAnswer: String(dots),
      explanation: `Đếm lần lượt các chấm tròn: 1, 2, …, ${dots}.`,
    },
    {
      level: 2, phase: "normal", difficulty: "B", skill: "Sắp xếp số",
      prompt: `Điền số còn thiếu trong dãy: ${seq}, ${seq + 1}, ☐, ${seq + 3}`,
      options: makeOptions(String(seq + 2), [String(seq + 4), String(seq + 5), String(seq + 1)]),
      correctAnswer: String(seq + 2),
      explanation: `Dãy số tăng dần: ${seq}, ${seq + 1}, ${seq + 2}, ${seq + 3}.`,
    },
    {
      level: 2, phase: "normal", difficulty: "B", skill: "So sánh số",
      prompt: `Số nào lớn nhất trong các số ${cmpA}, ${cmpB}, ${Math.max(1, cmpA - 1)}?`,
      options: makeOptions(String(cmpB), [String(cmpA), String(Math.max(1, cmpA - 1)), String(cmpB - 1)]),
      correctAnswer: String(cmpB),
      explanation: `${cmpB} là số lớn nhất.`,
    }
  );

  /* Level 3 – Cộng và trừ trong phạm vi 10 */
  const addA = randInt(1, 6);
  const addB = randInt(1, 10 - addA);
  const subA = randInt(3, 10);
  const subB = randInt(1, subA - 1);
  const missA = randInt(1, 6);
  const missC = missA + randInt(1, 10 - missA);
  const wordA = randInt(2, 5);
  const wordB = randInt(2, 9 - wordA);
  const unkA = randInt(1, 6);
  const unkC = unkA + randInt(1, 10 - unkA);
  result.push(
    {
      level: 3, phase: "normal", difficulty: "B", skill: "Phép cộng trong phạm vi 10",
      prompt: `${addA} + ${addB} = ?`,
      options: makeOptions(String(addA + addB), [String(addA + addB + 1), String(addA + addB + 2), String(Math.max(1, addA + addB - 1))]),
      correctAnswer: String(addA + addB),
      explanation: `${addA} cộng ${addB} bằng ${addA + addB}.`,
    },
    {
      level: 3, phase: "normal", difficulty: "C", skill: "Phép trừ trong phạm vi 10",
      prompt: `${subA} − ${subB} = ?`,
      options: makeOptions(String(subA - subB), [String(subA - subB + 1), String(subA - subB + 2), String(Math.max(1, subA - subB - 1))]),
      correctAnswer: String(subA - subB),
      explanation: `${subA} bớt đi ${subB} còn lại ${subA - subB}.`,
    },
    {
      level: 3, phase: "normal", difficulty: "C", skill: "Điền số còn thiếu",
      prompt: `${missA} + ☐ = ${missC}. Số cần điền là?`,
      options: makeOptions(String(missC - missA), [String(missC - missA + 1), String(missC - missA + 2), String(Math.max(1, missC - missA - 1))]),
      correctAnswer: String(missC - missA),
      explanation: `Vì ${missC} − ${missA} = ${missC - missA} nên số cần điền là ${missC - missA}.`,
    },
    {
      level: 3, phase: "normal", difficulty: "D", skill: "Bài toán thực tế",
      prompt: `Lan có ${wordA} viên bi, mẹ cho thêm ${wordB} viên. Lan có tất cả bao nhiêu viên bi?`,
      options: makeOptions(`${wordA + wordB} viên`, [`${wordA + wordB + 1} viên`, `${wordA + wordB + 2} viên`, `${Math.max(1, wordA + wordB - 1)} viên`]),
      correctAnswer: `${wordA + wordB} viên`,
      explanation: `Ta làm phép cộng: ${wordA} + ${wordB} = ${wordA + wordB} viên bi.`,
    },
    {
      level: 3, phase: "normal", difficulty: "D", skill: "Tìm số chưa biết",
      prompt: `☐ − ${unkA} = ${unkC}. Số ban đầu là?`,
      options: makeOptions(String(unkA + unkC), [String(unkA + unkC + 1), String(unkA + unkC + 2), String(Math.max(1, unkA + unkC - 1))]),
      correctAnswer: String(unkA + unkC),
      explanation: `Số ban đầu là ${unkA} + ${unkC} = ${unkA + unkC}.`,
    }
  );

  /* Level 4 – Các số đến 100 */
  const tens = randInt(2, 9);
  const units = randInt(1, 9);
  const before = randInt(21, 99);
  const bigA = randInt(21, 79);
  const bigB = bigA + randInt(1, 20);
  const seqStart = randInt(11, 17);
  result.push(
    {
      level: 4, phase: "normal", difficulty: "C", skill: "Chục và đơn vị",
      prompt: `Số gồm ${tens} chục và ${units} đơn vị là số nào?`,
      options: makeOptions(String(tens * 10 + units), [String(tens * 10 + units + 1), String(tens * 10 + units + 10), String(Math.max(10, tens * 10 + units - 1))]),
      correctAnswer: String(tens * 10 + units),
      explanation: `${tens} chục là ${tens * 10}, thêm ${units} đơn vị được ${tens * 10 + units}.`,
    },
    {
      level: 4, phase: "normal", difficulty: "C", skill: "Đọc số",
      prompt: "Số 15 đọc là gì?",
      options: makeOptions("Mười lăm", ["Mười bốn", "Mười sáu", "Mười một"]),
      correctAnswer: "Mười lăm",
      explanation: "15 đọc là mười lăm.",
    },
    {
      level: 4, phase: "normal", difficulty: "C", skill: "Số liền trước",
      prompt: `Số liền trước của ${before} là số nào?`,
      options: makeOptions(String(before - 1), [String(before + 1), String(before + 2), String(before - 2)]),
      correctAnswer: String(before - 1),
      explanation: `Đếm lùi: ${before}, ${before - 1}. Vậy số liền trước là ${before - 1}.`,
    },
    {
      level: 4, phase: "normal", difficulty: "C", skill: "So sánh số đến 100",
      prompt: `Điền dấu thích hợp: ${bigA} ☐ ${bigB}`,
      options: makeOptions("<", [">", "=", "+"]),
      correctAnswer: "<",
      explanation: `${bigA} bé hơn ${bigB} nên điền dấu <.`,
    },
    {
      level: 4, phase: "normal", difficulty: "C", skill: "Dãy số 11–20",
      prompt: `Điền số còn thiếu: ${seqStart}, ${seqStart + 1}, ☐, ${seqStart + 3}`,
      options: makeOptions(String(seqStart + 2), [String(seqStart + 4), String(seqStart + 5), String(seqStart + 6)]),
      correctAnswer: String(seqStart + 2),
      explanation: `Dãy số liên tiếp: ${seqStart}, ${seqStart + 1}, ${seqStart + 2}, ${seqStart + 3}.`,
    }
  );

  /* Level 5 – Cộng và trừ trong phạm vi 100 */
  const roundA = randInt(1, 6);
  const roundB = randInt(1, 9 - roundA);
  const subX = randInt(5, 9);
  const subY = randInt(1, 4);
  const fillTens = randInt(1, 5);
  const fillTarget = fillTens + randInt(1, 8 - fillTens);
  const flowers = randInt(20, 60);
  const moreFlowers = randInt(5, 20);
  const backTens = randInt(1, 7);
  result.push(
    {
      level: 5, phase: "normal", difficulty: "D", skill: "Cộng tròn chục",
      prompt: `${roundA * 10} + ${roundB * 10} = ?`,
      options: makeOptions(String((roundA + roundB) * 10), [String((roundA + roundB) * 10 + 10), String((roundA + roundB) * 10 + 20), String((roundA + roundB) * 10 - 10)]),
      correctAnswer: String((roundA + roundB) * 10),
      explanation: `${roundA} chục cộng ${roundB} chục bằng ${roundA + roundB} chục, tức ${(roundA + roundB) * 10}.`,
    },
    {
      level: 5, phase: "normal", difficulty: "D", skill: "Trừ không nhớ",
      prompt: `${subX * 10 + subY} − ${subY * 10} = ?`,
      options: makeOptions(String(subX * 10), [String(subX * 10 + 10), String(subX * 10 + 5), String(subX * 10 - 10)]),
      correctAnswer: String(subX * 10),
      explanation: `Bớt đi ${subY * 10} từ ${subX * 10 + subY} còn ${subX * 10}.`,
    },
    {
      level: 5, phase: "normal", difficulty: "D", skill: "Điền số",
      prompt: `${fillTens * 10} + ☐ = ${fillTarget * 10}. Số cần điền là?`,
      options: makeOptions(String((fillTarget - fillTens) * 10), [String((fillTarget - fillTens) * 10 + 10), String((fillTarget - fillTens) * 10 + 20), String((fillTarget - fillTens) * 10 - 10)]),
      correctAnswer: String((fillTarget - fillTens) * 10),
      explanation: `Vì ${fillTarget * 10} − ${fillTens * 10} = ${(fillTarget - fillTens) * 10}.`,
    },
    {
      level: 5, phase: "normal", difficulty: "D", skill: "Bài toán có lời văn",
      prompt: `Vườn có ${flowers} bông hoa, trồng thêm ${moreFlowers} bông nữa. Vườn có tất cả bao nhiêu bông hoa?`,
      options: makeOptions(`${flowers + moreFlowers} bông`, [`${flowers + moreFlowers + 10} bông`, `${flowers + moreFlowers + 20} bông`, `${Math.max(1, flowers + moreFlowers - 10)} bông`]),
      correctAnswer: `${flowers + moreFlowers} bông`,
      explanation: `Ta cộng: ${flowers} + ${moreFlowers} = ${flowers + moreFlowers} bông hoa.`,
    },
    {
      level: 5, phase: "normal", difficulty: "D", skill: "Tính nhẩm",
      prompt: `Số nào cộng với ${backTens * 10} bằng ${(backTens + 1) * 10}?`,
      options: makeOptions("10", ["20", "30", "40"]),
      correctAnswer: "10",
      explanation: `${backTens * 10} + 10 = ${(backTens + 1) * 10}.`,
    }
  );

  /* Level 6 – Toán học trong cuộc sống */
  const clockHour = randInt(1, 12);
  const money = randInt(11, 19);
  const cost = randInt(2, 9);
  result.push(
    {
      level: 6, phase: "normal", difficulty: "D", skill: "Hình học",
      prompt: "Hình nào không có cạnh?",
      options: makeOptions("Hình tròn", ["Hình vuông", "Hình tam giác", "Hình chữ nhật"]),
      correctAnswer: "Hình tròn",
      explanation: "Hình tròn là đường cong khép kín, không có cạnh.",
    },
    {
      level: 6, phase: "normal", difficulty: "E", skill: "Độ dài",
      prompt: "Chiếc bút chì dài khoảng bao nhiêu?",
      options: makeOptions("10 cm", ["1 cm", "50 cm", "1 m"]),
      correctAnswer: "10 cm",
      explanation: "Bút chì thường dài khoảng 10 cm.",
    },
    {
      level: 6, phase: "normal", difficulty: "E", skill: "Xem giờ",
      prompt: `Kim ngắn chỉ số ${clockHour}, kim dài chỉ số 12. Đồng hồ chỉ mấy giờ?`,
      options: makeOptions(`${clockHour} giờ`, [`${clockHour + 1} giờ`, `${Math.max(1, clockHour - 1)} giờ`, `${Math.max(1, clockHour - 2)} giờ`]),
      correctAnswer: `${clockHour} giờ`,
      explanation: `Kim ngắn chỉ giờ, kim dài chỉ phút. Đồng hồ chỉ ${clockHour} giờ.`,
    },
    {
      level: 6, phase: "normal", difficulty: "D", skill: "Ngày và tuần",
      prompt: "Một tuần lễ có bao nhiêu ngày?",
      options: makeOptions("7 ngày", ["5 ngày", "6 ngày", "10 ngày"]),
      correctAnswer: "7 ngày",
      explanation: "Một tuần lễ có 7 ngày.",
    },
    {
      level: 6, phase: "normal", difficulty: "E", skill: "Bài toán thực tế",
      prompt: `Bạn có ${money} nghìn đồng, mua cái bánh hết ${cost} nghìn đồng. Bạn còn lại bao nhiêu tiền?`,
      options: makeOptions(`${money - cost} nghìn đồng`, [`${money - cost + 1} nghìn đồng`, `${money - cost + 2} nghìn đồng`, `${money - cost + 10} nghìn đồng`]),
      correctAnswer: `${money - cost} nghìn đồng`,
      explanation: `${money} − ${cost} = ${money - cost} nghìn đồng.`,
    }
  );

  return result;
}

function surveyFallback(count: number): SurveyQuestion[] {
  return buildSurveyFallback().slice(0, count).map((question, index) => ({
    ...question,
    id: index + 1,
  }));
}

const SURVEY_DIFFICULTIES: Difficulty[] = ["A", "B", "C", "D", "E"];

function isValidSurveyQuestion(value: unknown): value is SurveyQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<SurveyQuestion>;
  return (
    typeof question.level === "number" &&
    question.level >= 1 &&
    question.level <= 6 &&
    typeof question.prompt === "string" &&
    isVietnameseQuestionText(question.prompt, true) &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    question.options.every((option) => typeof option === "string" && isVietnameseAnswerOption(option)) &&
    typeof question.correctAnswer === "string" &&
    question.options.includes(question.correctAnswer) &&
    typeof question.explanation === "string" &&
    isVietnameseQuestionText(question.explanation) &&
    (question.skill === undefined ||
      (typeof question.skill === "string" && isVietnameseQuestionText(question.skill)))
  );
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

function containsEmoji(value: string) {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value);
}

function normalizeSurveyQuestion(question: SurveyQuestion, index: number): SurveyQuestion {
  return {
    ...question,
    id: index + 1,
    phase: "normal",
    difficulty: SURVEY_DIFFICULTIES.includes(question.difficulty) ? question.difficulty : "B",
    skill: typeof question.skill === "string" && question.skill.trim() ? question.skill : "Kiến thức",
    illustration:
      typeof question.illustration === "string" &&
      question.illustration.trim() &&
      containsEmoji(question.illustration) &&
      !IMAGE_FILE_PATTERN.test(question.illustration.trim())
        ? question.illustration.trim()
        : undefined,
  };
}

/**
 * Sinh đề khảo sát đầu vào 30 câu ngẫu nhiên cho học sinh lớp 1.
 * Phân bổ đều 6 level của chương trình, mỗi level 5 câu.
 */
export async function generateSurvey(input: GenerateSurveyInput = {}): Promise<GeneratedSurvey> {
  const count = Math.max(1, Math.min(30, input.count ?? 30));
  const response = await requestOllamaChat(
    [
        {
          role: "system",
          content:
            "Bạn là chuyên gia khảo sát đầu vào môn Toán lớp 1 tại Việt Nam. Tạo ĐÚNG 30 câu hỏi trắc nghiệm ngẫu nhiên, phân bổ đều 6 level của chương trình (mỗi level đúng 5 câu): Level 1 Làm quen với Toán học (vị trí, hình dạng, nhiều hơn-ít hơn, bằng nhau, đếm đồ vật); Level 2 Các số từ 0 đến 10; Level 3 Cộng và trừ trong phạm vi 10; Level 4 Các số đến 100; Level 5 Cộng và trừ trong phạm vi 100; Level 6 Toán học trong cuộc sống (hình học, độ dài, xem giờ, ngày-tuần, bài toán thực tế). Mỗi câu có đúng 4 lựa chọn, correctAnswer phải nằm trong options, id từ 1 đến 30 theo thứ tự level, phase luôn là 'normal', difficulty tăng dần từ A (Level 1) đến E (Level 6). Câu hỏi PHẢI tự trả lời được. Nếu câu cần hình minh họa (vị trí đồ vật, đếm đồ vật...), hãy đặt illustration là chuỗi EMOJI xếp đúng như bức tranh (có thể nhiều dòng bằng ký tự xuống dòng), ví dụ quả bóng ở trên ghế: '⚽\n🪑'; đếm táo: '🍎 🍎 🍎'. TUYỆT ĐỐI không dùng tên file ảnh. Không đặt câu hỏi cần hình mà không có illustration emoji. Trả về JSON {questions:[{id,level,difficulty,skill,prompt,options,correctAnswer,explanation,illustration?}]}. Không dùng kiến thức vượt chương trình lớp 1.",
        },
        {
          role: "user",
          content: JSON.stringify({
            count,
            levels: [
              { level: 1, title: "Làm quen với Toán học", difficulty: "A" },
              { level: 2, title: "Các số từ 0 đến 10", difficulty: "B" },
              { level: 3, title: "Cộng và trừ trong phạm vi 10", difficulty: "C" },
              { level: 4, title: "Các số đến 100", difficulty: "C" },
              { level: 5, title: "Cộng và trừ trong phạm vi 100", difficulty: "D" },
              { level: 6, title: "Toán học trong cuộc sống", difficulty: "E" },
            ],
            requiredFields: ["id", "level", "difficulty", "skill", "prompt", "options", "correctAnswer", "explanation"],
          }),
        },
    ],
    0.7,
  );

  if (!response.ok) return { source: "question-bank", questions: surveyFallback(count) };

  try {
    const parsed = await parseOllamaResponse(response);
    if (!Array.isArray(parsed?.questions)) return { source: "question-bank", questions: surveyFallback(count) };
    const valid = parsed.questions
      .filter(isValidSurveyQuestion)
      .map((question: SurveyQuestion, index: number) => normalizeSurveyQuestion(question, index))
      .slice(0, count);
    if (valid.length === 0) return { source: "question-bank", questions: surveyFallback(count) };
    const missing = count - valid.length;
    return {
      source: "ai",
      questions: missing > 0 ? [...valid, ...surveyFallback(missing).map((question) => ({ ...question, id: valid.length + question.id }))] : valid,
    };
  } catch {
    return { source: "question-bank", questions: surveyFallback(count) };
  }
}

/* ------------------------------------------------------------------ */
/*  Biến thể câu khảo sát: cùng dạng, khác giá trị                      */
/* ------------------------------------------------------------------ */

export type GeneratedVariant = {
  source: "ai" | "local";
  question: SurveyQuestion;
};
export async function generateSurveyVariant(question: SurveyQuestion): Promise<GeneratedVariant> {
  const response = await requestOllamaChat(
    [
        {
          role: "system",
          content:
            "Bạn là chuyên gia Toán lớp 1. Nhận một câu hỏi trắc nghiệm, hãy tạo một câu hỏi TƯƠNG TỰ: cùng dạng toán, cùng kỹ năng, cùng level và độ khó, giữ nguyên cấu trúc câu nhưng ĐỔI GIÁ TRỊ SỐ (và đối tượng nếu cần). Đảm bảo đúng 4 lựa chọn, correctAnswer nằm trong options và khớp đúng phép toán trong câu. Nếu câu cần hình minh họa, đặt illustration là chuỗi EMOJI xếp đúng bức tranh; không dùng tên file ảnh. Trả về JSON {question:{id,level,difficulty,skill,prompt,options,correctAnswer,explanation,illustration?}}.",
        },
        {
          role: "user",
          content: JSON.stringify({ question }),
        },
    ],
    0.7,
  );

  if (!response.ok) return { source: "local", question: makeVariant(question) };

  try {
    const parsed = await parseOllamaResponse(response);
    const candidate = parsed?.question;
    if (
      candidate &&
      typeof candidate === "object" &&
      "level" in candidate &&
      candidate.level === question.level &&
      isValidSurveyQuestion(candidate)
    ) {
      return { source: "ai", question: normalizeSurveyQuestion(candidate, question.id - 1) };
    }
    return { source: "local", question: makeVariant(question) };
  } catch {
    return { source: "local", question: makeVariant(question) };
  }
}

/* ------------------------------------------------------------------ */
/*  Đánh giá lộ trình bằng AI (sau khảo sát + theo dõi quá trình học)  */
/* ------------------------------------------------------------------ */

export type EvaluatePathInput = {
  placement: PlacementResult;
  attempts: AttemptSummary[];
};

export type GeneratedEvaluation = {
  source: "ai" | "local";
  evaluation: PathEvaluation;
};

function isValidEvaluation(value: unknown): value is PathEvaluation {
  if (!value || typeof value !== "object") return false;
  const evaluation = value as Partial<PathEvaluation>;
  return (
    typeof evaluation.intelligenceScore === "number" &&
    typeof evaluation.startLevel === "number" &&
    typeof evaluation.lessonIndex === "number" &&
    Array.isArray(evaluation.recommendedDifficulties) &&
    typeof evaluation.summary === "string" &&
    Array.isArray(evaluation.suggestions)
  );
}

function normalizeEvaluation(value: PathEvaluation, placement: PlacementResult): PathEvaluation {
  const allowed: Difficulty[] = ["A", "B", "C", "D", "E"];
  return {
    intelligenceScore: Math.max(0, Math.min(100, Math.round(value.intelligenceScore))),
    startLevel: Math.max(1, Math.min(6, Math.round(value.startLevel) || placement.level)),
    lessonIndex: Math.max(0, Math.round(value.lessonIndex)),
    recommendedDifficulties:
      Array.isArray(value.recommendedDifficulties) && value.recommendedDifficulties.length
        ? value.recommendedDifficulties.filter((item): item is Difficulty => allowed.includes(item as Difficulty)).slice(0, 5)
        : difficultiesForScore(value.intelligenceScore),
    summary: typeof value.summary === "string" && value.summary.trim() ? value.summary : evaluatePathLocal(placement, []).summary,
    suggestions:
      Array.isArray(value.suggestions) && value.suggestions.length
        ? value.suggestions.filter((item): item is string => typeof item === "string").slice(0, 4)
        : evaluatePathLocal(placement, []).suggestions,
  };
}

/**
 * Đánh giá lộ trình: AI phân tích kết quả khảo sát + lịch sử làm bài để
 * đưa ra chỉ số tổng thông minh 0–100, điểm bắt đầu và gợi ý học tập.
 * Khi AI không dùng được thì tính toán cục bộ.
 */
export async function evaluatePathWithAI(input: EvaluatePathInput): Promise<GeneratedEvaluation> {
  const local = evaluatePathLocal(input.placement, input.attempts);
  const response = await requestOllamaChat(
    [
        {
          role: "system",
          content:
            "Bạn là chuyên gia đánh giá năng lực Toán lớp 1. Dựa trên kết quả khảo sát đầu vào (số câu đúng từng level từ 1 đến 6, mỗi level tối đa 5 câu) và lịch sử làm bài tập, hãy đánh giá và trả về JSON {evaluation:{intelligenceScore,startLevel,lessonIndex,recommendedDifficulties,summary,suggestions}}. intelligenceScore là chỉ số tổng thông minh từ 0 đến 100. startLevel (1-6) và lessonIndex (0-based) là điểm bắt đầu học hiện tại. recommendedDifficulties là danh sách con của ['A','B','C','D','E'] phù hợp cá nhân. summary là 1-2 câu tiếng Việt. suggestions là 2-4 gợi ý ngắn.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
    ],
    0.35,
  );

  if (!response.ok) return { source: "local", evaluation: local };

  try {
    const parsed = await parseOllamaResponse(response);
    if (!isValidEvaluation(parsed?.evaluation)) return { source: "local", evaluation: local };
    return { source: "ai", evaluation: normalizeEvaluation(parsed.evaluation, input.placement) };
  } catch {
    return { source: "local", evaluation: local };
  }
}
