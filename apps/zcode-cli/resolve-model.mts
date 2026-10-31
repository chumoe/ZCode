import { parseZCodeBuiltinModelConfigRules } from "packages/adapters/node_modules/@zcode/provider/dist/config/schema.js";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("packages/cli/dist/provider/zcode-builtin.json", "utf8"));
const rules = parseZCodeBuiltinModelConfigRules(data.config);

const cases = [
  { providerId: "bigmodel", modelId: "glm-4.6", apiType: "openai-chat-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { providerId: "zai", modelId: "glm-4.6", apiType: "openai-chat-completions", baseUrl: "https://api.z.ai/api/paas/v4" },
  { providerId: "zai", modelId: "deepseek-v4-flash", apiType: "openai-chat-completions", baseUrl: "https://api.deepseek.com" },
];

for (const c of cases) {
  const resolved = rules.resolve(c);
  const rl = resolved.toJSON()?.optionSpecs?.reasoningLevel;
  console.log(`\n=== ${c.providerId}/${c.modelId}`);
  console.log("values:", JSON.stringify(rl?.values));
  console.log("map:", rl?.map);
}
