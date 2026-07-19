"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StoreHydration } from "@/components/layout/StoreHydration";
import { TossHeader } from "@/components/layout/TossHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { LearningJourneyController } from "@/components/layout/LearningJourneyController";
import { FirstTradeCelebration } from "@/components/layout/FirstTradeCelebration";
import { ServiceNoticeModal } from "@/components/layout/ServiceNoticeModal";
import { BugResponseWatcher } from "@/components/layout/BugResponseWatcher";
import { Toaster } from "@/components/layout/Toaster";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullWidth = pathname === "/" || pathname.startsWith("/stock/");

  return (
    <StoreHydration>
      <div className="min-h-screen bg-[var(--background)] pb-14 text-[var(--foreground)] md:pb-0">
        <TossHeader />
        <main className={fullWidth ? "" : "mx-auto max-w-6xl px-4 py-6"}>
          {children}
        </main>
        <MobileBottomNav />
      </div>
      <OnboardingModal />
      <ServiceNoticeModal />
      <BugResponseWatcher />
      <FirstTradeCelebration />
      <LearningJourneyController />
      <Toaster />
    </StoreHydration>
  );
}
