const WEB_APP_URL =
  process.env.NEXT_PUBLIC_GOOGLE_FEEDBACK_WEB_APP_URL?.trim() ?? "";

const CLIENT_ID_KEY = "vstock:v1-feedback-client-id";
const PLAYER_ID_KEY = "vstock:v1-feedback-player-id";
const RECEIPTS_KEY = "vstock:v1-feedback-receipts";
const RECEIPT_EVENT = "vstock:feedback-receipts-changed";
const RESPONSE_SOURCE = "vstock-google-feedback";
const REQUEST_TIMEOUT_MS = 20_000;

export interface FeedbackInput {
  category?: string;
  title: string;
  description?: string;
  playerId?: string;
}

export interface SubmitFeedbackResult {
  success: boolean;
  message: string;
  cooldown?: boolean;
  requestId?: string;
}

export interface LocalFeedbackReceipt {
  requestId: string;
  title: string;
  category: string | null;
  playerId: string | null;
  submittedAt: string;
}

interface AppsScriptResponse {
  source: typeof RESPONSE_SOURCE;
  requestId: string;
  success: boolean;
  code?: string;
  message?: string;
}

export function isValidGoogleFeedbackWebAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "script.google.com" &&
      /^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateClientId(): string {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY)?.trim();
  if (existing) return existing;
  const created = randomId();
  window.localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

export function getSavedFeedbackPlayerId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PLAYER_ID_KEY)?.trim() ?? "";
}

export function saveFeedbackPlayerId(playerId: string): void {
  if (typeof window === "undefined") return;
  const normalized = playerId.trim().slice(0, 40);
  if (normalized) window.localStorage.setItem(PLAYER_ID_KEY, normalized);
  else window.localStorage.removeItem(PLAYER_ID_KEY);
}

export function listLocalFeedbackReceipts(): LocalFeedbackReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECEIPTS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is LocalFeedbackReceipt =>
          Boolean(
            item &&
              typeof item.requestId === "string" &&
              typeof item.title === "string" &&
              typeof item.submittedAt === "string",
          ),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}

function saveReceipt(receipt: LocalFeedbackReceipt): void {
  const next = [
    receipt,
    ...listLocalFeedbackReceipts().filter(
      (item) => item.requestId !== receipt.requestId,
    ),
  ].slice(0, 30);
  window.localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(RECEIPT_EVENT));
}

export function subscribeToLocalFeedbackReceipts(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(RECEIPT_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(RECEIPT_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function hiddenInput(form: HTMLFormElement, name: string, value: string): void {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

function postToAppsScript(
  endpoint: string,
  fields: Record<string, string>,
  requestId: string,
): Promise<AppsScriptResponse> {
  return new Promise((resolve, reject) => {
    const frameName = `vstock-feedback-${requestId.replace(/[^a-z0-9-]/gi, "")}`;
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.title = "피드백 저장 응답";
    iframe.hidden = true;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = endpoint;
    form.target = frameName;
    form.acceptCharset = "UTF-8";
    form.hidden = true;
    for (const [name, value] of Object.entries(fields)) {
      hiddenInput(form, name, value);
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      form.remove();
      iframe.remove();
    };
    const finish = (response: AppsScriptResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data as Partial<AppsScriptResponse> | null;
      if (
        !data ||
        data.source !== RESPONSE_SOURCE ||
        data.requestId !== requestId ||
        typeof data.success !== "boolean"
      ) {
        return;
      }
      finish(data as AppsScriptResponse);
    };
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("feedback_response_timeout"));
    }, REQUEST_TIMEOUT_MS);

    window.addEventListener("message", onMessage);
    document.body.append(iframe, form);
    try {
      form.submit();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

/**
 * V1 개선안을 Google Apps Script 웹앱으로 전송한다.
 * Apps Script가 시트 저장을 끝낸 뒤 iframe postMessage로 확인 응답을 보낸다.
 */
export async function submitFeedback(
  input: FeedbackInput,
): Promise<SubmitFeedbackResult> {
  if (typeof window === "undefined") {
    return { success: false, message: "브라우저에서 다시 제출해 주세요." };
  }
  if (!isValidGoogleFeedbackWebAppUrl(WEB_APP_URL)) {
    return {
      success: false,
      message: "Google 피드백 접수처 설정이 아직 완료되지 않았습니다.",
    };
  }

  const title = input.title.trim();
  const description = input.description?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  const playerId = (input.playerId ?? getSavedFeedbackPlayerId()).trim();
  if (title.length < 1 || title.length > 80) {
    return { success: false, message: "제목은 1~80자로 입력해 주세요." };
  }
  if (description.length > 2_000) {
    return { success: false, message: "내용은 2,000자 이내로 입력해 주세요." };
  }
  if (category.length > 40 || playerId.length > 40) {
    return { success: false, message: "분류 또는 V1 아이디가 너무 깁니다." };
  }

  saveFeedbackPlayerId(playerId);
  const requestId = randomId();
  try {
    const response = await postToAppsScript(
      WEB_APP_URL,
      {
        request_id: requestId,
        client_id: getOrCreateClientId(),
        source: "v1",
        player_id: playerId,
        category,
        title,
        description,
        page_url: window.location.href.slice(0, 500),
        locale: navigator.language.slice(0, 20),
        app_version: "v1-rebuild-feedback",
        website: "",
      },
      requestId,
    );
    if (!response.success) {
      return {
        success: false,
        message:
          response.message ?? "제출에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        cooldown: response.code === "cooldown",
        requestId,
      };
    }

    saveReceipt({
      requestId,
      title,
      category: category || null,
      playerId: playerId || null,
      submittedAt: new Date().toISOString(),
    });
    return {
      success: true,
      message: "Google 스프레드시트에 피드백이 접수되었습니다.",
      requestId,
    };
  } catch {
    return {
      success: false,
      message:
        "저장 확인 응답을 받지 못했습니다. 잠시 후 다시 제출해 주세요.",
      requestId,
    };
  }
}
