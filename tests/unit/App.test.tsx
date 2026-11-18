import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";
import { LOADING_LABEL, OPEN_SETTINGS_ERROR } from "@/contents/app";
import { MESSAGES } from "@/contents/widget";
import type { SnapshotFace } from "@/types/service";
import { makeGroup, makeService, makeSnapshot, mockCommands, renderWithClient } from "@tests/helpers/fixtures";
import type { IpcCallFace } from "@tests/helpers/fixtures";

const CONFIG_ERROR = "services.json: groups[0].services[1].port 8002 중복";

const countCalls = (calls: IpcCallFace[], cmd: string): number => calls.filter((call) => call.cmd === cmd).length;

// 헤더는 창의 유일한 드래그 손잡이라 모든 상태에서 보여야 한다
const expectHeader = (): void => {
  expect(screen.getByRole("button", { name: MESSAGES.refresh })).toBeInTheDocument();
};

describe("App", () => {
  it("첫 응답 전에는 스켈레톤과 헤더를 보여준다", () => {
    mockCommands({ get_services: () => new Promise<never>(() => {}) });
    renderWithClient(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent(LOADING_LABEL);
    expectHeader();
  });

  it("그룹 목록과 실행 중(on·starting) 개수를 보여주고, 새로고침하면 다시 조회한다", async () => {
    const calls = mockCommands({
      get_services: () =>
        makeSnapshot([
          makeGroup("acme", [
            makeService({ group: "acme", name: "backend", port: 8002, status: "on" }),
            makeService({ group: "acme", name: "frontend", port: 3100, status: "starting" }),
          ]),
          makeGroup("blog_platform", [
            makeService({ group: "blog_platform", name: "backend", port: 8000, status: "off" }),
            makeService({ group: "blog_platform", name: "frontend", port: 3000, status: "conflict" }),
          ]),
        ]),
    });
    renderWithClient(<App />);

    expect(await screen.findByRole("heading", { name: "acme" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "blog_platform" })).toBeInTheDocument();
    expect(screen.getByText("2/4 실행 중")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: MESSAGES.refresh }));
    await waitFor(() => expect(countCalls(calls, "get_services")).toBe(2));
  });

  it("위젯이 띄운 프로세스의 포트 충돌은 켜진 것으로 세어 그룹 카드와 같은 개수를 보여준다", async () => {
    mockCommands({
      get_services: () =>
        makeSnapshot([
          makeGroup("acme", [
            makeService({ group: "acme", name: "backend", port: 8002, status: "on" }),
            makeService({ group: "acme", name: "frontend", port: 3100, status: "conflict", origin: "widget" }),
            makeService({ group: "acme", name: "admin", port: 5173, status: "conflict", origin: "external" }),
          ]),
        ]),
    });
    renderWithClient(<App />);

    expect(await screen.findByText("2/3 실행 중")).toBeInTheDocument();
    // 그룹 카드 헤더의 개수와 어긋나지 않는다
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("설정 오류면 원문과 두 버튼을 보여주고, 설정 파일 열기(JSON 원문)·다시 시도가 각 명령을 부른다", async () => {
    let snapshot: SnapshotFace | null = null;
    const calls = mockCommands({
      get_services: () => {
        if (snapshot === null) throw CONFIG_ERROR;
        return snapshot;
      },
    });
    renderWithClient(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(MESSAGES.loadError);
    expect(within(alert).getByText(CONFIG_ERROR)).toBeInTheDocument();
    expectHeader();

    // 깨진 파일은 설정 창이 읽지 못하므로 JSON 원문을 연다
    await userEvent.click(within(alert).getByRole("button", { name: MESSAGES.openConfigFile }));
    await waitFor(() => expect(countCalls(calls, "open_config")).toBe(1));
    expect(countCalls(calls, "open_settings")).toBe(0);

    // 사용자가 설정을 고친 뒤 다시 시도하면 목록이 뜬다
    snapshot = makeSnapshot([makeGroup("acme", [makeService()])]);
    await userEvent.click(within(alert).getByRole("button", { name: MESSAGES.retry }));
    expect(await screen.findByRole("heading", { name: "acme" })).toBeInTheDocument();
    expect(countCalls(calls, "get_services")).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("헤더 설정 버튼은 JSON 파일이 아니라 설정 창을 연다", async () => {
    const calls = mockCommands({ get_services: () => makeSnapshot([makeGroup("acme", [makeService()])]) });
    renderWithClient(<App />);
    expect(await screen.findByRole("heading", { name: "acme" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: MESSAGES.openConfig }));

    await waitFor(() => expect(countCalls(calls, "open_settings")).toBe(1));
    expect(countCalls(calls, "open_config")).toBe(0);
  });

  it.each([
    ["Rust 오류 문자열을 그대로", "설정 창을 만들 수 없습니다", "설정 창을 만들 수 없습니다"],
    ["빈 오류 문자열이면 대체 문구를", "", OPEN_SETTINGS_ERROR],
  ])(
    "설정 창 열기가 실패하면 본문 위 alert 에 %s 보여준다",
    async (_label: string, rustError: string, expected: string) => {
      mockCommands({
        get_services: () => makeSnapshot([makeGroup("acme", [makeService()])]),
        open_settings: () => {
          throw rustError;
        },
      });
      renderWithClient(<App />);
      expect(await screen.findByRole("heading", { name: "acme" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // 목록 상태에서 설정 버튼은 헤더 아이콘 하나뿐이다
      await userEvent.click(screen.getByRole("button", { name: MESSAGES.openConfig }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(expected);
      // 목록은 그대로 남는다
      expect(screen.getByRole("heading", { name: "acme" })).toBeInTheDocument();
    },
  );

  it.each([
    ["그룹이 없을 때", makeSnapshot([])],
    ["그룹에 서비스가 없을 때", makeSnapshot([makeGroup("acme", [])])],
  ])("%s 빈 화면과 헤더를 보여주고 '서버 추가하기'가 설정 창을 연다", async (_label: string, snapshot: SnapshotFace) => {
    const calls = mockCommands({ get_services: () => snapshot });
    renderWithClient(<App />);

    expect(await screen.findByText(MESSAGES.empty)).toBeInTheDocument();
    expect(screen.getByText("0/0 실행 중")).toBeInTheDocument();
    expectHeader();

    await userEvent.click(within(screen.getByRole("main")).getByRole("button", { name: MESSAGES.addServer }));
    await waitFor(() => expect(countCalls(calls, "open_settings")).toBe(1));
  });
});
