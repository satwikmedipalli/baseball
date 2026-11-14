"use client";

import { useEffect, useState } from "react";

export type Redesign = {
  id: number;
  name: string;
  pitcher: number;
  pitch: string;
  pair: string;
  era: string;
  change: string;
  rebound: boolean;
  velo: [number, number];
  ivb: [number, number];
  hb: [number, number];
  spin: [number, number];
  whiff: [number, number];
  n: number;
  own: number;
  matched: number;
  gap: number;
};

export type RedesignData = { redesigns: Redesign[]; cloud: Record<string, [number, number][]> };

let cache: Promise<RedesignData> | null = null;

export function loadRedesigns(): Promise<RedesignData> {
  cache ??= fetch("/redesigns.json").then((r) => {
    if (!r.ok) throw new Error(`redesigns.json: ${r.status}`);
    return r.json();
  });
  return cache;
}

export function useRedesigns(): RedesignData | null {
  const [data, setData] = useState<RedesignData | null>(null);
  useEffect(() => {
    let live = true;
    loadRedesigns()
      .then((d) => live && setData(d))
      .catch(() => live && setData({ redesigns: [], cloud: {} }));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

export const PITCH_NAME: Record<string, string> = {
  four_seam: "Four-seam fastball",
  sinker: "Sinker",
  cutter: "Cutter",
  slider_sweeper: "Slider / sweeper",
  curveball: "Curveball",
  changeup: "Changeup",
  splitter: "Splitter",
};

export const seasons = (pair: string) => pair.replace("-", " → ");
