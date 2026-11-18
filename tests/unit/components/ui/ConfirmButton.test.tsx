import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { CONFIRM_TEXT } from "@/contents/form";

const renderButton = (): (() => void) => {
  const onConfirm = vi.fn();
  render(<ConfirmButton label="서버 삭제" prompt="이 서버를 지울까요?" onConfirm={onConfirm} />);
  return onConfirm;
};

describe("ConfirmButton", () => {
  it("첫 클릭은 묻기만 하고, 확인을 눌러야 실행한다", async () => {
    const onConfirm = renderButton();

    await userEvent.click(screen.getByRole("button", { name: "서버 삭제" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "이 서버를 지울까요?" })).toBeInTheDocument();
    // 실수로 Enter 를 눌러도 지워지지 않게 취소에 포커스가 간다
    expect(screen.getByRole("button", { name: CONFIRM_TEXT.cancel })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: CONFIRM_TEXT.confirm }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("취소·Esc 는 실행하지 않고 처음 버튼으로 돌아간다", async () => {
    const onConfirm = renderButton();

    await userEvent.click(screen.getByRole("button", { name: "서버 삭제" }));
    await userEvent.click(screen.getByRole("button", { name: CONFIRM_TEXT.cancel }));
    expect(screen.getByRole("button", { name: "서버 삭제" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "서버 삭제" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "서버 삭제" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
