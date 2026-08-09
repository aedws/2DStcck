import type { Metadata } from "next";
import { FeedbackForm } from "@/components/market/FeedbackForm";
import { MyRequestHistory } from "@/components/market/MyRequestHistory";

export const metadata: Metadata = {
  title: "완전한 금융 시장으로 재구축 중 | 2DStock",
  description: "2DStock 신규 금융 시장 구축 안내",
};

export default function ServiceUpdatePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090b0e] px-5 py-12 text-[#f2f4f6]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(49,130,246,0.18),_transparent_42%)]" />
      <section className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.045] p-7 shadow-2xl backdrop-blur sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-xs font-bold text-sky-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />
          FINANCIAL MARKET REBUILD
        </div>

        <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
          완전한 금융 시장으로
          <br />
          처음부터 다시 만들고 있습니다
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          기존 시스템을 새로 갈무리하고 거래·체결·정산·기업·ETF가 하나의
          시장 안에서 유기적으로 작동하는 완전한 금융 시장으로
          재구축하겠습니다.
        </p>

        <div className="mt-7 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-6">
          <div className="flex gap-3">
            <span aria-hidden>🛠️</span>
            <p>
              <strong className="text-white">신규 시스템 구축</strong>
              <span className="block text-slate-400">
                계좌, 주문, 체결, 정산, 회사와 ETF 구조를 처음부터 다시
                설계해 안정성과 금융시장으로서의 완성도를 높이겠습니다.
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <span aria-hidden>🌐</span>
            <p>
              <strong className="text-white">모든 유저가 공유하는 동적 시장</strong>
              <span className="block text-slate-400">
                각자 계산된 시장이 아니라 모든 유저가 같은 시세, 거래 흐름과
                시장 변화를 실시간으로 공유하도록 전환하겠습니다.
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <span aria-hidden>📈</span>
            <p>
              <strong className="text-white">거래 압력이 남는 시장</strong>
              <span className="block text-slate-400">
                정해진 결과를 재생하는 결정론 시장에서 벗어나 유저의 매수·매도와
                유동성 변화가 가격, 변동성, 호가에 누적되어 지속되게 하겠습니다.
              </span>
            </p>
          </div>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          매칭 엔진과 결제·정산, 시장 위험 관리 검증을 마친 뒤 재오픈 일정을
          별도로 안내하겠습니다.
        </p>

        <div className="mt-8 border-t border-white/10 pt-8">
          <div className="mb-4">
            <p className="text-xs font-bold tracking-widest text-sky-300">
              EARLY PLAYER COUNCIL
            </p>
            <h2 className="mt-2 text-xl font-black">최초 플레이어 개선안 접수</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              V1을 직접 플레이한 경험을 V2 설계의 첫 기준으로 삼겠습니다. 꼭
              남겨야 할 재미, 제거할 불편, 필요한 시장 기능을 자유롭게 제안해
              주세요. 거래 원장은 닫혀 있어도 개선안 접수와 처리 상태 확인은
              계속 이용할 수 있습니다.
            </p>
          </div>
          <div className="space-y-4">
            <FeedbackForm
              heading="💡 V2 개선안·기능 요청"
              intro="시장 구조, 거래·체결, 회사·ETF, 캐릭터 콘텐츠와 이용 경험에 대한 제안을 받습니다."
              categories={["시장 구조", "거래·체결", "회사·ETF", "캐릭터 콘텐츠", "UI·접근성", "기타"]}
              categoryPrefix="V2 최초 플레이어"
              showReward={false}
              openLabel="V2 개선안 남기기"
            />
            <MyRequestHistory />
          </div>
        </div>
      </section>
    </main>
  );
}
