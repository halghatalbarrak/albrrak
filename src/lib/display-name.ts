// اشتقاق اسم العرض «الأوّل + الأب + العائلة» من nameAsInId (§٣أ). للعرض فقط — لا للهويّة.
// يُسقِط أدوات النسب (بن/ابن/بنت)، ويدمج «آل» بما بعدها (عائلة). إن غاب اسم العائلة يُكتفى بالاسمين.

const PARTICLES = new Set(["بن", "ابن", "بنت"]);

export interface DisplayName { first: string; father: string | null; family: string | null; display: string }

export function splitDisplayName(nameAsInId: string): DisplayName {
  const raw = (nameAsInId ?? "").trim();
  if (!raw) return { first: "", father: null, family: null, display: "" };

  const base = raw.split(/\s+/).filter((t) => !PARTICLES.has(t));
  // دمج «آل» بما بعدها: «آل سعود» كلمةً واحدةً (عائلة).
  const tokens: string[] = [];
  for (let i = 0; i < base.length; i++) {
    if (base[i] === "آل" && i + 1 < base.length) { tokens.push(`آل ${base[i + 1]}`); i++; }
    else tokens.push(base[i]);
  }

  if (tokens.length === 0) return { first: raw, father: null, family: null, display: raw };
  const first = tokens[0];
  if (tokens.length === 1) return { first, father: null, family: null, display: first };
  if (tokens.length === 2) return { first, father: tokens[1], family: null, display: `${first} ${tokens[1]}` };
  const family = tokens[tokens.length - 1];
  const father = tokens[1];
  return { first, father, family, display: `${first} ${father} ${family}` };
}
