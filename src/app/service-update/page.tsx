import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "서비스 업데이트 중 | 2DStock",
  description: "2DStock 서비스 재구축 안내",
};

export default function ServiceUpdatePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090b0e] px-5 py-12 text-[#f2f4f6]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(49,130,246,0.18),_transparent_42%)]" />
      <section className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.045] p-7 shadow-2xl backdrop-blur sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-xs font-bold text-sky-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />
          SERVICE REBUILD
        </div>

        <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
          더 안정적인 서비스로
          <br />
          다시 만들고 있습니다
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          2026년 8월 10일 00:00부터 기존 서비스의 거래와 저장을 종료하고
          전면 재구축을 시작했습니다. 현재는 접속과 모든 자산 변동이
          차단되어 있습니다.
        </p>

        <div className="mt-7 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-6">
          <div className="flex gap-3">
            <span aria-hidden>🔒</span>
            <p>
              <strong className="text-white">원장 보존</strong>
              <span className="block text-slate-400">
                기존 계정·거래·자산 기록은 삭제하지 않고 감사 및 재구축
                기준 자료로 안전하게 보존합니다.
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <span aria-hidden>🛠️</span>
            <p>
              <strong className="text-white">신규 시스템 구축</strong>
              <span className="block text-slate-400">
                거래 저장, 자산 원장, 회사 및 ETF 구조를 처음부터 다시
                검증해 안정성을 확보하겠습니다.
              </span>
            </p>
          </div>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          재오픈 일정과 데이터 반영 기준은 검증 완료 후 별도로
          안내하겠습니다.
        </p>
      </section>
    </main>
  );
}

