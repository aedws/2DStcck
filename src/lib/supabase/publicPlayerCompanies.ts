import { createClient } from "@/lib/supabase/client";
import type { PlayerCompanyStatus } from "@/lib/player/playerCompany";

interface PublicPlayerCompanyRow {
  founder_game_id: unknown;
  company_id: unknown;
  company_name: unknown;
  ticker: unknown;
  sector: unknown;
  subsector: unknown;
  description: unknown;
  company_status: unknown;
  founded_at: unknown;
}

export interface PublicPlayerCompany {
  founderGameId: string;
  companyId: string;
  name: string;
  ticker: string;
  sector: string;
  subsector?: string;
  description?: string;
  status: PlayerCompanyStatus | "foundation-accepted";
  foundedAt?: number;
}

const optionalText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function parsePublicPlayerCompany(
  row: PublicPlayerCompanyRow,
): PublicPlayerCompany | null {
  const founderGameId = optionalText(row.founder_game_id);
  const companyId = optionalText(row.company_id);
  const name = optionalText(row.company_name);
  const ticker = optionalText(row.ticker)?.toUpperCase();
  const sector = optionalText(row.sector);
  if (!founderGameId || !companyId || !name || !ticker || !sector) return null;
  const rawStatus = String(row.company_status);
  const status: PublicPlayerCompany["status"] =
    rawStatus === "foundation-accepted"
      ? "foundation-accepted"
      : ["active", "paused", "ipo-requested"].includes(rawStatus)
        ? (rawStatus as PlayerCompanyStatus)
        : "active";
  const foundedAt = Number(row.founded_at);
  return {
    founderGameId,
    companyId,
    name,
    ticker,
    sector,
    ...(optionalText(row.subsector) ? { subsector: optionalText(row.subsector) } : {}),
    ...(optionalText(row.description)
      ? { description: optionalText(row.description) }
      : {}),
    status,
    ...(Number.isFinite(foundedAt) && foundedAt > 0 ? { foundedAt } : {}),
  };
}

export async function listPublicPlayerCompanies(): Promise<
  PublicPlayerCompany[]
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_public_player_companies");
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => parsePublicPlayerCompany(row as PublicPlayerCompanyRow))
    .filter((company): company is PublicPlayerCompany => company !== null);
}
