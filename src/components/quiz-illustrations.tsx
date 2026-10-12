"use client";

import type { QuizQuestion } from "@/lib/learning-data";

/**
 * Hình minh họa vẽ bằng SVG (không dùng emoji/icon) cho các câu hỏi.
 * Tất cả hình được lưu tập trung trong file này.
 */

export type ItemKey =
  | "apple" | "star" | "flower" | "ball" | "balloon" | "cat" | "dog" | "bird" | "chicken"
  | "fish" | "tree" | "strawberry" | "carrot" | "banana" | "candy" | "duck" | "frog"
  | "rabbit" | "butterfly" | "bee" | "cake";

const EMOJI_TO_ITEM: Record<string, ItemKey> = {
  "🍎": "apple", "🍏": "apple",
  "⭐": "star", "🌟": "star", "✨": "star",
  "🌸": "flower", "🌼": "flower", "🌻": "flower", "🌹": "flower", "💐": "flower",
  "⚽": "ball", "🏀": "ball", "⚾": "ball", "🎾": "ball",
  "🎈": "balloon",
  "🐱": "cat", "🐈": "cat",
  "🐶": "dog", "🐕": "dog",
  "🐦": "bird", "🐤": "chicken", "🐔": "chicken", "🐣": "chicken",
  "🐟": "fish", "🐠": "fish",
  "🌳": "tree", "🌲": "tree", "🌴": "tree",
  "🍓": "strawberry", "🥕": "carrot", "🍌": "banana", "🍬": "candy", "🍭": "candy",
  "🦆": "duck", "🐸": "frog", "🐰": "rabbit", "🐇": "rabbit",
  "🦋": "butterfly", "🐝": "bee", "🎂": "cake", "🧁": "cake", "🍪": "cake",
};

function isImageFilenameLike(value?: string) {
  return Boolean(value && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(value.trim()));
}

/* ------------------------------------------------------------------ */
/*  Các hình vẽ SVG nhỏ (64 × 64)                                      */
/* ------------------------------------------------------------------ */

function Apple({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 20c-8 0-14 8-14 17 0 12 6 18 14 18s14-6 14-18c0-9-6-17-14-17z" fill="#ef4444" />
      <path d="M32 20c2-8 8-12 14-12-2 6-8 10-14 12z" fill="#22c55e" />
      <path d="M34 8c-1 4-4 6-8 6 1-4 4-6 8-6z" fill="#22c55e" />
      <circle cx="27" cy="36" r="4" fill="#fecaca" />
    </svg>
  );
}

function Star({ size = 46 }: { size?: number }) {
  const pts = "32,6 39,25 60,25 43,37 49,58 32,45 15,58 21,37 4,25 25,25";
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden><polygon points={pts} fill="#fbbf24" stroke="#f59e0b" strokeWidth="2" /></svg>;
}

function Flower({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="9" fill="#facc15" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="32" cy="14" rx="8" ry="12" fill="#ec4899" transform={`rotate(${deg} 32 32)`} />
      ))}
    </svg>
  );
}

function Ball({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="26" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      <path d="M32 8l8 10-8 9-8-9z" fill="#0f172a" />
      <path d="M32 8c-4 12-4 36 0 48" fill="none" stroke="#0f172a" strokeWidth="1.6" />
      <path d="M24 18c9 1 7 7 8 9M40 18c-9 1-7 7-8 9M24 43c9-1 7-7 8-9M40 43c-9-1-7-7-8-9" fill="none" stroke="#0f172a" strokeWidth="1.4" />
    </svg>
  );
}

function Balloon({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="24" rx="16" ry="20" fill="#f472b6" />
      <path d="M32 44l-3 12h6z" fill="#f472b6" />
      <path d="M29 58c1 1 2 2 3 2s2-1 3-2" fill="none" stroke="#9ca3af" strokeWidth="1.6" />
    </svg>
  );
}

function Cat({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <polygon points="10,28 14,10 26,20" fill="#f97316" />
      <polygon points="54,28 50,10 38,20" fill="#f97316" />
      <circle cx="32" cy="36" r="20" fill="#fb923c" />
      <circle cx="25" cy="33" r="3" fill="#0f172a" />
      <circle cx="39" cy="33" r="3" fill="#0f172a" />
      <path d="M30 40l2 2 2-2z" fill="#0f172a" />
      <path d="M14 38h8M42 38h8M16 44h6M42 44h6" stroke="#0f172a" strokeWidth="1.6" />
    </svg>
  );
}

function Dog({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="12" cy="34" rx="8" ry="14" fill="#92400e" />
      <ellipse cx="52" cy="34" rx="8" ry="14" fill="#92400e" />
      <circle cx="32" cy="36" r="20" fill="#b45309" />
      <circle cx="25" cy="32" r="3" fill="#0f172a" />
      <circle cx="39" cy="32" r="3" fill="#0f172a" />
      <ellipse cx="32" cy="41" rx="5" ry="4" fill="#fef3c7" />
      <circle cx="32" cy="39" r="3" fill="#0f172a" />
    </svg>
  );
}

function Bird({ size = 44, color = "#f59e0b" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="30" cy="38" rx="16" ry="13" fill={color} />
      <circle cx="44" cy="26" r="11" fill={color} />
      <polygon points="52,24 62,27 52,30" fill="#facc15" />
      <circle cx="48" cy="24" r="2.4" fill="#0f172a" />
      <path d="M22 32c-6-6-14-6-16-4 4 1 8 3 16 4z" fill="#f8fafc" />
      <path d="M30 51l-3 6h6z" fill="#facc15" />
    </svg>
  );
}

function Chicken({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="38" r="18" fill="#fde047" />
      <path d="M26 18c0-5 5-8 9-8-2 5 0 9 3 11z" fill="#ef4444" />
      <polygon points="48,34 60,38 48,42" fill="#f97316" />
      <circle cx="42" cy="36" r="2.4" fill="#0f172a" />
      <path d="M32 52l-3 7h6z" fill="#f97316" />
    </svg>
  );
}

function Fish({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <polygon points="48,32 62,22 62,42" fill="#38bdf8" />
      <ellipse cx="28" cy="32" rx="20" ry="14" fill="#0ea5e9" />
      <circle cx="16" cy="30" r="2.4" fill="#0f172a" />
      <path d="M20 40c4 4 8 6 12 6" fill="none" stroke="#7dd3fc" strokeWidth="2" />
    </svg>
  );
}

function Tree({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="28" y="40" width="8" height="16" rx="2" fill="#92400e" />
      <circle cx="32" cy="24" r="16" fill="#22c55e" />
      <circle cx="22" cy="34" r="11" fill="#16a34a" />
      <circle cx="42" cy="34" r="11" fill="#16a34a" />
    </svg>
  );
}

function Strawberry({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 16c10 8 14 18 14 26 0 8-6 12-14 12S18 50 18 42c0-8 4-18 14-26z" fill="#ef4444" />
      <path d="M32 16c0-6 6-9 11-9-3 5-1 8-11 9z" fill="#22c55e" />
      {[[24, 30], [32, 36], [40, 30], [28, 44], [36, 46]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#fecaca" />
      ))}
    </svg>
  );
}

function Carrot({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M20 18c6-4 10-3 16 1l10 9c4 4 4 9 0 13l-2 2c-4 4-9 4-13 0l-9-10c-4-6-5-10-1-16z" fill="#f97316" />
      <path d="M22 14c2-4 5-6 8-7M30 20c0-3 1-5 3-7" fill="none" stroke="#22c55e" strokeWidth="3" />
    </svg>
  );
}

function Banana({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M10 30c2-14 14-22 26-20 10 2 16 10 18 20-12 8-24 8-32 4-4-2-10 0-12-4z" fill="#facc15" />
      <path d="M10 30c4 2 8 2 12 0" fill="none" stroke="#a16207" strokeWidth="2" />
    </svg>
  );
}

function Candy({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="16" fill="#f472b6" />
      <path d="M32 16c-4 6 0 10-2 16M32 32c4-6 0-10 2-16M18 26c8 2 10 6 14 6M46 38c-8-2-10-6-14-6" fill="none" stroke="#fce7f3" strokeWidth="4" />
    </svg>
  );
}

function Duck({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="34" cy="40" r="16" fill="#facc15" />
      <circle cx="48" cy="28" r="9" fill="#fde047" />
      <polygon points="56,26 66,30 56,32" fill="#f97316" />
      <circle cx="51" cy="26" r="2" fill="#0f172a" />
      <path d="M26 44c-10-4-18-4-20-1 2 4 9 5 20 1z" fill="#f8fafc" />
    </svg>
  );
}

function Frog({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="20" cy="24" r="9" fill="#4ade80" />
      <circle cx="44" cy="24" r="9" fill="#4ade80" />
      <circle cx="32" cy="40" r="16" fill="#22c55e" />
      <circle cx="14" cy="20" r="4" fill="#f8fafc" /><circle cx="13" cy="20" r="2" fill="#0f172a" />
      <circle cx="50" cy="20" r="4" fill="#f8fafc" /><circle cx="51" cy="20" r="2" fill="#0f172a" />
      <path d="M27 46c3 3 7 3 10 0" fill="none" stroke="#14532d" strokeWidth="2" />
    </svg>
  );
}

function Rabbit({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="22" cy="16" rx="7" ry="14" fill="#f8fafc" />
      <ellipse cx="42" cy="16" rx="7" ry="14" fill="#f8fafc" />
      <ellipse cx="22" cy="16" rx="4" ry="10" fill="#fda4af" />
      <ellipse cx="42" cy="16" rx="4" ry="10" fill="#fda4af" />
      <circle cx="32" cy="40" r="18" fill="#e5e7eb" />
      <circle cx="26" cy="38" r="3" fill="#0f172a" />
      <circle cx="38" cy="38" r="3" fill="#0f172a" />
      <ellipse cx="32" cy="45" rx="3" ry="3.5" fill="#fda4af" />
      <path d="M30 47v2M34 47v2" stroke="#0f172a" strokeWidth="1.6" />
    </svg>
  );
}

function Butterfly({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="20" cy="26" rx="13" ry="10" fill="#a78bfa" transform="rotate(-20 20 26)" />
      <ellipse cx="44" cy="26" rx="13" ry="10" fill="#a78bfa" transform="rotate(20 44 26)" />
      <ellipse cx="20" cy="44" rx="10" ry="8" fill="#c4b5fd" transform="rotate(20 20 44)" />
      <ellipse cx="44" cy="44" rx="10" ry="8" fill="#c4b5fd" transform="rotate(-20 44 44)" />
      <rect x="30" y="18" width="4" height="28" rx="2" fill="#0f172a" />
      <path d="M32 14c-4-3-7-3-8-1M32 14c4-3 7-3 8-1" stroke="#0f172a" strokeWidth="1.6" />
    </svg>
  );
}

function Bee({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="30" cy="32" rx="16" ry="13" fill="#facc15" />
      <rect x="18" y="20" width="5" height="24" rx="2.5" fill="#0f172a" />
      <rect x="30" y="20" width="5" height="24" rx="2.5" fill="#0f172a" />
      <circle cx="46" cy="28" r="7" fill="#facc15" />
      <circle cx="48" cy="27" r="2" fill="#0f172a" />
      <path d="M12 22c-6-4-9-2-8 2M10 40c-6 4-9 2-8-2" fill="none" stroke="#93c5fd" strokeWidth="2" />
    </svg>
  );
}

function Cake({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="10" y="30" width="44" height="20" rx="4" fill="#f472b6" />
      <rect x="10" y="26" width="44" height="8" rx="4" fill="#fdf2f8" />
      <path d="M18 24c1-3 2-3 3-6M32 24c1-3 2-3 3-6M46 24c1-3 2-3 3-6" fill="none" stroke="#ef4444" strokeWidth="2.4" />
      <circle cx="22" cy="40" r="2" fill="#fdf2f8" /><circle cx="42" cy="40" r="2" fill="#fdf2f8" />
      <rect x="28" y="50" width="8" height="5" rx="2" fill="#f9a8d4" />
    </svg>
  );
}

function ItemIcon({ item, size = 46 }: { item: ItemKey; size?: number }) {
  switch (item) {
    case "apple": return <Apple size={size} />;
    case "star": return <Star size={size} />;
    case "flower": return <Flower size={size} />;
    case "ball": return <Ball size={size} />;
    case "balloon": return <Balloon size={size} />;
    case "cat": return <Cat size={size} />;
    case "dog": return <Dog size={size} />;
    case "bird": return <Bird size={size} />;
    case "chicken": return <Chicken size={size} />;
    case "fish": return <Fish size={size} />;
    case "tree": return <Tree size={size} />;
    case "strawberry": return <Strawberry size={size} />;
    case "carrot": return <Carrot size={size} />;
    case "banana": return <Banana size={size} />;
    case "candy": return <Candy size={size} />;
    case "duck": return <Duck size={size} />;
    case "frog": return <Frog size={size} />;
    case "rabbit": return <Rabbit size={size} />;
    case "butterfly": return <Butterfly size={size} />;
    case "bee": return <Bee size={size} />;
    case "cake": return <Cake size={size} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Cảnh vị trí: con chim so với cái cây                               */
/* ------------------------------------------------------------------ */

type Pos = "trên" | "dưới" | "trái" | "phải";

function posFromAnswer(answer: string): Pos {
  const a = answer.toLowerCase();
  if (a.includes("trái")) return "trái";
  if (a.includes("phải")) return "phải";
  if (a.includes("dưới")) return "dưới";
  return "trên";
}

function BirdTreeScene({ pos }: { pos: Pos }) {
  const birdPos = { trên: [140, 26], dưới: [140, 184], trái: [78, 112], phải: [202, 112] }[pos];
  return (
    <svg width={270} height={200} viewBox="0 0 280 210" aria-hidden>
      <ellipse cx="140" cy="196" rx="120" ry="12" fill="#86efac" />
      <rect x="122" y="90" width="26" height="96" rx="8" fill="#92400e" />
      <path d="M122 112c-22-6-30-18-24-30M148 104c22-6 30-18 24-30" stroke="#92400e" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="135" cy="66" r="42" fill="#16a34a" />
      <circle cx="105" cy="84" r="28" fill="#22c55e" />
      <circle cx="165" cy="84" r="28" fill="#22c55e" />
      <circle cx="135" cy="48" r="26" fill="#4ade80" />
      <g transform={`translate(${birdPos[0]} ${birdPos[1]})`}>
        <ellipse cx="-6" cy="10" rx="13" ry="10" fill="#f59e0b" />
        <circle cx="6" cy="0" r="9" fill="#f59e0b" />
        <polygon points="13,-2 21,0 13,2" fill="#facc15" />
        <circle cx="9" cy="-2" r="2" fill="#0f172a" />
        <path d="M-12 5c-5-5-11-5-13-3 3 1 6 3 13 3z" fill="#f8fafc" />
        <path d="M-6 20l-2 5h5z" fill="#facc15" />
      </g>
    </svg>
  );
}

function FishWaterScene({ pos }: { pos: Pos }) {
  const fishPos = { trên: [140, 42], dưới: [140, 168], trái: [82, 112], phải: [198, 112] }[pos];
  return (
    <svg width={270} height={200} viewBox="0 0 280 210" aria-hidden>
      <rect x="30" y="0" width="220" height="100" rx="14" fill="#dbeafe" />
      <path d="M30 100c30-10 60-10 90 0s60 10 90 0l0 14c-30 10-60 10-90 0s-60-10-90 0z" fill="#60a5fa" />
      <g transform={`translate(${fishPos[0]} ${fishPos[1]})`}>
        <polygon points="16,0 30,-8 30,8" fill="#38bdf8" />
        <ellipse cx="0" cy="0" rx="17" ry="11" fill="#0ea5e9" />
        <circle cx="-7" cy="-2" r="2" fill="#0f172a" />
        <path d="M-8 6c3 3 7 5 11 5" fill="none" stroke="#7dd3fc" strokeWidth="2" />
      </g>
    </svg>
  );
}

function CatBoxScene({ pos }: { pos: Pos }) {
  const catPos = { trên: [140, 52], dưới: [140, 186], trái: [70, 140], phải: [210, 140] }[pos];
  return (
    <svg width={270} height={200} viewBox="0 0 280 210" aria-hidden>
      <ellipse cx="140" cy="198" rx="120" ry="10" fill="#e5e7eb" />
      <rect x="96" y="112" width="88" height="86" rx="10" fill="#d97706" />
      <rect x="96" y="112" width="88" height="16" rx="8" fill="#b45309" />
      <path d="M96 128l44 22 44-22" fill="none" stroke="#b45309" strokeWidth="4" />
      <g transform={`translate(${catPos[0]} ${catPos[1]})`}>
        <polygon points="-12,-6 -10,-20 4,-12" fill="#f97316" />
        <polygon points="12,-6 10,-20 -4,-12" fill="#f97316" />
        <circle cx="0" cy="6" r="17" fill="#fb923c" />
        <circle cx="-6" cy="3" r="2.6" fill="#0f172a" />
        <circle cx="6" cy="3" r="2.6" fill="#0f172a" />
        <path d="M-1 9l2 2 2-2z" fill="#0f172a" />
        <path d="M-18 8h7M11 8h7M-16 13h5M11 13h5" stroke="#0f172a" strokeWidth="1.6" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Hàng hình học (câu hỏi nhận biết hình)                             */
/* ------------------------------------------------------------------ */

function ShapesScene() {
  return (
    <div className="tt-count-row">
      <svg width={54} height={54} viewBox="0 0 64 64" aria-hidden><circle cx="32" cy="32" r="24" fill="#ef4444" /></svg>
      <svg width={54} height={54} viewBox="0 0 64 64" aria-hidden><rect x="10" y="10" width="44" height="44" rx="4" fill="#3b82f6" /></svg>
      <svg width={54} height={54} viewBox="0 0 64 64" aria-hidden><polygon points="32,8 58,54 6,54" fill="#22c55e" /></svg>
      <svg width={54} height={54} viewBox="0 0 64 64" aria-hidden><rect x="8" y="20" width="48" height="26" rx="4" fill="#f59e0b" /></svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chọn cảnh minh họa theo nội dung câu hỏi                           */
/* ------------------------------------------------------------------ */

export function QuizIllustration({ question }: { question: QuizQuestion }) {
  const prompt = question.prompt.toLowerCase();

  if (question.visualElements?.length && question.imageAssets?.length) {
    const assets = new Map(question.imageAssets.map((asset) => [asset.id, asset]));
    return (
      <div className="tt-illustration tt-visual-scene" aria-label="Hình ảnh minh họa cho câu hỏi">
        {question.visualElements.map((element, index) => {
          const asset = assets.get(element.assetId);
          if (!asset) return null;
          return (
            <img
              key={`${element.assetId}-${index}`}
              src={asset.src}
              alt={asset.name}
              style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${element.size}%`,
              }}
            />
          );
        })}
      </div>
    );
  }

  // Câu hỏi vị trí (so với cây / mặt nước / hộp…) → vẽ cảnh theo đáp án đúng.
  if (/ở đâu|so với/.test(prompt)) {
    const pos = posFromAnswer(question.correctAnswer);
    if (/cá|nước/.test(prompt)) {
      return <div className="tt-illustration"><FishWaterScene pos={pos} /></div>;
    }
    if (/mèo|bàn|hộp|ghế/.test(prompt)) {
      return <div className="tt-illustration"><CatBoxScene pos={pos} /></div>;
    }
    if (/chim|cây/.test(prompt)) {
      return <div className="tt-illustration"><BirdTreeScene pos={pos} /></div>;
    }
    return <div className="tt-illustration"><BirdTreeScene pos={pos} /></div>;
  }

  // Câu hỏi nhận biết hình → hàng 4 hình học.
  if (/hình nào là hình|hình (tròn|vuông|tam giác|chữ nhật)/.test(prompt)) {
    return <div className="tt-illustration"><ShapesScene /></div>;
  }

  // Câu đếm đồ vật: đếm emoji trong illustration rồi vẽ lại bằng SVG.
  if (question.illustration && !isImageFilenameLike(question.illustration)) {
    const counts = new Map<string, number>();
    const matches = question.illustration.match(/[\p{Extended_Pictographic}]/gu);
    if (matches) {
      for (const ch of matches) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      const entries = [...counts.entries()];
      if (entries.length >= 2 && entries.every(([, c]) => c === 1)) {
        const items = entries.map(([emoji]) => EMOJI_TO_ITEM[emoji]).filter((i): i is ItemKey => Boolean(i));
        if (items.length) {
          return (
            <div className="tt-illustration">
              <div className="tt-count-row">{items.map((item, i) => <ItemIcon key={`${item}-${i}`} item={item} size={52} />)}</div>
            </div>
          );
        }
      }
      const [emoji, count] = entries[0] ?? [];
      const item = EMOJI_TO_ITEM[emoji];
      const total = Math.min(count, 12);
      if (item && total > 0) {
        return (
          <div className="tt-illustration">
            <div className="tt-count-row">
              {Array.from({ length: total }, (_, i) => <ItemIcon key={i} item={item} size={52} />)}
            </div>
          </div>
        );
      }
    }
  }

  return null;
}
