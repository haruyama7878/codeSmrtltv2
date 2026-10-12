import { isAnswerModeCompatible, type QuizImageAsset, type QuizQuestion, type QuizVisualElement } from "@/lib/learning-data";

function validAssetSource(src: unknown): src is string {
  return typeof src === "string" && src.length <= 2_400_000
    && (/^\/api\/library-assets\/(?:canh_vat|do_vat)\/trang\d+_\d+\.png$/.test(src)
      || /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(src));
}

function validImageAsset(value: unknown): value is QuizImageAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<QuizImageAsset>;
  return typeof asset.id === "string" && asset.id.length > 0 && asset.id.length <= 80
    && typeof asset.name === "string" && asset.name.length <= 180
    && validAssetSource(asset.src);
}

function validImageAssets(value: unknown): value is QuizImageAsset[] {
  return value === undefined || (Array.isArray(value)
    && value.length <= 30
    && value.every(validImageAsset)
    && new Set(value.map((asset) => asset.id)).size === value.length);
}

function validVisualElements(value: unknown, assetIds: Set<string>): value is QuizVisualElement[] {
  return value === undefined || (Array.isArray(value) && value.length <= 40
    && value.every((element) => element && typeof element === "object"
      && typeof element.assetId === "string" && assetIds.has(element.assetId)
      && Number.isFinite(element.x) && element.x >= 0 && element.x <= 100
      && Number.isFinite(element.y) && element.y >= 0 && element.y <= 100
      && Number.isFinite(element.size) && element.size >= 1 && element.size <= 100));
}

export function validQuestions(value: unknown): value is QuizQuestion[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20
    && new Set(value.map((question) => question?.id)).size === value.length
    && value.every((question) => {
      if (!question || typeof question !== "object") return false;
      const answerMode = question.answerMode ?? "choice";
      const imageAssets: unknown = question.imageAssets;
      if (!validImageAssets(imageAssets)) return false;
      const imageAssetIds = new Set<string>((imageAssets ?? []).map((asset: QuizImageAsset) => asset.id));
      const validVisuals = validVisualElements(question.visualElements, imageAssetIds);
      const optionImageIds: unknown = question.optionImageIds;
      const validOptionImages = optionImageIds === undefined
        || (Array.isArray(optionImageIds)
          && optionImageIds.every((assetId: unknown) => assetId === null || (typeof assetId === "string" && imageAssetIds.has(assetId))));
      const validOptions = Array.isArray(question.options)
        && question.options.every((option: unknown) => typeof option === "string")
        && (answerMode === "choice"
          ? question.options.length >= 2 && question.options.includes(question.correctAnswer)
          : true);
      return Number.isInteger(question.id)
        && ["normal", "challenge"].includes(question.phase)
        && ["A", "B", "C", "D", "E"].includes(question.difficulty)
        && typeof question.prompt === "string"
        && question.prompt.length <= 4000
        && validOptions
        && typeof question.correctAnswer === "string"
        && question.correctAnswer.length <= 500
        && validVisuals
        && validOptionImages
        && typeof question.explanation === "string"
        && typeof question.skill === "string"
        && ["choice", "type", "line", "complete", "match", "select", "image-choice", "image-select"].includes(answerMode)
        && isAnswerModeCompatible(question, answerMode);
    });
}
