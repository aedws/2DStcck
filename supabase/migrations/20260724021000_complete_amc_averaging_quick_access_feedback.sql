-- 유저 ETF 상세 페이지에 일반 종목과 같은 평단 계산기 퀵 액세스를 제공한다.
-- 완료 회신을 받은 제안자는 기존 클라이언트 흐름에서 피드백 보상을 1회 지급받는다.

update public.feedback
set
  status = 'done',
  admin_note =
    '유저 ETF 상세 주문 패널에 물타기·불타기 계산기 퀵 액세스를 추가했습니다. 보유 좌수·평균 매수가·현재 NAV가 자동 입력되며 추가 매수 좌수·금액과 목표 평단을 바로 계산할 수 있고, ETF 수량 단위는 주가 아닌 좌로 표시됩니다.',
  updated_at = now()
where id = '0b00a8d0-10a4-4b71-8ce4-f745d329db2f'::uuid
  and status in ('open', 'considering', 'planned');
