import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfigError from "@/components/widget/ConfigError";
import { MESSAGES } from "@/contents/widget";

const RUST_MESSAGE = "services.json: groups[0].services[1].port 8002 중복\ngroups[1].services[0].cwd 없음";

describe("ConfigError", () => {
  it("친절한 제목과 Rust 원문(줄바꿈 포함)을 함께 보여준다", () => {
    render(<ConfigError message={RUST_MESSAGE} onRetry={vi.fn()} onOpenConfig={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(MESSAGES.loadError);
    // 기본 정규화는 줄바꿈을 공백으로 접으므로 끈다
    expect(screen.getByText(RUST_MESSAGE, { normalizer: (text) => text })).toBeInTheDocument();
  });

  it("설정 파일 열기와 다시 시도가 각자의 콜백만 호출한다", async () => {
    const onRetry = vi.fn();
    const onOpenConfig = vi.fn();
    render(<ConfigError message={RUST_MESSAGE} onRetry={onRetry} onOpenConfig={onOpenConfig} />);

    await userEvent.click(screen.getByRole("button", { name: MESSAGES.openConfigFile }));
    expect(onOpenConfig).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: MESSAGES.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenConfig).toHaveBeenCalledTimes(1);
  });
});
