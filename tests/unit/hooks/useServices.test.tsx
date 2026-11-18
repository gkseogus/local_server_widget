import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { useServices } from "@/hooks/useServices";
import { makeGroup, makeService, makeSnapshot, mockCommands, renderWithClient } from "@tests/helpers/fixtures";

const Probe = () => {
  const { data, error } = useServices();
  if (error) return <p>error:{error}</p>;
  return <p>groups:{data?.groups.length ?? "loading"}</p>;
};

describe("useServices", () => {
  it("get_services 결과를 돌려준다", async () => {
    mockCommands({ get_services: () => makeSnapshot([makeGroup("acme", [makeService()])]) });
    renderWithClient(<Probe />);
    expect(await screen.findByText("groups:1")).toBeInTheDocument();
  });

  it("Rust 오류 문자열을 error 로 노출한다", async () => {
    mockCommands({
      get_services: () => {
        throw "services.json: groups[0].services[1].port 8002 중복";
      },
    });
    renderWithClient(<Probe />);
    expect(await screen.findByText(/error:services.json/)).toBeInTheDocument();
  });
});
