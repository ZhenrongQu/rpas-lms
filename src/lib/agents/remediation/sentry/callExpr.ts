import ts from "typescript";

/** Strip a single ```lang … ``` markdown fence if the model wrapped its output in one. */
function stripFence(text: string): string {
  const m = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : text).trim();
}

function isLiteralArg(n: ts.Node): boolean {
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return true;
  if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword) return true;
  // Allow a negative numeric literal (e.g. -1).
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return true;
  if (ts.isArrayLiteralExpression(n)) return n.elements.every(isLiteralArg);
  if (ts.isObjectLiteralExpression(n)) {
    return n.properties.every((p) => ts.isPropertyAssignment(p) && isLiteralArg(p.initializer));
  }
  return false;
}

/**
 * Accept the LLM's output ONLY if it is exactly one CallExpression whose callee is the
 * identifier `fnName` and whose arguments are literals / array-literals / object-literals
 * (recursive). Returns the normalized call text, or null. Bounds the synthesized body to a
 * pure, side-effect-free literal call — no identifiers, member access, nested calls, imports.
 */
export function validateCallExpression(text: string, fnName: string): string | null {
  const code = stripFence(text).replace(/;\s*$/, "");
  const sf = ts.createSourceFile("call.ts", code, ts.ScriptTarget.Latest, false);
  if (sf.statements.length !== 1) return null;
  const stmt = sf.statements[0]!;
  if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return null;
  const call = stmt.expression;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== fnName) return null;
  if (!call.arguments.every(isLiteralArg)) return null;
  return code;
}
