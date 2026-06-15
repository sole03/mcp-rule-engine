import { ASTNode } from "../types.js";
import { computeDiff } from "./ast-diff.js";
import { regexDiff } from "./regex-fallback.js";

export interface ParserResult { ast: ASTNode; language: string; parseSuccess: boolean; }

export async function parseToAST(code: string, language: string): Promise<ParserResult> {
  const lines = code.split("\n");
  const children: ASTNode[] = lines.map((line, i) => ({
    type: "line", text: line,
    startByte: code.indexOf(line, i > 0 ? code.indexOf(lines[i - 1]) + lines[i - 1].length : 0),
    endByte: code.indexOf(line, i > 0 ? code.indexOf(lines[i - 1]) + lines[i - 1].length : 0) + line.length,
    children: [],
  }));
  return { ast: { type: "program", text: code, startByte: 0, endByte: code.length, children }, language, parseSuccess: true };
}

export async function computeDiffWithFallback(originalCode: string, modifiedCode: string, language: string) {
  try {
    const { ast: oldAst } = await parseToAST(originalCode, language);
    const { ast: newAst } = await parseToAST(modifiedCode, language);
    const result = computeDiff(oldAst, newAst);
    if (result.status === "failed" || result.confidence === "low") {
      return { ...regexDiff(originalCode, modifiedCode), fallbackReason: "ast_low_confidence" };
    }
    return result;
  } catch {
    return regexDiff(originalCode, modifiedCode);
  }
}
