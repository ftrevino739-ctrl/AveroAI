import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { asStringMap, mapVeniceModel, resolveVeniceModelId, selectDefaultModelId } from "../lib/venice-catalog.js";
const fixture=JSON.parse(await readFile(new URL("./fixtures/venice-text-catalog.sample.json",import.meta.url),"utf8"));
const models=fixture.models.data.map(mapVeniceModel).filter(Boolean);
const traits=asStringMap(fixture.traits.data),aliases=asStringMap(fixture.compatibility.data);
test("filters offline and non-text catalog records",()=>assert.deepEqual(models.map(m=>m.id),["venice-default-sample","venice-uncensored-sample"]));
test("maps published context, max completion and USD prices",()=>{
 assert.equal(models[0].contextTokens,64000);assert.equal(models[0].maxCompletionTokens,8192);
 assert.equal(models[0].inputPrice,0.5);assert.equal(models[0].outputPrice,1.5);assert.equal(models[0].supportsReasoning,true);
});
test("uses traits.default when that model is available",()=>assert.equal(selectDefaultModelId(models,traits),"venice-default-sample"));
test("resolves only aliases whose destination is in the live catalog",()=>{
 assert.equal(resolveVeniceModelId("gpt-4o",models,aliases),"venice-default-sample");
 assert.equal(resolveVeniceModelId("unknown",models,aliases),null);
});
test("rejects malformed model rows",()=>{assert.equal(mapVeniceModel(null),null);assert.equal(mapVeniceModel({id:3}),null);});
