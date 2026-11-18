import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaveBar from "@/components/settings/SaveBar";
import { CONFIRM_TEXT } from "@/contents/form";
import { SAVE_TEXT } from "@/contents/settings";

const renderBar = (
  props: Partial<{ changeCount: number; issueCount: number; isSaving: boolean; saveError: string | null; showToast: boolean }> = {},
): { onSave: () => void; onRevert: () => void; onReload: () => void; onJumpToIssue: () => void } => {
  const callbacks = { onSave: vi.fn(), onRevert: vi.fn(), onReload: vi.fn(), onJumpToIssue: vi.fn() };
  render(
    <SaveBar changeCount={0} issueCount={0} isSaving={false} saveError={null} showToast={false} {...props} {...callbacks} />,
  );
  return callbacks;
};

const saveButton = (): HTMLElement => screen.getByRole("button", { name: SAVE_TEXT.save });

describe("SaveBar", () => {
  it("변경이 없으면 '저장됨' 이고 저장·되돌리기를 할 수 없다", () => {
    renderBar();
    expect(screen.getByText(SAVE_TEXT.saved)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: SAVE_TEXT.revert })).not.toBeInTheDocument();
  });

  it("변경 건수를 보여 주고 저장·되돌리기를 부른다", async () => {
    const { onSave, onRevert } = renderBar({ changeCount: 3 });
    expect(screen.getByText(`${SAVE_TEXT.dirtyPrefix} 3${SAVE_TEXT.dirtySuffix}`)).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute("aria-keyshortcuts", "Meta+S");

    await userEvent.click(saveButton());
    await userEvent.click(screen.getByRole("button", { name: SAVE_TEXT.revert }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onRevert).toHaveBeenCalledOnce();
  });

  it("고칠 곳이 있으면 저장을 막고, 개수를 누르면 그곳으로 보낸다", async () => {
    const { onJumpToIssue } = renderBar({ changeCount: 1, issueCount: 2 });
    expect(saveButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: `${SAVE_TEXT.issuesPrefix} 2${SAVE_TEXT.issuesSuffix}` }));
    expect(onJumpToIssue).toHaveBeenCalledOnce();
  });

  it("저장 중에는 버튼을 잠그고 문구를 바꾼다", () => {
    renderBar({ changeCount: 1, isSaving: true });
    expect(screen.getByRole("button", { name: SAVE_TEXT.saving })).toBeDisabled();
  });

  it("Rust 문제를 한 줄씩 목록으로, 빈 오류면 대체 문구를 보여 준다", () => {
    const { unmount } = render(
      <SaveBar
        changeCount={1}
        issueCount={0}
        isSaving={false}
        saveError={"a: 폴더가 없습니다\n\nb: 포트 중복"}
        showToast={false}
        onSave={vi.fn()}
        onRevert={vi.fn()}
        onReload={vi.fn()}
        onJumpToIssue={vi.fn()}
      />,
    );
    const items = within(screen.getByRole("alert")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["a: 폴더가 없습니다", "b: 포트 중복"]);
    unmount();

    renderBar({ changeCount: 1, saveError: "" });
    expect(screen.getByRole("alert")).toHaveTextContent(SAVE_TEXT.errorFallback);
  });

  it("저장이 실패하면 '파일에서 다시 불러오기' 를 주고, 확인해야만 부른다", async () => {
    const { onReload } = renderBar({ changeCount: 1, saveError: "a: 폴더가 없습니다" });
    const alert = screen.getByRole("alert");

    await userEvent.click(within(alert).getByRole("button", { name: SAVE_TEXT.reload }));
    expect(onReload).not.toHaveBeenCalled();
    expect(within(alert).getByRole("group", { name: SAVE_TEXT.reloadPrompt })).toBeInTheDocument();
    expect(within(alert).queryByRole("button", { name: CONFIRM_TEXT.confirm })).not.toBeInTheDocument();

    await userEvent.click(within(alert).getByRole("button", { name: SAVE_TEXT.reloadConfirm }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("저장 오류가 없으면 다시 불러오기도 없다", () => {
    renderBar({ changeCount: 1 });
    expect(screen.queryByRole("button", { name: SAVE_TEXT.reload })).not.toBeInTheDocument();
  });

  it("저장 성공 토스트는 status 로 알린다", () => {
    renderBar({ showToast: true });
    expect(screen.getByRole("status")).toHaveTextContent(SAVE_TEXT.toast);
  });
});
