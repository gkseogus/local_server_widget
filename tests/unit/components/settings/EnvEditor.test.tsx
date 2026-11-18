import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnvEditor from "@/components/settings/EnvEditor";
import { ENV_TEXT, VALIDATION_TEXT } from "@/contents/settings";
import type { EnvRowFace, TemplateOptionFace, ValidationIssueFace } from "@/types/settings";

const OPTIONS: TemplateOptionFace[] = [
  { value: "{port}", label: "{port} · 이 서버 포트" },
  { value: "{backend.url}", label: "{backend.url} · backend 주소" },
];

const Harness = ({ initial, issues = [] }: { initial: EnvRowFace[]; issues?: ValidationIssueFace[] }): ReactElement => {
  const [env, setEnv] = useState(initial);
  return (
    <>
      <EnvEditor env={env} issues={issues} templateOptions={OPTIONS} onChange={setEnv} />
      <output>{JSON.stringify(env)}</output>
    </>
  );
};

const current = (): EnvRowFace[] => JSON.parse(screen.getByRole("status").textContent ?? "[]") as EnvRowFace[];

describe("EnvEditor", () => {
  it("기본은 접혀 있고 개수를 보여 준다", () => {
    render(<Harness initial={[{ key: "A", value: "1" }]} />);
    expect(screen.getByText(ENV_TEXT.title).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(`· 1${ENV_TEXT.countSuffix}`)).toBeInTheDocument();
  });

  it("비어 있으면 안내를 보여 준다", () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(ENV_TEXT.empty)).toBeInTheDocument();
  });

  it("변수를 추가해 이름·값을 쓰고 템플릿을 넣고 지운다", async () => {
    render(<Harness initial={[{ key: "KEEP", value: "1" }]} />);
    await userEvent.click(screen.getByText(ENV_TEXT.title));

    await userEvent.click(screen.getByRole("button", { name: ENV_TEXT.add }));
    // 새 줄 이름 칸에 바로 입력된다
    expect(screen.getByLabelText(`${ENV_TEXT.keyLabel} 2`)).toHaveFocus();
    await userEvent.keyboard("API_URL");
    await userEvent.type(screen.getByLabelText(`${ENV_TEXT.valueLabel} 2`), "x=");
    await userEvent.selectOptions(screen.getByLabelText(`${ENV_TEXT.templateLabel} 2`), "{backend.url}");

    expect(current()).toEqual([
      { key: "KEEP", value: "1" },
      { key: "API_URL", value: "x={backend.url}" },
    ]);
    // 메뉴는 고른 뒤 다시 "템플릿" 으로 돌아온다
    expect(screen.getByLabelText(`${ENV_TEXT.templateLabel} 2`)).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: `${ENV_TEXT.remove} 1` }));
    expect(current()).toEqual([{ key: "API_URL", value: "x={backend.url}" }]);
  });

  it("이름이 잠시 겹쳐도 다른 줄 값을 잃지 않는다", async () => {
    render(<Harness initial={[{ key: "API_URL", value: "a" }]} />);
    await userEvent.click(screen.getByRole("button", { name: ENV_TEXT.add }));
    await userEvent.keyboard("API_URL2");

    expect(current()).toEqual([
      { key: "API_URL", value: "a" },
      { key: "API_URL2", value: "" },
    ]);
  });

  it("오류가 있으면 펼친 채로 그 줄 아래에 보여 준다", () => {
    render(
      <Harness
        initial={[{ key: "1BAD", value: "x" }]}
        issues={[{ group: 0, service: 0, field: "env", message: VALIDATION_TEXT.envKeyInvalid, envIndex: 0 }]}
      />,
    );
    expect(screen.getByText(ENV_TEXT.title).closest("details")).toHaveAttribute("open");
    const key = screen.getByLabelText(`${ENV_TEXT.keyLabel} 1`);
    expect(key).toHaveAttribute("aria-invalid", "true");
    expect(key).toHaveAccessibleDescription(VALIDATION_TEXT.envKeyInvalid);
  });
});
