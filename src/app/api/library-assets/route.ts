import { readdir } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const categories = ["canh_vat", "do_vat"] as const;

export async function GET() {
  try {
    const libraryRoot = path.join(process.cwd(), "library");
    const assets = await Promise.all(categories.map(async (category) => {
      const directory = path.join(libraryRoot, category);
      const files = await readdir(directory, { withFileTypes: true });
      return {
        category,
        files: files
          .filter((file) => file.isFile() && /\.png$/i.test(file.name))
          .map((file) => file.name)
          .sort((a, b) => a.localeCompare(b, "vi"))
          .map((name) => ({
            name,
            src: `/api/library-assets/${category}/${encodeURIComponent(name)}`,
          })),
      };
    }));
    return Response.json({ categories: assets }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("Load image library error", error);
    return Response.json({ message: "Không thể tải thư viện hình ảnh" }, { status: 500 });
  }
}
