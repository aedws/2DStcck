"use client";

import { useSettingsStore } from "@/store/settingsStore";

/**
 * 에셋 없는 WebAudio 효과음. 짧은 오실레이터 블립으로 체결·오류 피드백을 준다.
 * 설정에서 끌 수 있고, 브라우저 자동재생 정책상 첫 사용자 상호작용 이후 동작한다.
 */
type SoundType = "buy" | "sell" | "error" | "cash";

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freqs: number[], type: OscillatorType = "sine", gain = 0.05) {
  const ac = audioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const t = now + i * 0.06;
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  });
}

export function playSound(type: SoundType) {
  if (!useSettingsStore.getState().soundEnabled) return;
  switch (type) {
    case "buy":
      blip([523.25, 783.99]); // C5 → G5 상승
      break;
    case "sell":
      blip([659.25, 440.0]); // E5 → A4 하강
      break;
    case "cash":
      blip([784, 1046.5, 1318.5], "triangle", 0.045); // 상승 아르페지오
      break;
    case "error":
      blip([196, 155.56], "square", 0.04); // 낮은 부저
      break;
  }
}

/** 주문 결과 톤에 맞는 사운드 */
export function playResultSound(
  result: { success: boolean },
  kind: "buy" | "sell" = "buy",
) {
  playSound(result.success ? kind : "error");
}
