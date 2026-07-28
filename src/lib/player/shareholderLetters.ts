export const LONG_TERM_SHAREHOLDER_SESSIONS = 20;
export const SHAREHOLDER_LETTER_COOLDOWN_SESSIONS = 20;
export const SHAREHOLDER_LETTER_TITLE_MAX_LENGTH = 80;
export const SHAREHOLDER_LETTER_BODY_MAX_LENGTH = 500;

const LINK_PATTERN = /(https?:\/\/|www[.])/i;

function characterLength(value: string): number {
  return Array.from(value).length;
}

export function isLongTermShareholder({
  quantity,
  heldSinceSession,
  currentSession,
}: {
  quantity: number;
  heldSinceSession: number | null | undefined;
  currentSession: number;
}): boolean {
  return (
    Number.isFinite(quantity) &&
    quantity >= 1 &&
    typeof heldSinceSession === "number" &&
    Number.isSafeInteger(heldSinceSession) &&
    currentSession - heldSinceSession >= LONG_TERM_SHAREHOLDER_SESSIONS
  );
}

export function nextShareholderLetterSession(
  lastSentSession: number | null | undefined,
  currentSession: number,
): number {
  return Number.isSafeInteger(lastSentSession)
    ? Math.max(currentSession, lastSentSession! + SHAREHOLDER_LETTER_COOLDOWN_SESSIONS)
    : currentSession;
}

export type ShareholderLetterDraftValidation =
  | { valid: true; title: string; body: string }
  | { valid: false; message: string };

export function validateShareholderLetterDraft(
  title: string,
  body: string,
): ShareholderLetterDraftValidation {
  const normalizedTitle = title.trim();
  const normalizedBody = body.trim();
  if (!normalizedTitle) {
    return { valid: false, message: "서한 제목을 입력해 주세요." };
  }
  if (characterLength(normalizedTitle) > SHAREHOLDER_LETTER_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      message: `서한 제목은 ${SHAREHOLDER_LETTER_TITLE_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  if (!normalizedBody) {
    return { valid: false, message: "주주에게 전할 내용을 입력해 주세요." };
  }
  if (characterLength(normalizedBody) > SHAREHOLDER_LETTER_BODY_MAX_LENGTH) {
    return {
      valid: false,
      message: `서한 본문은 ${SHAREHOLDER_LETTER_BODY_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  if (LINK_PATTERN.test(normalizedTitle) || LINK_PATTERN.test(normalizedBody)) {
    return { valid: false, message: "주주서한에는 외부 링크를 넣을 수 없습니다." };
  }
  return { valid: true, title: normalizedTitle, body: normalizedBody };
}
