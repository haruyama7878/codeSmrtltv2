"use client";

import { useRef, useState } from "react";
import type { QuizImageAsset, QuizQuestion, QuizVisualElement } from "@/lib/learning-data";
import { smartLotusApi } from "@/lib/api";
import { Icon } from "./icons";

export type LibraryImage = { category: "canh_vat" | "do_vat"; name: string; src: string };

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function optimizedImageDataUrl(blob: Blob): Promise<string> {
  return createImageBitmap(blob).then((bitmap) => {
    const scale = Math.min(1, 1200 / bitmap.width, 900 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("Không thể đọc ảnh trong trình duyệt.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const result = canvas.toDataURL("image/webp", 0.82);
    if (result.length > 2_400_000) throw new Error("Ảnh sau khi thu nhỏ vẫn vượt quá 1,8 MB.");
    return result;
  });
}

type DragState =
  | { kind: "move"; pointerId: number; startX: number; startY: number; selected: number[]; initial: QuizVisualElement[] }
  | { kind: "select"; pointerId: number; startX: number; startY: number };

export default function AssignmentImageEditor({
  question,
  libraryImages,
  onChange,
}: {
  question: QuizQuestion;
  libraryImages: LibraryImage[];
  onChange: (update: Partial<QuizQuestion>) => void;
}) {
  const [category, setCategory] = useState<"canh_vat" | "do_vat">("do_vat");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(36);
  const [error, setError] = useState("");
  const [workingAssetId, setWorkingAssetId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [clipboardElements, setClipboardElements] = useState<QuizVisualElement[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const assets = question.imageAssets ?? [];
  const elements = question.visualElements ?? [];
  const filteredImages = libraryImages.filter((image) =>
    image.category === category && image.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  function stagePoint(clientX: number, clientY: number) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return null;
    return {
      x: Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - bounds.top) / bounds.height) * 100)),
    };
  }

  function ensureImageAsset(src: string, name: string) {
    const existing = assets.find((asset) => asset.src === src);
    if (existing) return existing;
    if (assets.length >= 30) {
      setError("Mỗi câu hỏi có thể dùng tối đa 30 ảnh.");
      return null;
    }
    const asset: QuizImageAsset = { id: newId(), src, name };
    onChange({ imageAssets: [...assets, asset] });
    return asset;
  }

  function addImage(src: string, name: string) {
    if (elements.length >= 40) {
      setError("Mỗi câu hỏi có thể bố trí tối đa 40 ảnh.");
      return;
    }
    const asset = ensureImageAsset(src, name);
    if (!asset) return;
    const offset = elements.length % 5;
    onChange({
      visualElements: [...elements, { assetId: asset.id, x: 18 + offset * 14, y: 35 + offset * 7, size: 24 }],
    });
    setSelected([elements.length]);
    setError("");
  }

  async function uploadImage(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Ảnh tải lên phải nhỏ hơn 12 MB.");
      return;
    }
    try {
      const src = await optimizedImageDataUrl(file);
      addImage(src, file.name || "Ảnh đã tải lên");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Không thể tải ảnh lên.");
    }
  }

  function addCopies(source: QuizVisualElement[]) {
    if (!source.length) return;
    const amount = Math.min(source.length, 40 - elements.length);
    if (!amount) {
      setError("Mỗi câu hỏi có thể bố trí tối đa 40 ảnh.");
      return;
    }
    const copies = source.slice(0, amount).map((element) => ({
      ...element,
      x: Math.min(96, element.x + 6),
      y: Math.min(92, element.y + 6),
    }));
    onChange({ visualElements: [...elements, ...copies] });
    setSelected(copies.map((_, index) => elements.length + index));
    setError("");
  }

  function copySelected() {
    setClipboardElements(elements.filter((_, index) => selected.includes(index)).map((element) => ({ ...element })));
    if (selected.length) setError("");
  }

  function deleteSelected() {
    if (!selected.length) return;
    const selectedSet = new Set(selected);
    onChange({ visualElements: elements.filter((_, index) => !selectedSet.has(index)) });
    setSelected([]);
  }

  function resizeSelected(size: number) {
    if (!selected.length) return;
    const selectedSet = new Set(selected);
    const firstSize = elements[selected[0]]?.size ?? size;
    const scale = size / firstSize;
    onChange({
      visualElements: elements.map((element, index) => selectedSet.has(index)
        ? { ...element, size: Math.max(4, Math.min(60, Math.round(element.size * scale))) }
        : element),
    });
  }

  function resizeSelectedBy(amount: number) {
    if (!selected.length) return;
    const selectedSet = new Set(selected);
    onChange({
      visualElements: elements.map((element, index) => selectedSet.has(index)
        ? { ...element, size: Math.max(4, Math.min(60, element.size + amount)) }
        : element),
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      event.preventDefault();
      copySelected();
    } else if ((event.ctrlKey || event.metaKey) && key === "v") {
      event.preventDefault();
      addCopies(clipboardElements);
    } else if (key === "delete" || key === "backspace") {
      event.preventDefault();
      deleteSelected();
    } else if ((event.ctrlKey || event.metaKey) && key === "a") {
      event.preventDefault();
      setSelected(elements.map((_, index) => index));
    }
  }

  function startSelection(event: React.PointerEvent<HTMLDivElement>) {
    const point = stagePoint(event.clientX, event.clientY);
    if (!point || (event.target as HTMLElement).closest(".assignment-image-stage-item")) return;
    if (!event.shiftKey) setSelected([]);
    dragState.current = { kind: "select", pointerId: event.pointerId, startX: point.x, startY: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectionBox({ left: point.x, top: point.y, width: 0, height: 0 });
    event.currentTarget.focus();
  }

  function startMoving(event: React.PointerEvent<HTMLDivElement>, index: number) {
    const point = stagePoint(event.clientX, event.clientY);
    if (!point) return;
    const nextSelected = event.shiftKey
      ? selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index]
      : selected.includes(index) ? selected : [index];
    setSelected(nextSelected);
    if (event.shiftKey && selected.includes(index)) return;
    dragState.current = {
      kind: "move",
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      selected: nextSelected,
      initial: elements.map((element) => ({ ...element })),
    };
    stageRef.current?.setPointerCapture(event.pointerId);
    stageRef.current?.focus();
    event.preventDefault();
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    const point = stagePoint(event.clientX, event.clientY);
    if (!drag || drag.pointerId !== event.pointerId || !point) return;
    if (drag.kind === "move") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      const selectedSet = new Set(drag.selected);
      onChange({
        visualElements: drag.initial.map((element, index) => selectedSet.has(index)
          ? { ...element, x: Math.max(2, Math.min(98, element.x + dx)), y: Math.max(5, Math.min(95, element.y + dy)) }
          : element),
      });
      return;
    }
    const left = Math.min(drag.startX, point.x);
    const top = Math.min(drag.startY, point.y);
    const right = Math.max(drag.startX, point.x);
    const bottom = Math.max(drag.startY, point.y);
    setSelectionBox({ left, top, width: right - left, height: bottom - top });
    const hits = elements.flatMap((element, index) =>
      element.x >= left && element.x <= right && element.y >= top && element.y <= bottom ? [index] : [],
    );
    setSelected((current) => drag.startX === point.x && drag.startY === point.y
      ? current
      : event.shiftKey ? [...new Set([...current, ...hits])] : hits);
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    setSelectionBox(null);
  }

  async function removeBackground(asset: QuizImageAsset) {
    setWorkingAssetId(asset.id);
    setError("");
    try {
      const imageResponse = await fetch(asset.src);
      if (!imageResponse.ok) throw new Error("Không thể tải ảnh để tách nền.");
      const input = await imageResponse.blob();
      const file = new File([input], `${asset.name}.png`, { type: input.type || "image/png" });
      const image = await smartLotusApi.removeImageBackground(file);
      const src = await optimizedImageDataUrl(image);
      onChange({ imageAssets: assets.map((item) => item.id === asset.id ? { ...item, src } : item) });
    } catch (backgroundError) {
      setError(backgroundError instanceof Error ? backgroundError.message : "Không thể tách nền ảnh.");
    } finally {
      setWorkingAssetId("");
    }
  }

  return (
    <section className="assignment-image-editor" aria-label="Hình ảnh câu hỏi">
      <div className="assignment-image-editor-heading">
        <strong>Hình ảnh đề bài</strong>
        <label className="assignment-image-upload">
          <Icon name="plus" size={14} /> Tải ảnh lên
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }}
          />
        </label>
      </div>

      <div className="assignment-paint-workspace">
        <aside className="assignment-paint-library">
          <div className="assignment-library-toolbar">
            <select value={category} onChange={(event) => { setCategory(event.target.value as typeof category); setVisibleCount(36); }}>
              <option value="do_vat">Đồ vật</option>
              <option value="canh_vat">Cảnh vật</option>
            </select>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(36); }} placeholder="Tìm ảnh..." aria-label="Tìm ảnh trong thư viện" />
          </div>
          <div className="assignment-library-grid">
            {filteredImages.slice(0, visibleCount).map((image) => {
              const existing = assets.some((asset) => asset.src === image.src);
              return (
                <div key={image.src} className="assignment-library-item">
                  <button type="button" title={`Thêm ${image.name} vào đề bài`} onClick={() => addImage(image.src, image.name)}>
                    <img src={image.src} alt={image.name} loading="lazy" />
                    <small>{image.name.replace(".png", "")}</small>
                  </button>
                  <button
                    type="button"
                    className={existing ? "is-added" : ""}
                    title="Thêm ảnh vào danh sách đáp án"
                    onClick={() => { if (ensureImageAsset(image.src, image.name)) setError(""); }}
                  >
                    {existing ? "Đã thêm" : "Dùng làm đáp án"}
                  </button>
                </div>
              );
            })}
            {filteredImages.length === 0 && <p>Không tìm thấy ảnh trong thư mục này.</p>}
          </div>
          {filteredImages.length > visibleCount && (
            <button type="button" className="assignment-library-more" onClick={() => setVisibleCount((count) => count + 36)}>
              Hiện thêm ảnh
            </button>
          )}
        </aside>

        <div className="assignment-paint-canvas">
          <div className="assignment-paint-toolbar">
            <span>Chọn hình · Kéo để di chuyển · Shift+chọn để thêm</span>
            <button type="button" onClick={copySelected} disabled={!selected.length} title="Sao chép (Ctrl+C)">Sao chép</button>
            <button type="button" onClick={() => addCopies(clipboardElements)} disabled={!clipboardElements.length || elements.length >= 40} title="Dán (Ctrl+V)">Dán</button>
            <button type="button" onClick={deleteSelected} disabled={!selected.length} title="Xóa hình đã chọn (Delete)">
              <Icon name="trash" size={14} /> Xóa đã chọn
            </button>
            <div className="assignment-image-size-control" aria-label="Điều chỉnh kích thước hình">
              <span>Thu phóng</span>
              <button type="button" onClick={() => resizeSelectedBy(-2)} disabled={!selected.length} aria-label="Thu nhỏ hình đã chọn">−</button>
              <input
                type="range"
                min={4}
                max={60}
                value={selected.length ? Math.round(elements[selected[0]]?.size ?? 24) : 24}
                disabled={!selected.length}
                onChange={(event) => resizeSelected(Number(event.target.value))}
                aria-label="Phóng to hoặc thu nhỏ hình đã chọn"
              />
              <button type="button" onClick={() => resizeSelectedBy(2)} disabled={!selected.length} aria-label="Phóng to hình đã chọn">+</button>
            </div>
            <small>{selected.length} đã chọn</small>
          </div>
          <div
            ref={stageRef}
            className="assignment-image-stage"
            tabIndex={0}
            onPointerDown={startSelection}
            onPointerMove={movePointer}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onKeyDown={handleKeyDown}
            aria-label="Vùng vẽ hình ảnh; dùng Ctrl+C, Ctrl+V và Delete"
          >
            {elements.map((element, index) => {
              const asset = assets.find((item) => item.id === element.assetId);
              if (!asset) return null;
              return (
                <div
                  className={`assignment-image-stage-item${selected.includes(index) ? " selected" : ""}`}
                  key={`${element.assetId}-${index}`}
                  style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.size}%` }}
                  onPointerDown={(event) => startMoving(event, index)}
                  aria-label={`Chọn và di chuyển ${asset.name}`}
                >
                  <img src={asset.src} alt={asset.name} draggable={false} />
                </div>
              );
            })}
            {selectionBox && (
              <div className="assignment-image-selection-box" style={{
                left: `${selectionBox.left}%`,
                top: `${selectionBox.top}%`,
                width: `${selectionBox.width}%`,
                height: `${selectionBox.height}%`,
              }} />
            )}
            {!elements.length && <span>Chọn ảnh trong thư viện để thêm vào khung vẽ.</span>}
          </div>
        </div>
      </div>

      {assets.length > 0 && (
        <div className="assignment-image-assets">
          {assets.map((asset) => (
            <div key={asset.id}>
              <img src={asset.src} alt="" />
              <span>{asset.name}</span>
              <button type="button" disabled={workingAssetId === asset.id} onClick={() => void removeBackground(asset)} aria-label={`Tách nền ${asset.name}`}>
                {workingAssetId === asset.id ? "Đang tách..." : "Tách nền"}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="assignment-image-error" role="alert">{error}</p>}
    </section>
  );
}
