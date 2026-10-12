import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { PlacementResult } from "@/lib/placement";

export const userRoleEnum = pgEnum("user_role", ["student", "teacher", "admin"]);
export const difficultyEnum = pgEnum("difficulty", ["A", "B", "C", "D", "E"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    authUserId: uuid("auth_user_id").unique(),
    email: varchar("email", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    role: userRoleEnum("role").notNull().default("student"),
    avatar: varchar("avatar", { length: 12 }).notNull().default("MA"),
    firstName: varchar("first_name", { length: 80 }),
    lastName: varchar("last_name", { length: 80 }),
    phone: varchar("phone", { length: 20 }),
    province: varchar("province", { length: 120 }),
    district: varchar("district", { length: 120 }),
    school: varchar("school", { length: 180 }),
    schoolLevel: varchar("school_level", { length: 40 }),
    grade: varchar("grade", { length: 40 }),
    className: varchar("class_name", { length: 80 }),
    birthDate: varchar("birth_date", { length: 20 }),
    avatarUrl: text("avatar_url"),
    placement: jsonb("placement").$type<PlacementResult>(),
    lotusPoints: integer("lotus_points").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull(),
    curriculumLevel: integer("curriculum_level").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    topic: varchar("topic", { length: 180 }).notNull(),
    competency: text("competency").notNull(),
    questionCount: integer("question_count").notNull().default(10),
    published: boolean("published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("lessons_slug_idx").on(table.slug)],
);

export const quizAttempts = pgTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonSlug: varchar("lesson_slug", { length: 120 }).notNull(),
  correctAnswers: integer("correct_answers").notNull(),
  totalQuestions: integer("total_questions").notNull().default(10),
  score: integer("score").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  highestDifficulty: difficultyEnum("highest_difficulty").notNull(),
  answers: jsonb("answers").$type<Array<{ questionId: number; answer: string; correct: boolean }>>().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const classrooms = pgTable(
  "classrooms",
  {
    id: serial("id").primaryKey(),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    label: varchar("label", { length: 40 }).notNull(),
    subject: varchar("subject", { length: 80 }).notNull().default("Toán"),
    description: varchar("description", { length: 500 }).notNull().default(""),
    color: varchar("color", { length: 20 }).notNull().default("purple"),
    joinCode: varchar("join_code", { length: 12 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("classrooms_teacher_label_idx").on(table.teacherId, table.label)],
);

export const classroomMemberships = pgTable(
  "classroom_memberships",
  {
    id: serial("id").primaryKey(),
    classroomId: integer("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("classroom_memberships_class_student_idx").on(table.classroomId, table.studentId)],
);

export const classroomInvitations = pgTable(
  "classroom_invitations",
  {
    id: serial("id").primaryKey(),
    classroomId: integer("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("classroom_invitations_class_student_idx").on(table.classroomId, table.studentId)],
);

export const classroomAssignments = pgTable("classroom_assignments", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id")
    .notNull()
    .references(() => classrooms.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  topic: varchar("topic", { length: 180 }).notNull(),
  curriculumLevel: integer("curriculum_level").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  questions: jsonb("questions").$type<import("@/lib/learning-data").QuizQuestion[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assignmentProjects = pgTable(
  "assignment_projects",
  {
    id: serial("id").primaryKey(),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    topic: varchar("topic", { length: 180 }).notNull(),
    curriculumLevel: integer("curriculum_level").notNull(),
    questions: jsonb("questions").$type<import("@/lib/learning-data").QuizQuestion[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assignment_projects_teacher_name_idx").on(table.teacherId, table.name)],
);

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => classroomAssignments.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    correctAnswers: integer("correct_answers").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    answers: jsonb("answers").$type<Array<{ questionId: number; answer: string; correct: boolean }>>().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("assignment_submissions_assignment_student_idx").on(table.assignmentId, table.studentId)],
);

export const dailyActivity = pgTable(
  "daily_activity",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityDate: varchar("activity_date", { length: 10 }).notNull(),
    minutesLearned: integer("minutes_learned").notNull().default(0),
    lessonsCompleted: integer("lessons_completed").notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
  },
  (table) => [uniqueIndex("daily_activity_user_date_idx").on(table.userId, table.activityDate)],
);

export type User = typeof users.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
