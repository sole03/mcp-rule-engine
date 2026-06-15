import { fileURLToPath } from "node:url";
import path from "node:path";
import { ASTNode, AtomicOp, DiffResult } from "../types.js";
import { computeDiff } from "./ast-diff.js";
import { regexDiff } from "./regex-fallback.js";

// ── Path Resolution ──────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const WASM_PATHS: Record<string, string> = {
  javascript: path.join(projectRoot, "node_modules", "tree-sitter-javascript", "tree-sitter-javascript.wasm"),
  typescript: path.join(projectRoot, "node_modules", "tree-sitter-typescript", "tree-sitter-typescript.wasm"),
  tsx:        path.join(projectRoot, "node_modules", "tree-sitter-typescript", "tree-sitter-tsx.wasm"),
  python:     path.join(projectRoot, "node_modules", "tree-sitter-python", "tree-sitter-python.wasm"),
};

function getLanguageForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx") return "tsx";
  if (ext === ".ts") return "typescript";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".py") return "python";
  return "javascript"; // default fallback
}

// ── Tree-sitter WASM Initialization ──────────────────────────
let tsInitialized = false;
let tsFailed = false;
const grammarCache = new Map<string, any>();
let ParserModule: any = null;

async function ensureTreeSitter(): Promise<boolean> {
  if (tsInitialized) return true;
  if (tsFailed) return false;
  try {
    ParserModule = await import("web-tree-sitter");
    await ParserModule.Parser.init();
    tsInitialized = true;
    return true;
  } catch (err) {
    tsFailed = true;
    console.error("[parsers] web-tree-sitter init failed:", err);
    return false;
  }
}

async function loadGrammar(language: string): Promise<any> {
  if (grammarCache.has(language)) return grammarCache.get(language);
  const wasmPath = WASM_PATHS[language];
  if (!wasmPath) throw new Error(`No WASM path for language: ${language}`);

  const fs = await import("node:fs");
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }

  const lang = await ParserModule.Language.load(wasmPath);
  grammarCache.set(language, lang);
  return lang;
}

// ── Tree-sitter → ASTNode Conversion ────────────────────────
function treeSitterToAST(node: any): ASTNode {
  return {
    type: node.type,
    text: node.text,
    startByte: node.startIndex,
    endByte: node.endIndex,
    children: node.namedChildren.map((c: any) => treeSitterToAST(c)),
  };
}

// ── Public API ───────────────────────────────────────────────

export interface ParserResult {
  ast: ASTNode;
  language: string;
  parseSuccess: boolean;
}

/** Parse code to AST using web-tree-sitter, falling back to line-based AST on failure. */
export async function parseToAST(code: string, languageOrPath: string): Promise<ParserResult> {
  const lang = languageOrPath.includes(".") ? getLanguageForFile(languageOrPath) : languageOrPath;

  // Try tree-sitter WASM first
  const available = await ensureTreeSitter();
  if (available) {
    try {
      const grammar = await loadGrammar(lang);
      const parser = new ParserModule.Parser();
      parser.setLanguage(grammar);
      const tree = parser.parse(code);
      const ast = treeSitterToAST(tree.rootNode);
      return { ast, language: lang, parseSuccess: true };
    } catch (err) {
      // Fall through to line-based fallback
    }
  }

  // Fallback: line-based AST
  const lines = code.split("\n");
  const children: ASTNode[] = lines.map((line, i) => {
    const idx = code.indexOf(line, i > 0 ? code.indexOf(lines[i - 1]) + lines[i - 1].length : 0);
    return { type: "line", text: line, startByte: idx >= 0 ? idx : 0, endByte: idx >= 0 ? idx + line.length : line.length, children: [] };
  });
  const ast: ASTNode = { type: "program", text: code, startByte: 0, endByte: code.length, children };
  return { ast, language: lang, parseSuccess: false };
}

/** Compute diff with automatic AST → regex fallback chain. */
export async function computeDiffWithFallback(originalCode: string, modifiedCode: string, languageOrPath: string) {
  try {
    const { ast: oldAst } = await parseToAST(originalCode, languageOrPath);
    const { ast: newAst } = await parseToAST(modifiedCode, languageOrPath);
    const result = computeDiff(oldAst, newAst);
    if (result.status === "failed" || result.confidence === "low") {
      return { ...regexDiff(originalCode, modifiedCode), fallbackReason: "ast_low_confidence" };
    }
    return result;
  } catch {
    return regexDiff(originalCode, modifiedCode);
  }
}
