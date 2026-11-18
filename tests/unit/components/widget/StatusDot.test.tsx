import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import StatusDot from "@/components/widget/StatusDot";
import { STATUS_DOT_CLASSES } from "@/contents/widget";
import type { ServiceStatusType } from "@/types/service";

describe("StatusDot", () => {
  it.each(Object.keys(STATUS_DOT_CLASSES) as ServiceStatusType[])(
    "%s 상태 색을 칠하고 보조기기에는 숨긴다",
    (status) => {
      const { container } = render(<StatusDot status={status} />);
      const dot = container.firstElementChild;
      expect(dot).toHaveClass(STATUS_DOT_CLASSES[status]);
      expect(dot).toHaveAttribute("aria-hidden", "true");
    },
  );
});
