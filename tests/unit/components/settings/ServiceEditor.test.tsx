import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ServiceEditor from "@/components/settings/ServiceEditor";
import { CONNECTION_TEXT, PREVIEW_TEXT, SERVICE_TEXT } from "@/contents/settings";
import { addService, toDraft } from "@/lib/settingsDraft";
import { validateDraft } from "@/lib/settingsValidation";
import type { DraftFace, DraftServiceFace } from "@/types/settings";
import {
  makeGroup,
  makeAcmeConfig,
  makeProjectInfo,
  makeService,
  makeSnapshot,
  mockCommands,
  renderWithClient,
} from "@tests/helpers/fixtures";

// 실제 SettingsWorkspace 처럼 draft 를 들고 편집 결과를 반영하는 틀
const Harness = ({ initial, serviceIndex }: { initial: DraftFace; serviceIndex: number }): ReactElement => {
  const [draft, setDraft] = useState(initial);
  return (
    <ServiceEditor
      draft={draft}
      groupIndex={0}
      serviceIndex={serviceIndex}
      issues={validateDraft(draft)}
      onChange={setDraft}
      onRemove={vi.fn()}
    />
  );
};

const acme = (): DraftFace => toDraft(makeAcmeConfig());

const withNew = (service: Partial<DraftServiceFace> = {}): DraftFace =>
  addService(acme(), 0, { name: "", cwd: "", port: null, command: "", env: [], ...service });

const field = (label: string): HTMLInputElement => screen.getByLabelText(label);

const preview = (): HTMLElement => screen.getByRole("region", { name: PREVIEW_TEXT.title });

describe("ServiceEditor — 폴더 선택", () => {
  it("폴더를 고르면 감지값으로 이름·명령·포트를 채우고 종류 배지를 보여 준다", async () => {
    const calls = mockCommands({
      pick_folder: () => "~/Desktop/acme_worker",
      detect_project: () => makeProjectInfo({ suggestedName: "worker", defaultPort: 8002 }),
    });
    renderWithClient(<Harness initial={withNew()} serviceIndex={3} />);

    await userEvent.click(screen.getByRole("button", { name: SERVICE_TEXT.pickFolder }));

    await waitFor(() => expect(field(SERVICE_TEXT.nameLabel)).toHaveValue("worker"));
    expect(field(SERVICE_TEXT.folderLabel)).toHaveValue("~/Desktop/acme_worker");
    expect(field(SERVICE_TEXT.commandLabel)).toHaveValue(".venv/bin/uvicorn app.main:app --reload --port {port}");
    // 8002 는 backend 가 쓰고 있어 다음 빈 번호
    expect(field(SERVICE_TEXT.portLabel)).toHaveValue("8003");
    expect(screen.getByRole("heading", { name: "worker" }).parentElement).toHaveTextContent("FastAPI");
    expect(calls).toContainEqual({ cmd: "detect_project", args: { cwd: "~/Desktop/acme_worker" } });
  });

  it("이미 입력한 이름·명령은 덮어쓰지 않고, 감지된 명령은 버튼으로 적용한다", async () => {
    mockCommands({
      pick_folder: () => "~/Desktop/acme_worker",
      detect_project: () => makeProjectInfo({ suggestedName: "worker" }),
    });
    renderWithClient(<Harness initial={withNew({ name: "jobs", command: "python run.py" })} serviceIndex={3} />);

    await userEvent.click(screen.getByRole("button", { name: SERVICE_TEXT.pickFolder }));
    const apply = await screen.findByRole("button", { name: SERVICE_TEXT.applyDetected });

    expect(field(SERVICE_TEXT.nameLabel)).toHaveValue("jobs");
    expect(field(SERVICE_TEXT.commandLabel)).toHaveValue("python run.py");
    expect(field(SERVICE_TEXT.portLabel)).toHaveValue("8000");

    await userEvent.click(apply);
    expect(field(SERVICE_TEXT.commandLabel)).toHaveValue(".venv/bin/uvicorn app.main:app --reload --port {port}");
    expect(screen.queryByRole("button", { name: SERVICE_TEXT.applyDetected })).not.toBeInTheDocument();
  });

  it("폴더 선택을 취소하면 아무것도 바꾸지 않는다", async () => {
    const calls = mockCommands({ pick_folder: () => null });
    renderWithClient(<Harness initial={withNew()} serviceIndex={3} />);

    await userEvent.click(screen.getByRole("button", { name: SERVICE_TEXT.pickFolder }));

    await waitFor(() => expect(calls.some((call) => call.cmd === "pick_folder")).toBe(true));
    expect(field(SERVICE_TEXT.folderLabel)).toHaveValue("");
    expect(calls.some((call) => call.cmd === "detect_project")).toBe(false);
  });

  it("폴더를 살펴보지 못하면 폴더 칸 아래에 알린다", async () => {
    mockCommands({
      detect_project: () => {
        throw "폴더가 없습니다";
      },
    });
    renderWithClient(<Harness initial={acme()} serviceIndex={0} />);

    expect(await screen.findByText(SERVICE_TEXT.detectError)).toBeInTheDocument();
    expect(field(SERVICE_TEXT.folderLabel)).toHaveAccessibleDescription(SERVICE_TEXT.detectError);
  });
});

describe("ServiceEditor — 입력 검증", () => {
  it("포트에는 숫자만 들어가고, 겹치면 어느 서버와 겹치는지 알려 준다", async () => {
    mockCommands({});
    renderWithClient(<Harness initial={acme()} serviceIndex={1} />);

    const port = field(SERVICE_TEXT.portLabel);
    await userEvent.clear(port);
    await userEvent.type(port, "80a02");

    expect(port).toHaveValue("8002");
    expect(port).toHaveAttribute("aria-invalid", "true");
    expect(port).toHaveAccessibleDescription(/‘acme\/backend’ 서버와 포트가 겹쳐요/);
  });

  it("빈 실행 명령은 오류로 표시한다", async () => {
    mockCommands({});
    renderWithClient(<Harness initial={acme()} serviceIndex={1} />);

    await userEvent.clear(field(SERVICE_TEXT.commandLabel));

    expect(field(SERVICE_TEXT.commandLabel)).toHaveAccessibleDescription("실행 명령을 입력하세요.");
  });
});

describe("ServiceEditor — 연결과 미리보기", () => {
  it("API 백엔드를 고르면 감지된 변수에 {backend.url} 을 쓰고 미리보기에 실제 주소가 나온다", async () => {
    mockCommands({
      detect_project: () => makeProjectInfo({ kind: "vite", apiEnvKeys: ["VITE_API_URL", "VITE_WS_URL"] }),
    });
    // env 가 빈 새 프론트
    renderWithClient(
      <Harness
        initial={withNew({ name: "web", cwd: "~/Desktop/acme_web", port: 5180, command: "vite --port {port}" })}
        serviceIndex={3}
      />,
    );
    const select = screen.getByLabelText(CONNECTION_TEXT.apiLabel);
    // 감지가 끝나면 변수 칩이 생기고 백엔드를 고를 수 있다
    await screen.findByRole("button", { name: `VITE_API_URL ${CONNECTION_TEXT.removeKeySuffix}` });

    await userEvent.selectOptions(select, "backend");

    expect(select).toHaveValue("backend");
    expect(within(preview()).getByText("VITE_API_URL=http://localhost:8002")).toBeInTheDocument();
    expect(within(preview()).getByText("VITE_WS_URL=http://localhost:8002")).toBeInTheDocument();
    expect(screen.getByLabelText("값 1")).toHaveValue("{backend.url}");
    expect(within(preview()).getByText("vite --port 5180")).toBeInTheDocument();
  });

  it("기존 env 에서 연결을 읽어 오고, '연결 안 함' 이면 그 변수를 지운다", async () => {
    mockCommands({});
    renderWithClient(<Harness initial={acme()} serviceIndex={1} />);

    const select = screen.getByLabelText(CONNECTION_TEXT.apiLabel);
    expect(select).toHaveValue("backend");
    expect(screen.getByRole("button", { name: `BACKEND_ORIGIN ${CONNECTION_TEXT.removeKeySuffix}` })).toBeInTheDocument();

    await userEvent.selectOptions(select, "");

    expect(within(preview()).queryByText(/NEXT_PUBLIC_API_BASE_URL/)).not.toBeInTheDocument();
    expect(within(preview()).getByText(PREVIEW_TEXT.empty)).toBeInTheDocument();
    // 칩은 남아 있어 다시 고르면 그대로 연결된다
    await userEvent.selectOptions(select, "admin");
    expect(within(preview()).getByText("NEXT_PUBLIC_API_BASE_URL=http://localhost:5173")).toBeInTheDocument();
  });

  it("CORS 체크박스는 체크한 서버 주소를 쉼표로 이어 쓴다", async () => {
    mockCommands({ detect_project: () => makeProjectInfo({ corsEnvKeys: ["BACKEND_CORS_ORIGINS"] }) });
    renderWithClient(<Harness initial={withNew({ name: "api", cwd: "~/Desktop/acme_api", port: 8100, command: "run" })} serviceIndex={3} />);
    await waitFor(() => expect(screen.getByLabelText(CONNECTION_TEXT.corsKeyLabel)).toHaveValue("BACKEND_CORS_ORIGINS"));

    await userEvent.click(screen.getByRole("checkbox", { name: /frontend/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /admin/ }));

    expect(
      within(preview()).getByText("BACKEND_CORS_ORIGINS=http://localhost:3100,http://localhost:5173"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /frontend/ }));
    expect(within(preview()).getByText("BACKEND_CORS_ORIGINS=http://localhost:5173")).toBeInTheDocument();
  });

  it("백엔드(FastAPI)는 CORS 칸만, 프론트(Next)는 API 백엔드 칸만 보여 준다", async () => {
    mockCommands({ detect_project: () => makeProjectInfo({ kind: "fastapi" }) });
    const backend = renderWithClient(
      <Harness initial={withNew({ name: "api", cwd: "~/Desktop/acme_api", port: 8100, command: "run" })} serviceIndex={3} />,
    );
    await waitFor(() => expect(screen.queryByLabelText(CONNECTION_TEXT.apiLabel)).not.toBeInTheDocument());
    expect(screen.getByRole("group", { name: CONNECTION_TEXT.corsLabel })).toBeInTheDocument();
    backend.unmount();

    mockCommands({ detect_project: () => makeProjectInfo({ kind: "next", apiEnvKeys: ["NEXT_PUBLIC_API_URL"] }) });
    renderWithClient(
      <Harness initial={withNew({ name: "web", cwd: "~/Desktop/acme_web", port: 3200, command: "run" })} serviceIndex={3} />,
    );
    await waitFor(() => expect(screen.queryByRole("group", { name: CONNECTION_TEXT.corsLabel })).not.toBeInTheDocument());
    expect(screen.getByLabelText(CONNECTION_TEXT.apiLabel)).toBeInTheDocument();
  });

  it("같은 프로젝트에 다른 서버가 없으면 연결 대신 안내를 보여 준다", () => {
    mockCommands({});
    const draft: DraftFace = { groups: [{ name: "solo", services: [acme().groups[0].services[0]] }] };
    renderWithClient(<Harness initial={draft} serviceIndex={0} />);

    expect(screen.getByText(CONNECTION_TEXT.noSiblings)).toBeInTheDocument();
    expect(screen.queryByLabelText(CONNECTION_TEXT.apiLabel)).not.toBeInTheDocument();
  });
});

describe("ServiceEditor — 실행 중 안내", () => {
  it.each([
    ["on", true],
    ["starting", true],
    ["off", false],
  ] as const)("상태가 %s 이면 안내 표시 = %s", async (status, shown: boolean) => {
    mockCommands({
      get_services: () => makeSnapshot([makeGroup("acme", [makeService({ name: "backend", status })])]),
    });
    renderWithClient(<Harness initial={acme()} serviceIndex={0} />);

    if (shown) {
      expect(await screen.findByText(SERVICE_TEXT.running)).toBeInTheDocument();
    } else {
      // 상태를 받은 뒤에도 안내가 없다
      await waitFor(() => expect(screen.queryByText(SERVICE_TEXT.running)).not.toBeInTheDocument());
    }
  });
});
