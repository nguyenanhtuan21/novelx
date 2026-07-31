import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "./route.js";

describe("NovelX web health seam", () => {
  it("exposes an executable health response", async () => {
    const response = await GET();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: "novelx-web",
      status: "ok",
    });
  });
});
