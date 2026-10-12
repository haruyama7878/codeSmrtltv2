import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PlacementResult } from "@/lib/placement";

function getSupabaseServerClient() {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedSupabaseUser(request: Request): Promise<SupabaseUser | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const client = getSupabaseServerClient();
  if (!token || !client) return null;
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

function metadataText(metadata: Record<string, unknown>, key: string, maxLength: number) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function metadataRole(metadata: Record<string, unknown>): User["role"] {
  const role = metadata.role;
  return role === "teacher" || role === "admin" ? role : "student";
}

function metadataPlacement(value: unknown): value is PlacementResult {
  if (!value || typeof value !== "object") return false;
  const placement = value as Partial<PlacementResult>;
  return Number.isInteger(placement.level) && placement.level! >= 1 && placement.level! <= 6
    && Number.isInteger(placement.lessonIndex) && placement.lessonIndex! >= 0
    && Array.isArray(placement.perLevelCorrect) && placement.perLevelCorrect.length === 6
    && placement.perLevelCorrect.every((count) => Number.isInteger(count) && count >= 0 && count <= 5);
}

export async function getOrCreateAppUser(authUser: SupabaseUser): Promise<User> {
  const metadata = authUser.user_metadata as Record<string, unknown>;
  const displayName = metadataText(metadata, "displayName", 120) ?? authUser.email?.split("@")[0] ?? "Học sinh";
  const savedPlacement = metadataPlacement(metadata.placement) ? metadata.placement : undefined;
  const avatarUrl = metadataText(metadata, "avatarUrl", 5000);
  const profile = {
    email: authUser.email ?? `${authUser.id}@supabase.local`,
    displayName,
    role: metadataRole(metadata),
    avatar: displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SL",
    firstName: metadataText(metadata, "firstName", 80),
    lastName: metadataText(metadata, "lastName", 80),
    phone: metadataText(metadata, "phone", 20),
    province: metadataText(metadata, "province", 120),
    district: metadataText(metadata, "district", 120),
    school: metadataText(metadata, "school", 180),
    schoolLevel: metadataText(metadata, "schoolLevel", 40),
    grade: metadataText(metadata, "grade", 40),
    className: metadataText(metadata, "className", 80),
    birthDate: metadataText(metadata, "birthDate", 20),
    ...(savedPlacement ? { placement: savedPlacement } : {}),
  };
  const [byAuthId] = await db.select().from(users).where(eq(users.authUserId, authUser.id)).limit(1);
  if (byAuthId) {
    const [updated] = await db.update(users).set(profile).where(eq(users.id, byAuthId.id)).returning();
    return updated;
  }

  const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (byEmail) {
    const [linked] = await db
      .update(users)
      .set({ ...profile, authUserId: authUser.id, avatarUrl })
      .where(eq(users.id, byEmail.id))
      .returning();
    return linked;
  }

  const [created] = await db.insert(users).values({ ...profile, authUserId: authUser.id, avatarUrl }).returning();
  return created;
}
