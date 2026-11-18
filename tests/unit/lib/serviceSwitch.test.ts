import { describe, expect, it } from "vitest";
import { isSwitchLocked, isSwitchOn } from "@/lib/serviceSwitch";
import type { ServiceOriginType, ServiceStatusType } from "@/types/service";
import { makeService } from "@tests/helpers/fixtures";

describe("serviceSwitch", () => {
  it.each<[ServiceStatusType, ServiceOriginType | null, boolean, boolean]>([
    // status, origin, 켜짐, 잠김
    ["on", "widget", true, false],
    ["on", "external", true, false],
    ["starting", "widget", true, false],
    ["off", null, false, false],
    ["failed", "widget", false, false],
    // 위젯이 띄운 프로세스가 살아 있으면 충돌이어도 켜진 채 끌 수 있다
    ["conflict", "widget", true, false],
    // 남의 프로세스가 포트를 잡은 충돌은 잠근다
    ["conflict", null, false, true],
    ["conflict", "external", false, true],
  ])("%s + origin %s → 켜짐 %s, 잠김 %s", (status, origin, on, locked) => {
    const service = makeService({ status, origin });
    expect(isSwitchOn(service)).toBe(on);
    expect(isSwitchLocked(service)).toBe(locked);
  });
});
