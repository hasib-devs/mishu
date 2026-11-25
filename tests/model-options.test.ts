import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MODEL_ID,
  EFFORTS,
  MODEL_OPTIONS,
  effortToRequestOptions,
  isSupportedEffort,
  isSupportedModel,
} from "../src/lib/model-options.ts";

test("catalog holds only live ids with known effort modes", () => {
  assert.equal(MODEL_OPTIONS.length, 4);
  assert.ok(MODEL_OPTIONS.some((model) => model.id === DEFAULT_MODEL_ID));
  assert.deepEqual(EFFORTS, ["low", "medium", "high"]);
  assert.equal(isSupportedModel("nvidia/nemotron-3-super-120b-a12b"), false);
  assert.equal(isSupportedEffort("extreme"), false);
});

test("effort maps to the raw field each model family actually accepts", () => {
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-bolt-e4b", "low"),
    { chat_template_kwargs: { enable_thinking: false } },
  );
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-bolt-e4b", "high"),
    { chat_template_kwargs: { enable_thinking: true } },
  );
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-lightning-30b-a3b", "medium"),
    { reasoning_budget: 8192 },
  );
  assert.deepEqual(
    effortToRequestOptions("nvidia/nemotron-3.5-super-vl-120b-a12b", "high"),
    { reasoning_effort: "high" },
  );
  assert.deepEqual(effortToRequestOptions("google/gemma-3-12b-it", "high"), {});
});
