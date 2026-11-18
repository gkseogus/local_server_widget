import type { SVGProps } from "react";

export const RUNNING_COUNT_SUFFIX = "실행 중";

export const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center h-6 w-6 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100";

// 헤더 아이콘 공통 SVG 속성 (14px, 선 아이콘)
export const ICON_SVG_PROPS: SVGProps<SVGSVGElement> = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};
