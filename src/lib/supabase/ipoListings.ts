import { createClient } from "@/lib/supabase/client";
import {
  normalizeStoredIpoListing,
  type StoredIpoListing,
} from "@/lib/market/dynamicListings";

/**
 * 관리자 즉시 IPO(동적 상장) — Supabase `ipo_listings` 접근 계층.
 * 활성 항목은 전체 공개(anon·authenticated) SELECT. 등록/토글은 관리자 전용 RPC
 * (upsert_ipo_listing / set_ipo_listing_active, SECURITY DEFINER + is_stock_request_admin).
 */

export interface IpoListingRow {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  active: boolean;
  listing_epoch_ms: number;
  payload: StoredIpoListing;
  game_id: string | null;
  created_at: string;
  updated_at: string;
}

function parseRow(row: Record<string, unknown> | null | undefined): IpoListingRow | null {
  if (!row) return null;
  const payloadRaw =
    typeof row.payload === "string"
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : (row.payload as Record<string, unknown> | null);
  const normalized = payloadRaw
    ? normalizeStoredIpoListing(payloadRaw as Partial<StoredIpoListing>)
    : null;
  if (!normalized) return null;
  return {
    id: String(row.id),
    ticker: normalized.ticker,
    name: normalized.name,
    sector: normalized.sector,
    active: Boolean(row.active),
    listing_epoch_ms: normalized.listingEpochMs,
    payload: normalized,
    game_id: row.game_id ? String(row.game_id) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** 활성 IPO 상장(공개). 모든 클라이언트가 같은 목록을 읽어 정의를 병합한다. */
export async function listActiveIpoListings(): Promise<StoredIpoListing[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ipo_listings")
    .select("id, payload")
    .eq("active", true);
  if (error || !data) return [];
  const out: StoredIpoListing[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const parsed = parseRow({ ...row, active: true, created_at: "", updated_at: "" });
    if (parsed) out.push(parsed.payload);
  }
  return out;
}

/** 관리자용: 활성/비활성 무관 전체 목록(관리 화면). SELECT 정책상 활성만 보이므로
 * 비활성 포함이 필요하면 별도 정책이 필요하지만, 여기서는 활성 목록만 관리한다. */
export async function listAdminIpoListings(): Promise<IpoListingRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ipo_listings")
    .select("*")
    .order("listing_epoch_ms", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map((row) => parseRow(row))
    .filter((row): row is IpoListingRow => row !== null);
}

/** 관리자 전용: IPO 상장 등록/수정. 실패 시 오류 메시지를 반환한다. */
export async function upsertIpoListing(
  listing: StoredIpoListing,
  gameId?: string,
): Promise<{ ok: true; row: IpoListingRow } | { ok: false; error: string }> {
  const normalized = normalizeStoredIpoListing(listing);
  if (!normalized) return { ok: false, error: "invalid_input" };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_ipo_listing", {
    p_payload: { ...normalized, gameId: gameId ?? undefined },
  });
  if (error) return { ok: false, error: error.message };
  const row = parseRow((Array.isArray(data) ? data[0] : data) as Record<string, unknown>);
  if (!row) return { ok: false, error: "parse_failed" };
  return { ok: true, row };
}

/** 관리자 전용: 상장 활성/비활성 토글. */
export async function setIpoListingActive(
  id: string,
  active: boolean,
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_ipo_listing_active", {
    p_id: id,
    p_active: active,
  });
  return !error;
}
