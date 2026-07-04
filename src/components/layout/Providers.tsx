"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StoreHydration } from "@/components/layout/StoreHydration";
import { TossHeader } from "@/components/layout/TossHeader";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullWidth = pathname === "/";

  return (
    <StoreHydration>
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <TossHeader />
        <main className={fullWidth ? "" : "mx-auto max-w-6xl px-4 py-6"}>
          {children}
        </main>
      </div>
    </StoreHydration>
  );
}
