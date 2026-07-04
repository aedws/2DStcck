import { STOCK_DEFINITIONS } from "@/data/stocks";
import { StockPageClient } from "./StockPageClient";

// 정적 export: 모든 종목 페이지를 빌드 시 생성
export function generateStaticParams() {
  return STOCK_DEFINITIONS.map((s) => ({ id: s.id }));
}

export const dynamicParams = false;

export default async function StockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StockPageClient id={id} />;
}
