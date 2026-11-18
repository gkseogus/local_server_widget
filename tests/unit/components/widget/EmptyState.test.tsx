import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "@/components/widget/EmptyState";
import { MESSAGES } from "@/contents/widget";

describe("EmptyState", () => {
  it("안내 문구를 보여주고 '서버 추가하기' 버튼이 onAddServer 를 호출한다", async () => {
    const onAddServer = vi.fn();
    render(<EmptyState onAddServer={onAddServer} />);

    expect(screen.getByText(MESSAGES.empty)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.emptyHint)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: MESSAGES.addServer }));
    expect(onAddServer).toHaveBeenCalledTimes(1);
  });
});
