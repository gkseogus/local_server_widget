import { RUNNING_STATUSES } from "@/contents/widget";
import type { ServiceFace } from "@/types/service";

// 포트 충돌이어도 위젯이 띄운 프로세스가 살아 있으면(origin "widget") 그 프로세스는 끌 수 있다.
const isOwnConflict = (service: ServiceFace): boolean =>
  service.status === "conflict" && service.origin === "widget";

/** ON/OFF 스위치가 켜진 것으로 보이는가. */
export const isSwitchOn = (service: ServiceFace): boolean =>
  RUNNING_STATUSES.includes(service.status) || isOwnConflict(service);

/** 스위치를 잠가야 하는가 — 남의 프로세스가 포트를 잡고 있을 때만. */
export const isSwitchLocked = (service: ServiceFace): boolean =>
  service.status === "conflict" && !isOwnConflict(service);
