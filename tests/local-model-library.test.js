import test from "node:test";
import assert from "node:assert/strict";
import { LOCAL_MODEL_LIBRARY, getLocalModelByOllamaTag } from "../lib/local-model-library.js";

test("only the small community Qwen 2.5 3B preset is marked as an 8 GB candidate", () => {
  const candidates = LOCAL_MODEL_LIBRARY.filter((model) => model.compatibleWith8GB);
  assert.deepEqual(candidates.map((model) => model.id), ["qwen25-3b-uncensored-q4km"]);
  assert.equal(candidates[0].downloadGB, 1.93);
});

test("does not claim a community derivative is the exact Venice checkpoint", () => {
  const qwen = LOCAL_MODEL_LIBRARY.find((model) => model.id === "qwen25-3b-uncensored-q4km");
  assert.equal(qwen.listedByVenice, false);
  assert.equal(LOCAL_MODEL_LIBRARY.find((model) => model.id === "qwen25-7b-official-q2k").listedByVenice, true);
  assert.equal(LOCAL_MODEL_LIBRARY.find((model) => model.id === "venice-uncensored-1-2").exactVeniceCheckpoint, true);
});

test("identifies the installed 7B local model by its Ollama HF reference", () => {
  const model = getLocalModelByOllamaTag("hf.co/tensorblock/Qwen2.5-7B-Instruct-abliterated-GGUF:Q3_K_M");
  assert.equal(model?.id, "qwen25-7b-abliterated-q3km");
});
