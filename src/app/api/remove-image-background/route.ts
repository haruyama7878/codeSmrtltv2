import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role !== "teacher" && user.role !== "admin") {
      return Response.json({ message: "Chỉ giáo viên mới được xử lý hình ảnh" }, { status: 403 });
    }
    const serviceUrl = process.env.REMBG_API_URL;
    if (!serviceUrl) {
      return Response.json({ message: "Máy chủ tách nền chưa được cấu hình (REMBG_API_URL)." }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return Response.json({ message: "Ảnh cần là PNG, JPEG hoặc WebP và nhỏ hơn 10 MB." }, { status: 400 });
    }

    const serviceForm = new FormData();
    serviceForm.append("file", file, file.name || "image.png");
    const response = await fetch(serviceUrl, {
      method: "POST",
      body: serviceForm,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error("Background removal service returned", response.status);
      return Response.json({ message: "Máy chủ tách nền không xử lý được ảnh." }, { status: 502 });
    }
    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType || !["image/png", "image/webp"].includes(contentType)) {
      console.error("Background removal service returned an unsupported content type", contentType);
      return Response.json({ message: "Máy chủ tách nền trả về định dạng ảnh không hỗ trợ." }, { status: 502 });
    }
    const reader = response.body?.getReader();
    if (!reader) return Response.json({ message: "Máy chủ tách nền không trả về ảnh." }, { status: 502 });
    const chunks: Uint8Array[] = [];
    let outputSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputSize += value.byteLength;
      if (outputSize > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return Response.json({ message: "Ảnh sau khi tách nền vượt quá giới hạn 10 MB." }, { status: 502 });
      }
      chunks.push(value);
    }
    if (outputSize < 1) {
      return Response.json({ message: "Ảnh sau khi tách nền vượt quá giới hạn 10 MB." }, { status: 502 });
    }
    const output = new Uint8Array(outputSize);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(output, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Remove image background error", error);
    return Response.json({ message: "Không thể kết nối máy chủ tách nền." }, { status: 502 });
  }
}
