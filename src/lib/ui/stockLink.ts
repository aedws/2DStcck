/**
 * 종목 상세 링크 경로.
 * 급등주(pump-*)는 시각의 순함수라 정적 /stock/[id] 페이지가 생성되지 않으므로
 * (dynamicParams=false → 404), 전용 /pump 화면으로 연결한다. 그 외에는 일반
 * 종목 상세로 보낸다.
 */
export function stockHref(stock: { id: string } | string): string {
  const id = typeof stock === "string" ? stock : stock.id;
  return id.startsWith("pump-") ? "/pump" : `/stock/${id}`;
}
