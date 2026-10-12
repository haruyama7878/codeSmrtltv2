export function formatStudentCode(id: number) {
  return `HS-${String(id).padStart(8, "0")}`;
}

export function parseStudentCode(value: string) {
  const match = value.trim().toUpperCase().match(/^HS-(\d{8})$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
