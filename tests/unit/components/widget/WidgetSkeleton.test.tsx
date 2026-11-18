import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import WidgetSkeleton from "@/components/widget/WidgetSkeleton";
import { LOADING_LABEL } from "@/contents/app";

describe("WidgetSkeleton", () => {
  it("로딩 중임을 aria-busy 와 화면낭독기 라벨로 알린다", () => {
    render(<WidgetSkeleton />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent(LOADING_LABEL);
  });

  it("버튼 같은 조작 요소는 그리지 않는다", () => {
    render(<WidgetSkeleton />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
