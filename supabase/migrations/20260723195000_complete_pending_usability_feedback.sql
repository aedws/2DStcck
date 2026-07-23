-- Complete the three pending usability feedback items shipped on 2026-07-23.
-- The update is idempotent and deliberately leaves reward accounting to the
-- existing client-side feedback resolution flow.

update public.feedback
set status = 'done',
    admin_note = case id
      when '010d5717-6502-4eb1-b0ef-f62ade35d46b'::uuid then
        '차트의 봉 주기와 이동평균선·지수이동평균선·VWAP·볼린저밴드·거래량·장중 구분·RSI 표시 설정을 브라우저에 저장합니다. 페이지나 종목, 옵션을 오간 뒤에도 마지막 설정이 그대로 복원됩니다.'
      when '8e03cb23-1f42-4cef-9cbc-e17dfe7d418d'::uuid then
        '자산운용사 설립 후에도 운용사명·한줄 소개·상세 소개를 수정할 수 있습니다. 수정 내용은 본인 소유의 공유 상장 ETF 정보와 클라우드 저장 데이터에도 함께 반영됩니다.'
      when '25f4e8ac-74aa-4286-8637-bd2344edff8f'::uuid then
        '다른 기기에서는 서버 저장 계좌를 우선 불러오도록 동기화 기준을 바로잡았습니다. 명시적인 클라우드 저장 실패 직후에만 로컬 복구본을 사용하며, 기존 지급 거래 ID도 완료 증거로 확인해 피드백·버그·IPO 환급 보상을 중복 수령할 수 없게 했습니다. 운영 데이터의 중복 지급 내역은 확인되지 않았습니다.'
    end,
    updated_at = now()
where id in (
  '010d5717-6502-4eb1-b0ef-f62ade35d46b',
  '8e03cb23-1f42-4cef-9cbc-e17dfe7d418d',
  '25f4e8ac-74aa-4286-8637-bd2344edff8f'
);
