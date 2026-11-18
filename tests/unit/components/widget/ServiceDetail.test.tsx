import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ServiceDetail from "@/components/widget/ServiceDetail";
import { DETAIL_LABELS, EMPTY_VALUE, NO_ENV_LABEL, OPEN_LOG_ERROR } from "@/contents/serviceDetail";
import { MESSAGES, ORIGIN_LABELS } from "@/contents/widget";
import { makeService, mockCommands, renderWithClient } from "@tests/helpers/fixtures";

describe("ServiceDetail", () => {
  it("실행 중인 서비스의 출처·PID·시작 시각·폴더·명령·환경변수를 보여준다", () => {
    const service = makeService({
      group: "acme",
      name: "frontend",
      port: 3100,
      status: "on",
      origin: "external",
      pids: [4321, 4322],
      startedAt: "2026-11-12 09:30:00",
      command: "pnpm dev --port 3100",
      listenerCommand: "/opt/homebrew/bin/node /Users/dev/acme_frontend/node_modules/.bin/next dev --port 3100",
      env: { NEXT_PUBLIC_API_BASE_URL: "http://localhost:8002", PORT: "3100" },
    });
    renderWithClient(<ServiceDetail service={service} />);

    expect(screen.getByText(ORIGIN_LABELS.external)).toBeInTheDocument();
    expect(screen.getByText("4321, 4322")).toBeInTheDocument();
    expect(screen.getByText("2026-11-12 09:30:00")).toBeInTheDocument();
    expect(screen.getByText(service.cwd)).toBeInTheDocument();
    expect(screen.getByText("pnpm dev --port 3100")).toBeInTheDocument();
    expect(screen.getByText("NEXT_PUBLIC_API_BASE_URL=http://localhost:8002")).toBeInTheDocument();
    expect(screen.getByText("PORT=3100")).toBeInTheDocument();
    // 충돌이 아니면 점유 프로세스 명령이 달라도 표시하지 않는다
    expect(screen.queryByText(DETAIL_LABELS.listener)).not.toBeInTheDocument();
    expect(screen.queryByText(/node_modules/)).not.toBeInTheDocument();
  });

  it("꺼진 서비스는 빈 값에 대시, 환경변수가 없으면 '없음' 을 보여준다", () => {
    renderWithClient(<ServiceDetail service={makeService()} />);

    // 출처·PID·시작 시각
    expect(screen.getAllByText(EMPTY_VALUE)).toHaveLength(3);
    expect(screen.getByText(NO_ENV_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(DETAIL_LABELS.listener)).not.toBeInTheDocument();
  });

  it("포트 충돌이면 포트를 점유한 프로세스 명령을 보여준다", () => {
    const service = makeService({
      status: "conflict",
      pids: [999],
      listenerCommand: "/usr/bin/python3 -m http.server 8002",
    });
    renderWithClient(<ServiceDetail service={service} />);

    expect(screen.getByText(DETAIL_LABELS.listener)).toBeInTheDocument();
    expect(screen.getByText("/usr/bin/python3 -m http.server 8002")).toBeInTheDocument();
  });

  it("'로그 열기' 를 누르면 서비스 id 로 open_log 를 호출한다", async () => {
    const calls = mockCommands({ open_log: () => undefined });
    renderWithClient(<ServiceDetail service={makeService()} />);

    await userEvent.click(screen.getByRole("button", { name: MESSAGES.openLog }));

    await waitFor(() => expect(calls).toContainEqual({ cmd: "open_log", args: { id: "acme/backend" } }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("로그 열기에 실패하면 기술 용어 없이 알림을 보여준다", async () => {
    mockCommands({
      open_log: () => {
        throw "No such file or directory (os error 2)";
      },
    });
    renderWithClient(<ServiceDetail service={makeService()} />);

    await userEvent.click(screen.getByRole("button", { name: MESSAGES.openLog }));

    expect(await screen.findByRole("alert")).toHaveTextContent(OPEN_LOG_ERROR);
    expect(screen.queryByText(/os error/)).not.toBeInTheDocument();
  });
});
