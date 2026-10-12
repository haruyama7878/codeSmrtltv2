import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";
import type { PlacementResult } from "@/lib/placement";

export const dynamic = "force-dynamic";

function isPlacement(value: unknown): value is PlacementResult {
  if (!value || typeof value !== "object") return false;
  const placement = value as Partial<PlacementResult>;
  return Number.isInteger(placement.level) && placement.level! >= 1 && placement.level! <= 6
    && Number.isInteger(placement.lessonIndex) && placement.lessonIndex! >= 0
    && Array.isArray(placement.perLevelCorrect) && placement.perLevelCorrect.length === 6
    && placement.perLevelCorrect.every((count) => Number.isInteger(count) && count >= 0 && count <= 5);
}

export async function PUT(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const body = await request.json();
    if (!isPlacement(body.placement)) {
      return Response.json({ message: "Dữ liệu khảo sát không hợp lệ" }, { status: 400 });
    }
    const appUser = await getOrCreateAppUser(authUser);
    await db.update(users).set({ placement: body.placement }).where(eq(users.id, appUser.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Save placement error", error);
    return Response.json({ message: "Không thể lưu kết quả khảo sát" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const body = await request.json();
    if (typeof body.displayName !== "string" || body.displayName.trim().length < 2 || body.displayName.trim().length > 120) {
      return Response.json({ message: "Tên hiển thị không hợp lệ" }, { status: 400 });
    }
    if (typeof body.avatarUrl !== "string" || body.avatarUrl.length > 7_000_000) {
      return Response.json({ message: "Ảnh đại diện không hợp lệ" }, { status: 400 });
    }
    const appUser = await getOrCreateAppUser(authUser);
    await db.update(users).set({ displayName: body.displayName.trim(), avatarUrl: body.avatarUrl }).where(eq(users.id, appUser.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Update profile error", error);
    return Response.json({ message: "Không thể cập nhật hồ sơ" }, { status: 500 });
  }
}
