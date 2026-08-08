import { PlayerCompanyGovernanceHub } from "@/components/company/PlayerCompanyGovernanceHub";
import { STOCK_DEFINITIONS } from "@/data/stocks";

export function generateStaticParams() {
  return STOCK_DEFINITIONS.filter(
    (stock) => (stock.instrumentType ?? "company") === "company",
  ).map((stock) => ({ stockId: stock.id }));
}

export const dynamicParams = false;

export default async function GovernanceDetailPage({
  params,
}: {
  params: Promise<{ stockId: string }>;
}) {
  const { stockId } = await params;
  return <PlayerCompanyGovernanceHub selectedStockId={stockId} />;
}
