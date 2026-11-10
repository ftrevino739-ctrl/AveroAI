/** @typedef {import("./models").ModelInfo} ModelInfo */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value */
export function priceValue(value) {
  const raw = isRecord(value) ? (value.usd ?? value.USD ?? value.value) : value;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
/** @param {unknown} row @returns {ModelInfo | null} */
export function mapVeniceModel(row) {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  const spec = isRecord(row.model_spec) ? row.model_spec : {};
  if (spec.offline === true || (row.type && row.type !== "text")) return null;
  const capabilities = isRecord(spec.capabilities) ? spec.capabilities : {};
  const traits = Array.isArray(spec.traits) ? spec.traits.filter((v) => typeof v === "string") : [];
  const contextRaw = Number(spec.availableContextTokens ?? row.context_length ?? spec.context_length ?? 0);
  const contextTokens = Number.isFinite(contextRaw) && contextRaw > 0 ? contextRaw : 0;
  const completionRaw = Number(spec.maxCompletionTokens ?? 0);
  const maxCompletionTokens = Number.isFinite(completionRaw) && completionRaw > 0 ? completionRaw : undefined;
  const pricing = isRecord(spec.pricing) ? spec.pricing : {};
  const name = typeof spec.name === "string" && spec.name.trim() ? spec.name : row.id;
  const description = typeof spec.description === "string" ? spec.description : "";
  const deprecation = isRecord(spec.deprecation) ? {
    date: typeof spec.deprecation.date === "string" ? spec.deprecation.date : undefined,
    removesAt: typeof spec.deprecation.removesAt === "string" ? spec.deprecation.removesAt : undefined,
    replacementModelId: typeof spec.deprecation.replacementModelId === "string" ? spec.deprecation.replacementModelId : undefined,
    autoRemap: spec.deprecation.autoRemap === true
  } : undefined;
  const isFast = /flash|fast|turbo|mini|haiku/i.test(name + " " + row.id);
  const hasOpenWeights = typeof spec.modelSource === "string" && spec.modelSource.length > 0;
  return {
    id: row.id, name, provider: "Venice AI", providerId: "venice",
    description: description.slice(0, 420) || "Modelo de texto disponible en el catálogo oficial de Venice.",
    category: isFast ? "Fast" : hasOpenWeights ? "Open" : "Frontier",
    context: contextTokens > 0 ? contextTokens >= 1000000
      ? (contextTokens / 1000000).toFixed(contextTokens % 1000000 === 0 ? 0 : 1) + "M"
      : Math.round(contextTokens / 1000) + "K" : "No publicado",
    contextTokens, uncensored: spec.uncensored === true, traits, deprecated: Boolean(deprecation), deprecation,
    inputPrice: priceValue(pricing.input), outputPrice: priceValue(pricing.output), maxCompletionTokens,
    privacy: typeof spec.privacy === "string" ? spec.privacy : undefined,
    supportsVision: capabilities.supportsVision === true, supportsReasoning: capabilities.supportsReasoning === true,
    supportsFunctionCalling: capabilities.supportsFunctionCalling === true, supportsWebSearch: capabilities.supportsWebSearch === true,
    supportsE2EE: capabilities.supportsE2EE === true, supportsVideoInput: capabilities.supportsVideoInput === true,
    supportsAudioInput: capabilities.supportsAudioInput === true
  };
}
/** @param {unknown} value @returns {Record<string,string>} */
export function asStringMap(value) {
  return isRecord(value) ? Object.fromEntries(Object.entries(value).filter((e) => typeof e[1] === "string")) : {};
}
/** @param {ModelInfo[]} models @param {Record<string,string>} traits */
export function selectDefaultModelId(models, traits) {
  const preferred = traits.default;
  if (preferred && models.some((model) => model.id === preferred && !model.deprecated)) return preferred;
  return models.find((model) => !model.deprecated)?.id ?? models[0]?.id ?? "";
}
/** @param {string} requestedId @param {ModelInfo[]} models @param {Record<string,string>} mapping */
export function resolveVeniceModelId(requestedId, models, mapping) {
  if (models.some((model) => model.id === requestedId)) return requestedId;
  const mapped = mapping[requestedId];
  return mapped && models.some((model) => model.id === mapped) ? mapped : null;
}
