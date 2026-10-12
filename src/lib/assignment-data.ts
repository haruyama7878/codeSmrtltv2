export type Assignment = {
  id: string;
  title: string;
  className?: string; // "1A" | "1B"
  dueDate: string; // ISO datetime
  totalStudents: number;
  submittedCount: number;
  gradedCount: number;
  classroomId?: string;
  classroom?: { id: string; name: string; label: string };
  topic?: string;
  curriculumLevel?: number;
  durationMinutes?: number;
  questions?: import("./learning-data").QuizQuestion[];
  submission?: {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    submittedAt: string;
  } | null;
};

export type AssignmentUrgency = "overdue" | "soon" | "near" | "ok";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function createSeedAssignments(): Assignment[] {
  const now = Date.now();
  const at = (hoursFromNow: number) => new Date(now + hoursFromNow * HOUR).toISOString();

  return [
    { id: "as-01", title: "Ôn tập cộng trừ phạm vi 10", className: "1A", dueDate: at(5), totalStudents: 10, submittedCount: 6, gradedCount: 3 },
    { id: "as-02", title: "Phép trừ trong phạm vi 10", className: "1B", dueDate: at(2), totalStudents: 10, submittedCount: 4, gradedCount: 1 },
    { id: "as-03", title: "Kiểm tra 15 phút: So sánh số", className: "1A", dueDate: at(30), totalStudents: 10, submittedCount: 8, gradedCount: 5 },
    { id: "as-04", title: "Đếm và so sánh số", className: "1B", dueDate: at(74), totalStudents: 10, submittedCount: 10, gradedCount: 9 },
  ];
}

export function urgencyOf(dueDate: string, now = Date.now()): AssignmentUrgency {
  const diff = new Date(dueDate).getTime() - now;
  if (diff < 0) return "overdue";
  if (diff < DAY) return "soon";
  if (diff < 2 * DAY) return "near";
  return "ok";
}

export function deadlineLabel(dueDate: string, now = Date.now()) {
  const diff = new Date(dueDate).getTime() - now;
  if (diff < 0) return `Quá hạn ${Math.max(1, Math.round(-diff / HOUR))} giờ`;
  const hours = Math.round(diff / HOUR);
  if (hours < 24) return `Còn ${Math.max(1, hours)} giờ`;
  const days = Math.round(diff / DAY);
  return `Còn ${days} ngày`;
}

export const urgencyLabels: Record<AssignmentUrgency, string> = {
  overdue: "Quá hạn",
  soon: "Sắp hết hạn",
  near: "Sắp đến hạn",
  ok: "Còn thời gian",
};
