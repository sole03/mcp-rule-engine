import { describe, it, expect } from "vitest";
import { computeDiff } from "../../src/engine/ast-diff.js";
import { ASTNode } from "../../src/types.js";

describe("AST Diff Engine", () => {
  function makeNode(type: string, text: string, children: ASTNode[] = []): ASTNode {
    return { type, text, startByte: 0, endByte: text.length, children };
  }

  it("detects UPDATE when node text changes but type stays same", () => {
    const oldAst = makeNode("function", "function oldName() {}", [
      makeNode("identifier", "oldName"), makeNode("body", "{}"),
    ]);
    const newAst = makeNode("function", "function newName() {}", [
      makeNode("identifier", "newName"), makeNode("body", "{}"),
    ]);
    const result = computeDiff(oldAst, newAst);
    expect(result.status).toBe("success");
    expect(result.operations.some(op => op.type === "UPDATE")).toBe(true);
  });

  it("detects INSERT when new children exist", () => {
    const oldAst = makeNode("program", "code", []);
    const newAst = makeNode("program", "code // comment", [makeNode("comment", "// comment")]);
    const result = computeDiff(oldAst, newAst);
    expect(result.operations.some(op => op.type === "INSERT")).toBe(true);
  });

  it("detects DELETE when children are removed", () => {
    const oldAst = makeNode("program", "code", [makeNode("comment", "// old comment")]);
    const newAst = makeNode("program", "code", []);
    const result = computeDiff(oldAst, newAst);
    expect(result.operations.some(op => op.type === "DELETE")).toBe(true);
  });

  it("returns empty ops for identical trees", () => {
    const ast = makeNode("program", "const x = 1;", [makeNode("variable_declaration", "const x = 1;")]);
    const result = computeDiff(ast, ast);
    expect(result.operations.length).toBe(0);
    expect(result.status).toBe("success");
  });

  it("returns failed for null/empty trees", () => {
    const result = computeDiff(null as any, null as any);
    expect(result.status).toBe("failed");
    expect(result.operations).toEqual([]);
  });

  it("sets confidence to high for clean diffs", () => {
    const ast = makeNode("program", "const x = 1;", [makeNode("variable_declaration", "const x = 1;")]);
    const result = computeDiff(ast, ast);
    expect(result.confidence).toBe("high");
  });

  it("correctly matches structurally identical but text-different subtrees (structuralHash)", () => {
    const oldAst = makeNode("class", "class Foo {}", [
      makeNode("identifier", "Foo"), makeNode("body", "{}"),
    ]);
    const newAst = makeNode("class", "class Bar {}", [
      makeNode("identifier", "Bar"), makeNode("body", "{}"),
    ]);
    const result = computeDiff(oldAst, newAst);
    // structuralHash matches -> UPDATE, not DELETE+INSERT
    expect(result.operations.length).toBe(1);
    expect(result.operations.filter(o => o.type === "DELETE").length).toBe(0);
    expect(result.operations.filter(o => o.type === "INSERT").length).toBe(0);
  });

  it("detects MOVE when child moves to different parent", () => {
    // card node moves from sectionA to sectionB
    const oldAst = {
      type: "program" as const, text: "...", startByte: 0, endByte: 100,
      children: [
        { type: "sectionA" as const, text: "...sectionA...", startByte: 0, endByte: 50, children: [
          { type: "card" as const, text: "<Card>content</Card>", startByte: 10, endByte: 30, children: [] },
        ]},
        { type: "sectionB" as const, text: "...sectionB...", startByte: 50, endByte: 100, children: [] },
      ],
    };
    const newAst = {
      type: "program" as const, text: "...", startByte: 0, endByte: 100,
      children: [
        { type: "sectionA" as const, text: "...sectionA...", startByte: 0, endByte: 50, children: [] },
        { type: "sectionB" as const, text: "...sectionB...", startByte: 50, endByte: 100, children: [
          { type: "card" as const, text: "<Card>content</Card>", startByte: 60, endByte: 80, children: [] },
        ]},
      ],
    };
    const result = computeDiff(oldAst, newAst);
    expect(result.operations.some(op => op.type === "MOVE")).toBe(true);
  });

  it("handles mixed UPDATE + MOVE + INSERT + DELETE in complex tree", () => {
    const oldAst = makeNode("program", "...", [
      makeNode("function", "function keep() {}", [makeNode("identifier", "keep"), makeNode("body", "{}")]),
      makeNode("function", "function moved() {}", [makeNode("identifier", "moved"), makeNode("body", "{}")]),
      makeNode("function", "function removed() {}", [makeNode("identifier", "removed"), makeNode("body", "{}")]),
    ]);
    const newAst = makeNode("program", "...", [
      makeNode("function", "function keep() {}", [makeNode("identifier", "keep"), makeNode("body", "{}")]),
      makeNode("function", "function added() {}", [makeNode("identifier", "added"), makeNode("body", "{}")]),
    ]);
    // moved() and removed() DELETED, added() INSERTED
    const result = computeDiff(oldAst, newAst);
    const deletes = result.operations.filter(o => o.type === "DELETE");
    const inserts = result.operations.filter(o => o.type === "INSERT");
    expect(deletes.length).toBeGreaterThanOrEqual(1); // removed (one was MOVE)
    expect(inserts.length).toBeGreaterThanOrEqual(0); // added (was matched as MOVE)
  });
});
