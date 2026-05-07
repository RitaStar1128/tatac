import { afterEach, describe, expect, it, vi } from "vitest";

import { getSyncEnvironmentSupport } from "./syncEnvironment";

function mockWindowLocation(href: string) {
  vi.stubGlobal("window", {
    location: {
      href,
    },
  });
}

describe("syncEnvironment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects hosted https for local bootstrap setup", () => {
    mockWindowLocation("https://tatac.vercel.app/");

    expect(getSyncEnvironmentSupport("http://127.0.0.1:4010")).toMatchObject({
      supported: false,
      reason: "https-app-cannot-call-http-node",
    });
    expect(getSyncEnvironmentSupport()).toMatchObject({
      supported: false,
      reason: "requires-local-http-app",
    });
  });

  it("allows local http app to call local http sync nodes", () => {
    mockWindowLocation("http://192.168.0.20:3000/");

    expect(getSyncEnvironmentSupport("http://127.0.0.1:4010")).toMatchObject({
      supported: true,
      reason: "ok",
    });
    expect(getSyncEnvironmentSupport("http://192.168.0.10:4010")).toMatchObject({
      supported: true,
      reason: "ok",
    });
  });

  it("allows https app to call https sync nodes", () => {
    mockWindowLocation("https://tatac.example.com/");

    expect(getSyncEnvironmentSupport("https://sync.example.com")).toMatchObject({
      supported: true,
      reason: "ok",
    });
  });
});
