import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ category: string; fileName: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { category, fileName } = await params;
  if (!["canh_vat", "do_vat"].includes(category) || !/^trang\d+_\d+\.png$/i.test(fileName)) {
    return Response.json({ message: "Hình ảnh không hợp lệ" }, { status: 400 });
  }

  try {
    const imagePath = path.join(process.cwd(), "library", category, fileName);
    const image = await readFile(imagePath);
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Read library image error", error);
    return Response.json({ message: "Không tìm thấy hình ảnh trong thư viện" }, { status: 404 });
  }
}
