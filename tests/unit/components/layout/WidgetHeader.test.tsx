import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockWindows } from "@tauri-apps/api/mocks";
import WidgetHeader from "@/components/layout/WidgetHeader";
import { MESSAGES } from "@/contents/widget";
import { mockCommands, renderWithClient } from "@tests/helpers/fixtures";

const renderHeader = (isFetching = false): { onRefresh: () => void; onOpenSettings: () => void } => {
  const onRefresh = vi.fn();
  const onOpenSettings = vi.fn();
  renderWithClient(
    <WidgetHeader
      runningCount={2}
      totalCount={5}
      isFetching={isFetching}
      onRefresh={onRefresh}
      onOpenSettings={onOpenSettings}
    />,
  );
  return { onRefresh, onOpenSettings };
};

describe("WidgetHeader", () => {
  it("제목과 실행 중 개수를 보여준다", () => {
    renderHeader();
    expect(screen.getByRole("heading", { name: MESSAGES.title })).toBeInTheDocument();
    expect(screen.getByText("2/5 실행 중")).toBeInTheDocument();
  });

  it("새로고침·설정 버튼이 각각의 콜백을 호출한다", async () => {
    const { onRefresh, onOpenSettings } = renderHeader();
    await userEvent.click(screen.getByRole("button", { name: MESSAGES.refresh }));
    await userEvent.click(screen.getByRole("button", { name: MESSAGES.openConfig }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it.each([true, false])("불러오는 중(%s)이면 새로고침 버튼이 busy 상태를 알린다", (isFetching: boolean) => {
    renderHeader(isFetching);
    expect(screen.getByRole("button", { name: MESSAGES.refresh })).toHaveAttribute("aria-busy", String(isFetching));
  });

  it("닫기 버튼은 현재 창을 닫는 IPC 를 보낸다", async () => {
    mockWindows("main");
    const calls = mockCommands({});
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: MESSAGES.close }));
    await waitFor(() => expect(calls).toContainEqual({ cmd: "plugin:window|close", args: { label: "main" } }));
  });

  it("header 와 텍스트는 드래그 영역이고 버튼은 아니다", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("heading", { name: MESSAGES.title })).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByText("2/5 실행 중")).toHaveAttribute("data-tauri-drag-region");
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("data-tauri-drag-region");
    }
  });
});
