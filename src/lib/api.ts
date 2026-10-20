import { supabase } from "@/lib/supabase";
import type { Assignment } from "@/lib/assignment-data";
import type { Classroom, Student } from "@/lib/student-data";

export type Role = "student" | "teacher" | "admin";

export type LessonRecord = {
  id: number;
  slug: string;
  curriculumLevel: number;
  title: string;
  topic: string;
  competency: string;
  questionCount: number;
};

export type DashboardData = {
  user: {
    id: number;
    displayName: string;
    email: string;
    role: Role;
    avatar: string;
    avatarUrl?: string;
    lotusPoints: number;
    currentStreak: number;
  };
  stats: {
    completedLessons: number;
    totalLessons: number;
    averageScore: number;
    learningMinutes: number;
  };
  recentAttempts: Array<{
    id: number;
    lessonSlug: string;
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    durationSeconds: number;
    completedAt: string;
  }>;
  todayActivity: {
    minutesLearned: number;
    lessonsCompleted: number;
    pointsEarned: number;
    correctAnswers: number;
    attempts: number;
    accuracySum: number;
  };
  weeklyLeaderboard: Array<{
    name: string;
    avatar: string;
    points: number;
    isCurrentUser: boolean;
  }>;
  lowScoreAttempts: number;
  placement: import("./placement").PlacementResult | null;
  attemptHistory: import("./placement").AttemptSummary[];
};

export type AttemptPayload = {
  lessonSlug: string;
  correctAnswers: number;
  totalQuestions: number;
  score: number;
  durationSeconds: number;
  highestDifficulty: "A" | "B" | "C" | "D" | "E";
  answers: Array<{ questionId: number; answer: string; correct: boolean }>;
};

export type ClassroomDetails = {
  classroom: Classroom;
  students: Student[];
};

export type ClassroomInvitation = {
  id: string;
  classroomId: string;
  classroomName: string;
  classroomLabel: string;
  subject: string;
  teacherName: string;
  createdAt: string;
};

export type AssignmentProject = {
  id: string;
  name: string;
  topic: string;
  curriculumLevel: number;
  updatedAt: string;
  questions?: import("./learning-data").QuizQuestion[];
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Không thể kết nối tới máy chủ");
  }

  return response.json() as Promise<T>;
}

export const smartLotusApi = {
  getLessons() {
    return request<{ lessons: LessonRecord[] }>("/api/lessons");
  },
  getDashboard(role: Role = "student") {
    return request<DashboardData>(`/api/dashboard?role=${role}`);
  },
  submitAttempt(payload: AttemptPayload) {
    return request<{ ok: true; attemptId: number; totalPoints: number }>("/api/attempts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getClassrooms() {
    return request<{ classrooms: Classroom[] }>("/api/classrooms");
  },
  getClassroom(classroomId: string) {
    return request<ClassroomDetails>(`/api/classrooms/${encodeURIComponent(classroomId)}`);
  },
  createClassroom(classroom: Omit<Classroom, "id" | "joinCode" | "teacherName" | "studentCount">) {
    return request<{ classroom: Classroom }>("/api/classrooms", {
      method: "POST",
      body: JSON.stringify(classroom),
    });
  },
  updateClassroom(classroom: Classroom) {
    return request<{ classroom: Classroom }>("/api/classrooms", {
      method: "PATCH",
      body: JSON.stringify(classroom),
    });
  },
  deleteClassroom(classroomId: string) {
    return request<{ ok: true }>(`/api/classrooms/${encodeURIComponent(classroomId)}`, { method: "DELETE" });
  },
  joinClassroom(code: string) {
    return request<{ classroom: Classroom }>("/api/classrooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },
  getStudentCode() {
    return request<{ studentCode: string }>("/api/student-code");
  },
  inviteStudent(classroomId: string, studentCode: string) {
    return request<{ invitation: { id: string; status: string } }>(`/api/classrooms/${encodeURIComponent(classroomId)}/invite`, {
      method: "POST",
      body: JSON.stringify({ studentCode }),
    });
  },
  getClassroomInvitations() {
    return request<{ invitations: ClassroomInvitation[] }>("/api/classroom-invitations");
  },
  respondToClassroomInvitation(invitationId: string, decision: "accepted" | "declined") {
    return request<{ invitation: { id: string; status: string } }>(`/api/classroom-invitations/${encodeURIComponent(invitationId)}`, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    });
  },
  getAssignments() {
    return request<{ assignments: Assignment[] }>("/api/assignments");
  },
  getAssignmentProjects() {
    return request<{ projects: AssignmentProject[] }>("/api/assignment-projects");
  },
  getAssignmentProject(projectId: string) {
    return request<{ project: AssignmentProject }>(`/api/assignment-projects?id=${encodeURIComponent(projectId)}`);
  },
  saveAssignmentProject(project: Omit<AssignmentProject, "id" | "updatedAt"> & { id?: string }) {
    return request<{ project: AssignmentProject }>("/api/assignment-projects", {
      method: project.id ? "PATCH" : "POST",
      body: JSON.stringify(project),
    });
  },
  deleteAssignmentProject(projectId: string) {
    return request<{ ok: true }>(`/api/assignment-projects?id=${encodeURIComponent(projectId)}`, { method: "DELETE" });
  },
  getLibraryImages() {
    return request<{ categories: Array<{ category: "canh_vat" | "do_vat"; files: Array<{ name: string; src: string }> }> }>("/api/library-assets");
  },
  async removeImageBackground(file: File) {
    const { data: { session } } = await supabase.auth.getSession();
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch("/api/remove-image-background", {
      method: "POST",
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: form,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? "Không thể tách nền ảnh");
    }
    return response.blob();
  },
  createAssignment(input: {
    classroomId: string;
    title: string;
    topic: string;
    curriculumLevel: number;
    dueAt: string;
    durationMinutes: number;
    questions: import("./learning-data").QuizQuestion[];
  }) {
    return request<{ assignment: Assignment }>("/api/assignments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  submitAssignment(assignmentId: string, input: {
    durationSeconds: number;
    challengeDurationSeconds: number;
    answers: Array<{ questionId: number; answer: string }>;
  }) {
    return request<{ submission: NonNullable<Assignment["submission"]> & { score: number } }>(
      `/api/assignments/${encodeURIComponent(assignmentId)}/submit`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  savePlacement(placement: import("./placement").PlacementResult) {
    return request<{ ok: true }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ placement }),
    });
  },
  updateProfile(profile: { displayName: string; avatarUrl: string }) {
    return request<{ ok: true }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(profile),
    });
  },
  generateQuiz(input: { topic: string; curriculumLevel: number; difficulties: Array<"A" | "B" | "C" | "D" | "E">; count?: number; intelligenceScore?: number; variationSeed?: string; excludePrompts?: string[] }) {
    return request<{ source: "ai" | "question-bank"; questions: import("./learning-data").QuizQuestion[] }>("/api/generate-quiz", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  evaluatePath(input: { placement: import("./placement").PlacementResult; attempts: import("./placement").AttemptSummary[] }) {
    return request<{ source: "ai" | "local"; evaluation: import("./placement").PathEvaluation }>("/api/evaluate-path", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  generateSurvey(count = 30) {
    return request<{ source: "ai" | "question-bank"; questions: import("./learning-data").SurveyQuestion[] }>("/api/generate-survey", {
      method: "POST",
      body: JSON.stringify({ count }),
    });
  },
  generateSurveyVariant(question: import("./learning-data").SurveyQuestion) {
    return request<{ source: "ai" | "local"; question: import("./learning-data").SurveyQuestion }>("/api/generate-survey-variant", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
  },
};
