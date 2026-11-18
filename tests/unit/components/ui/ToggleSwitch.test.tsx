import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

describe("ToggleSwitch", () => {
  it("클릭하면 반대 값으로 onChange 를 호출한다", async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} label="backend 켜기" />);
    await userEvent.click(screen.getByRole("switch", { name: "backend 켜기" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("비활성이면 클릭해도 호출하지 않는다", async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked onChange={onChange} label="backend 끄기" disabled />);
    const toggle = screen.getByRole("switch", { name: "backend 끄기" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
