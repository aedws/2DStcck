"use client";

import { useMemo, useState } from "react";
import {
  scheduledWarFactionName,
  type ScheduledWarRegionState,
} from "@/lib/market/scheduledWar";

interface TerritoryGeometry {
  id: string;
  x: number;
  y: number;
  path: string;
}

const TERRITORY_GEOMETRY: readonly TerritoryGeometry[] = [
  { id: "central-exchange", x: 110, y: 80, path: "M20 20 L208.9 20 L178 166 L173.6 168.7 L20 139.6 Z" },
  { id: "industrial-belt", x: 275, y: 115, path: "M208.9 20 L348.3 20 L369.6 115.9 L290.4 203.5 L178 166 Z" },
  { id: "rail-hub", x: 455, y: 75, path: "M348.3 20 L567.9 20 L541.1 150.6 L479.1 176.7 L369.6 115.9 Z" },
  { id: "academy-district", x: 650, y: 115, path: "M567.9 20 L715.3 20 L741.3 135.9 L606 200.4 L541.1 150.6 Z" },
  { id: "southern-port", x: 815, y: 78, path: "M715.3 20 L880 20 L880 168.3 L792.5 177.4 L741.3 135.9 Z" },
  { id: "outer-airfield", x: 82, y: 228, path: "M20 306.5 L20 139.6 L173.6 168.7 L140.5 296.8 L125.2 311 Z" },
  { id: "energy-grid", x: 225, y: 265, path: "M140.5 296.8 L173.6 168.7 L178 166 L290.4 203.5 L327 306.4 L297.6 329.9 Z" },
  { id: "waterworks", x: 380, y: 210, path: "M327 306.4 L290.4 203.5 L369.6 115.9 L479.1 176.7 L438.5 291.2 L401.2 319.1 Z" },
  { id: "communications", x: 535, y: 265, path: "M438.5 291.2 L479.1 176.7 L541.1 150.6 L606 200.4 L635.1 306.9 L588.4 341.1 Z" },
  { id: "broadcast-center", x: 700, y: 220, path: "M635.1 306.9 L606 200.4 L741.3 135.9 L792.5 177.4 L754.1 281.1 L681.5 320 Z" },
  { id: "relief-hospital", x: 835, y: 270, path: "M880 168.3 L880 343.9 L852.3 346.5 L754.1 281.1 L792.5 177.4 Z" },
  { id: "commerce-quarter", x: 75, y: 390, path: "M159.6 460 L20 460 L20 306.5 L125.2 311 Z" },
  { id: "western-supply", x: 205, y: 360, path: "M246.5 460 L159.6 460 L125.2 311 L140.5 296.8 L297.6 329.9 Z" },
  { id: "warehouse-zone", x: 345, y: 415, path: "M442.1 460 L246.5 460 L297.6 329.9 L327 306.4 L401.2 319.1 Z" },
  { id: "grand-bridge", x: 500, y: 370, path: "M551.6 460 L442.1 460 L401.2 319.1 L438.5 291.2 L588.4 341.1 Z" },
  { id: "mountain-fort", x: 645, y: 415, path: "M740.7 460 L551.6 460 L588.4 341.1 L635.1 306.9 L681.5 320 Z" },
  { id: "underground-route", x: 775, y: 360, path: "M754 460 L740.7 460 L681.5 320 L754.1 281.1 L852.3 346.5 Z" },
  { id: "outer-gate", x: 850, y: 425, path: "M880 343.9 L880 460 L754 460 L852.3 346.5 Z" },
];

function controllerLabel(region: ScheduledWarRegionState): string {
  return region.controller === "contested"
    ? "교전 중"
    : `${scheduledWarFactionName(region.controller)} 점령`;
}

function regionFill(region: ScheduledWarRegionState): string {
  if (region.controller === "gehenna") return "url(#war-gehenna-fill)";
  if (region.controller === "trinity") return "url(#war-trinity-fill)";
  return "url(#war-contested-fill)";
}

export function ScheduledWarTerritoryMap({
  regions,
}: {
  regions: ScheduledWarRegionState[];
}) {
  const [selectedId, setSelectedId] = useState(regions[0]?.id ?? "");
  const regionsById = useMemo(
    () => new Map(regions.map((region) => [region.id, region])),
    [regions],
  );
  const selected =
    regionsById.get(selectedId) ?? regions[0] ?? null;

  return (
    <div className="mt-3">
      <svg
        viewBox="0 0 900 480"
        role="img"
        aria-label="게-트 대전쟁 18개 지역 점령 지도"
        className="h-auto w-full overflow-visible"
      >
        <defs>
          <linearGradient id="war-gehenna-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(190 18 60)" stopOpacity="0.78" />
            <stop offset="100%" stopColor="rgb(244 63 94)" stopOpacity="0.48" />
          </linearGradient>
          <linearGradient id="war-trinity-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(14 116 144)" stopOpacity="0.72" />
            <stop offset="100%" stopColor="rgb(56 189 248)" stopOpacity="0.46" />
          </linearGradient>
          <pattern
            id="war-contested-fill"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <rect width="18" height="18" fill="rgb(120 53 15)" fillOpacity="0.64" />
            <rect width="7" height="18" fill="rgb(251 191 36)" fillOpacity="0.58" />
          </pattern>
          <filter id="war-map-shadow" x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="rgb(0 0 0)" floodOpacity="0.3" />
          </filter>
        </defs>

        <g filter="url(#war-map-shadow)">
          {TERRITORY_GEOMETRY.map((geometry) => {
            const region = regionsById.get(geometry.id);
            if (!region) return null;
            const isSelected = selected?.id === region.id;
            return (
              <g
                key={region.id}
                role="button"
                tabIndex={0}
                aria-label={`${region.name}, ${controllerLabel(region)}, 전략 가치 ${region.strategicWeight}`}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedId(region.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(region.id);
                  }
                }}
              >
                <path
                  d={geometry.path}
                  fill={regionFill(region)}
                  stroke={isSelected ? "rgb(255 255 255)" : "rgb(255 255 255 / 0.42)"}
                  strokeWidth={isSelected ? 5 : 2.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={geometry.x}
                  y={geometry.y - 5}
                  textAnchor="middle"
                  fill="rgb(255 255 255)"
                  fontSize="25"
                  aria-hidden="true"
                >
                  {region.icon}
                </text>
                <text
                  x={geometry.x}
                  y={geometry.y + 24}
                  textAnchor="middle"
                  fill="rgb(255 255 255)"
                  fontSize="16"
                  fontWeight="700"
                  paintOrder="stroke"
                  stroke="rgb(15 23 42 / 0.78)"
                  strokeWidth="5"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {region.name}
                </text>
                {region.controller === "contested" && (
                  <text
                    x={geometry.x}
                    y={geometry.y + 46}
                    textAnchor="middle"
                    fill="rgb(254 243 199)"
                    fontSize="13"
                    fontWeight="700"
                    paintOrder="stroke"
                    stroke="rgb(69 26 3 / 0.9)"
                    strokeWidth="4"
                    aria-hidden="true"
                  >
                    교전 중
                  </text>
                )}
              </g>
            );
          })}
          <rect
            x="20"
            y="20"
            width="860"
            height="440"
            rx="10"
            fill="none"
            stroke="rgb(255 255 255 / 0.72)"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </g>

        <g transform="translate(840 42)" aria-hidden="true">
          <path d="M0 26 L12 0 L24 26 L12 21 Z" fill="rgb(255 255 255 / 0.86)" />
          <text x="12" y="39" textAnchor="middle" fill="rgb(255 255 255 / 0.72)" fontSize="13">
            N
          </text>
        </g>
      </svg>

      {selected && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[11px]">
          <span className="font-bold text-white">
            {selected.icon} {selected.name}
          </span>
          <span className="text-slate-200">
            {controllerLabel(selected)} · 전략 가치 {selected.strategicWeight}
          </span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-300">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          게헨나 점령
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          교전 중
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
          트리니티 점령
        </span>
      </div>
    </div>
  );
}
