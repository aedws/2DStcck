import type { CashPayment } from "@/lib/types/market";

/** 구버전 배당 차감도 일반 회사 출자와 구분해 표시한다. */
export function isLegacyPlayerCompanyDividendDebit(
  payment: Pick<CashPayment, "id" | "kind">,
): boolean {
  return payment.kind === "company_capital" && payment.id.startsWith("pcdiv-burn-");
}

export function cashPaymentKindLabel(
  payment: Pick<CashPayment, "id" | "kind" | "sourceId" | "amount">,
): string {
  if (payment.kind === "company_special_dividend") return "특별배당 재원";
  if (payment.kind === "company_regular_dividend") return "정기배당 재원";
  if (isLegacyPlayerCompanyDividendDebit(payment)) return "회사 배당 재원";

  switch (payment.kind) {
    case "salary": return "고정급";
    case "covered_call": return "월 분배";
    case "interest": return "마진 이자";
    case "lottery": return "복권";
    case "minigame": return "현금 채굴";
    case "attendance": return "출석";
    case "compensation": return "운영 보상";
    case "company_capital": return "회사 출자 소각";
    case "liquidity_contribution": return "유동성 위기 공동 출자";
    case "amc_capital": return "운용사 소각";
    case "management_fee": return "ETF 운용료";
    case "exchange_tax": return "거래소 거래세";
    case "capital_gains_tax": return "거래세·양도소득세";
    case "financial_investment_tax": return "금융투자소득세";
    case "corporate_tax": return "법인세";
    case "content_request":
      if (payment.sourceId === "market-phase-policy-refund") {
        return "기존 국면 요청 비용 환급";
      }
      if (payment.sourceId === "market-phase-reward") {
        return "국면 추가 채택 보상";
      }
      return payment.amount >= 0 ? "국면 요청 반려 환불" : "국면 추가 요청 비용";
    case "dividend_tax": return "배당 원천징수세";
    case "pump_surveillance_tax": return "급등주 감시세";
    case "amc_dividend": return "유저 ETF 배당";
    case "amc_redemption": return "ETF 상장폐지 환급";
    case "preferred_dividend": return "우선주 배당";
    case "dividend": return "분기 배당";
  }
  return "현금 지급";
}
