import { createClient } from "@/lib/supabase/client";

/** 개발자 처리 상태 — 버그/피드백/IPO 화면에서 유저에게 노출한다. */
export type DevState = "available" | "paused" | "blocked";

export interface DevStatus {
  state: DevState;
  /** blocked 일 때 작업 재개 예정 시각(ms). 없으면 null. */
  resumeAt: number | null;
  note: string | null;
  updatedAt: number;
}

export const DEV_STATE_LABEL: Record<DevState, string> = {
  available: "수정 가능",
  paused: "보류",
  blocked: "토큰 부족으로 불가",
};

export const DEV_STATE_EMOJI: Record<DevState, string> = {
  available: "🟢",
  paused: "🟡",
  blocked: "🔴",
};

function parseRow(row: Record<string, unknown> | null | undefined): DevStatus | null {
  if (!row) return null;
  const raw = String(row.state ?? "available");
  const state: DevState =
    raw === "paused" || raw === "blocked" ? raw : "available";
  const resume = row.resume_at ? Date.parse(String(row.resume_at)) : NaN;
  const updated = row.updated_at ? Date.parse(String(row.updated_at)) : Date.now();
  return {
    state,
    resumeAt: Number.isFinite(resume) ? resume : null,
    note: row.note ? String(row.note) : null,
    updatedAt: Number.isFinite(updated) ? updated : Date.now(),
  };
}

export async function fetchDevStatus(): Promise<DevStatus | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dev_status")
    .select("state, resume_at, note, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return null;
  return parseRow(data as Record<string, unknown>);
}

/** admin 전용. RLS 로 관리자만 성공한다. */
export async function setDevStatus(
  state: DevState,
  resumeAt: number | null,
  note: string,
): Promise<DevStatus | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_dev_status", {
    p_state: state,
    p_resume_at:
      state === "blocked" && resumeAt ? new Date(resumeAt).toISOString() : null,
    p_note: note,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return parseRow(row as Record<string, unknown>);
}
