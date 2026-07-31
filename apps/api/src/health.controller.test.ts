import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getHealthResponse } from "./health.js";

describe("Core Platform API health seam", () => {
  it("exposes an executable health response", () => {
    const response = getHealthResponse();

    assert.deepEqual(response, {
      service: "core-platform-api",
      status: "ok",
    });
  });
});
