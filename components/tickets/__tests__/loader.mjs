import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase/server") {
    return {
      url: "data:text/javascript,export async function createClient() { throw new Error('Real client should not be called in unit test'); }",
      shortCircuit: true,
    };
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentUrl = context.parentURL;
    if (parentUrl) {
      const candidateUrl = new URL(specifier, parentUrl);
      const filePath = fileURLToPath(candidateUrl);
      if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".ts")) {
        return {
          url: candidateUrl.href + ".ts",
          shortCircuit: true,
        };
      }
    }
  }

  return nextResolve(specifier, context);
}
