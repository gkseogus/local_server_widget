import { describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { SIDEBAR_TEXT } from "@/contents/settings";
import { toDraft } from "@/lib/settingsDraft";
import type { DraftFace, SelectionFace, ValidationIssueFace } from "@/types/settings";
import { makeAcmeConfig } from "@tests/helpers/fixtures";

interface CallbacksFace {
  onSelect: Mock<(selection: SelectionFace) => void>;
  onAddProject: Mock<() => void>;
  onAddService: Mock<(groupIndex: number) => void>;
  onOpenJson: Mock<() => void>;
}

const renderSidebar = (
  draft: DraftFace = toDraft(makeAcmeConfig()),
  issues: ValidationIssueFace[] = [],
  active: SelectionFace | null = { group: 0, service: 1 },
): CallbacksFace => {
  const callbacks: CallbacksFace = {
    onSelect: vi.fn(),
    onAddProject: vi.fn(),
    onAddService: vi.fn(),
    onOpenJson: vi.fn(),
  };
  render(<SettingsSidebar draft={draft} active={active} issues={issues} isBusy={false} {...callbacks} />);
  return callbacks;
};

describe("SettingsSidebar", () => {
  it("프로젝트 아래 서버마다 이름·종류·포트를 보여 주고 선택한 항목을 표시한다", () => {
    renderSidebar();

    const frontend = screen.getByRole("button", { name: /^frontend/ });
    expect(frontend).toHaveTextContent("frontendNext.js:3100");
    expect(screen.getByRole("button", { name: /^backend/ })).toHaveTextContent("FastAPI");
    expect(screen.getByRole("button", { name: /^admin/ })).toHaveTextContent("Vite");
    expect(frontend).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "acme" })).not.toHaveAttribute("aria-current");
  });

  it("항목·추가·JSON 버튼이 각 콜백을 부른다", async () => {
    const callbacks = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "acme" }));
    await userEvent.click(screen.getByRole("button", { name: /^admin/ }));
    await userEvent.click(screen.getByRole("button", { name: `acme ${SIDEBAR_TEXT.addServerSuffix}` }));
    await userEvent.click(screen.getByRole("button", { name: SIDEBAR_TEXT.addProject }));
    await userEvent.click(screen.getByRole("button", { name: SIDEBAR_TEXT.openJson }));

    expect(callbacks.onSelect).toHaveBeenNthCalledWith(1, { group: 0, service: null });
    expect(callbacks.onSelect).toHaveBeenNthCalledWith(2, { group: 0, service: 2 });
    expect(callbacks.onAddService).toHaveBeenCalledWith(0);
    expect(callbacks.onAddProject).toHaveBeenCalledOnce();
    expect(callbacks.onOpenJson).toHaveBeenCalledOnce();
  });

  it("위·아래 화살표로 항목을 옮겨 연다", async () => {
    const callbacks = renderSidebar();
    screen.getByRole("button", { name: /^frontend/ }).focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /^admin/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("button", { name: "acme" })).toHaveFocus();

    expect(callbacks.onSelect.mock.calls.map(([selection]) => selection)).toEqual([
      { group: 0, service: 2 },
      { group: 0, service: 1 },
      { group: 0, service: 0 },
      { group: 0, service: null },
    ]);
  });

  it("고칠 곳이 있는 항목에 표시를 붙인다", () => {
    renderSidebar(undefined, [{ group: 0, service: 2, field: "port", message: "x" }]);
    expect(screen.getByRole("button", { name: /^admin/ })).toHaveAccessibleName(/고칠 곳 있음/);
    expect(screen.getByRole("button", { name: /^backend/ })).not.toHaveAccessibleName(/고칠 곳 있음/);
  });

  it("프로젝트가 없어도 추가·JSON 버튼은 있다", () => {
    renderSidebar({ groups: [] }, [], null);
    const nav = screen.getByRole("navigation", { name: SIDEBAR_TEXT.label });
    expect(within(nav).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: SIDEBAR_TEXT.addProject })).toBeEnabled();
    expect(screen.getByRole("button", { name: SIDEBAR_TEXT.openJson })).toBeInTheDocument();
  });
});
