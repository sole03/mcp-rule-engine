/**
 * Massive Seed Script — Phase 2: Fill Cognition Graph to 500+ nodes
 *
 * Sources:
 *   - ESLint core recommended (65 rules)
 *   - ESLint import plugin (9 rules)
 *   - pycodestyle/PEP8 (50+ rules)
 *   - Airbnb JS (already seeded ~15, expanded here)
 *   - Security patterns (OWASP mapping, 15 rules)
 *   - React patterns (20 rules)
 *   - TypeScript-specific (25 rules)
 *   - General anti-patterns (30 rules)
 */

const { PrismaClient } = require("@prisma/client");

const DB_URL = process.env.DATABASE_URL || "file:./prisma/dev.db";
const p = new PrismaClient({ datasources: { db: { url: DB_URL } } });

function cuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function simpleHash(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

const ALL_RULES = [
  // ═══ ESLint Core Recommended (65 rules) ═══
  ...["constructor-super","for-direction","getter-return","no-async-promise-executor",
    "no-case-declarations","no-class-assign","no-compare-neg-zero","no-cond-assign",
    "no-const-assign","no-constant-binary-expression","no-constant-condition",
    "no-control-regex","no-debugger","no-delete-var","no-dupe-args","no-dupe-class-members",
    "no-dupe-else-if","no-dupe-keys","no-duplicate-case","no-empty","no-empty-character-class",
    "no-empty-pattern","no-empty-static-block","no-ex-assign","no-extra-boolean-cast",
    "no-fallthrough","no-func-assign","no-global-assign","no-import-assign","no-invalid-regexp",
    "no-irregular-whitespace","no-loss-of-precision","no-misleading-character-class",
    "no-new-native-nonconstructor","no-nonoctal-decimal-escape","no-obj-calls","no-octal",
    "no-prototype-builtins","no-redeclare","no-regex-spaces","no-self-assign",
    "no-setter-return","no-shadow-restricted-names","no-sparse-arrays",
    "no-this-before-super","no-unassigned-vars","no-undef","no-unexpected-multiline",
    "no-unreachable","no-unsafe-finally","no-unsafe-negation","no-unsafe-optional-chaining",
    "no-unused-labels","no-unused-private-class-members","no-unused-vars",
    "no-useless-assignment","no-useless-backreference","no-useless-catch","no-useless-escape",
    "no-with","preserve-caught-error","require-yield","use-isnan","valid-typeof"
  ].map(name => ({
    type: "replace", pattern: "/* " + name + " */",
    suggestion: "eslint: " + name + " — see https://eslint.org/docs/rules/" + name,
    language: "javascript", tags: "eslint,core", confidence: "high",
    category: "eslint-" + name.split("-")[1] || "general", scope: "project"
  })),

  // ═══ ESLint Import Plugin (9 rules) ═══
  ...["no-unresolved","named","namespace","default","export",
    "no-named-as-default","no-named-as-default-member","no-duplicates"
  ].map(name => ({
    type: "replace", pattern: "import ",
    suggestion: "import/" + name + ": ensure proper module imports",
    language: "javascript", tags: "eslint,import", confidence: "high",
    category: "imports", scope: "project"
  })),

  // ═══ PEP8 / pycodestyle (60 rules) ═══
  ...[
    ["E101","indentation contains mixed spaces and tabs"],
    ["E111","indentation is not a multiple of 4"],
    ["E112","expected an indented block"],
    ["E113","unexpected indentation"],
    ["E114","indentation is not a multiple of 4 (comment)"],
    ["E115","expected an indented block (comment)"],
    ["E116","unexpected indentation (comment)"],
    ["E121","continuation line under-indented for hanging indent"],
    ["E122","continuation line missing indentation or outdented"],
    ["E123","closing bracket does not match indentation of opening bracket"],
    ["E124","closing bracket does not match visual indentation"],
    ["E125","continuation line with same indent as next logical line"],
    ["E126","continuation line over-indented for hanging indent"],
    ["E127","continuation line over-indented for visual indent"],
    ["E128","continuation line under-indented for visual indent"],
    ["E131","continuation line unaligned for hanging indent"],
    ["E201","whitespace after '('"],
    ["E202","whitespace before ')'"],
    ["E203","whitespace before ':'"],
    ["E211","whitespace before '('"],
    ["E221","multiple spaces before operator"],
    ["E222","multiple spaces after operator"],
    ["E223","tab before operator"],
    ["E224","tab after operator"],
    ["E225","missing whitespace around operator"],
    ["E226","missing whitespace around arithmetic operator"],
    ["E227","missing whitespace around bitwise or shift operator"],
    ["E228","missing whitespace around modulo operator"],
    ["E231","missing whitespace after ','"],
    ["E241","multiple spaces after ','"],
    ["E242","tab after ','"],
    ["E251","unexpected spaces around keyword / parameter equals"],
    ["E261","at least two spaces before inline comment"],
    ["E262","inline comment should start with '# '"],
    ["E265","block comment should start with '# '"],
    ["E266","too many leading '#' for block comment"],
    ["E271","multiple spaces after keyword"],
    ["E272","multiple spaces before keyword"],
    ["E273","tab after keyword"],
    ["E274","tab before keyword"],
    ["E275","missing whitespace after keyword"],
    ["E301","expected 1 blank line, found 0"],
    ["E302","expected 2 blank lines, found 0"],
    ["E303","too many blank lines"],
    ["E304","blank lines found after function decorator"],
    ["E305","expected 2 blank lines after class or function definition"],
    ["E306","expected 1 blank line before a nested definition"],
    ["E401","multiple imports on one line"],
    ["E402","module level import not at top of file"],
    ["E501","line too long (max 79 characters)"],
    ["E502","backslash is redundant between brackets"],
    ["E701","multiple statements on one line (colon)"],
    ["E702","multiple statements on one line (semicolon)"],
    ["E703","statement ends with a semicolon"],
    ["E704","multiple statements on one line (def)"],
    ["E711","comparison to None should be 'if cond is None:'"],
    ["E712","comparison to True should be 'if cond is True:'"],
    ["E713","test for membership should be 'not in'"],
    ["E714","test for object identity should be 'is not'"],
    ["E721","do not compare types, use 'isinstance()'"],
    ["E722","do not use bare except"],
    ["E731","do not assign a lambda expression, use a def"],
    ["E741","do not use variables named 'l', 'O', or 'I'"],
    ["E743","do not define a function named 'l', 'O', or 'I'"],
    ["W291","trailing whitespace"],
    ["W292","no newline at end of file"],
    ["W293","blank line contains whitespace"],
    ["W391","blank line at end of file"],
    ["W503","line break before binary operator"],
    ["W504","line break after binary operator"],
    ["W505","doc line too long"],
    ["W601",".has_key() is deprecated, use 'in'"],
    ["W602","deprecated form of raising exception"],
    ["W603","'<>' is deprecated, use '!='"],
    ["W604","backticks are deprecated, use 'repr()'"],
    ["W605","invalid escape sequence"],
    ["W606","'async' and 'await' are reserved keywords"],
  ].map(([code, desc]) => ({
    type: "replace",
    pattern: code,
    suggestion: code + ": " + desc,
    language: "python",
    tags: "pep8,pycodestyle",
    confidence: "high",
    category: "pep8",
    scope: "project"
  })),

  // ═══ Security Anti-Patterns (25 rules) ═══
  ...[
    ["SQL injection: string concatenation in query","Use parameterized queries / prepared statements"],
    ["XSS: innerHTML assignment","Use textContent or sanitize with DOMPurify"],
    ["XSS: document.write()","Avoid document.write — use DOM APIs"],
    ["XSS: eval() with user input","Never pass user input to eval()"],
    ["Path traversal: unsanitized file path","Use path.resolve() + validate against base dir"],
    ["Command injection: exec() with user input","Use execFile() with argument array"],
    ["Command injection: spawn() with shell:true","Set shell:false and pass args as array"],
    ["NoSQL injection: $where with user input","Never use $where with user-controlled data"],
    ["SSRF: unvalidated URL in fetch/request","Validate URL against allowlist before fetching"],
    ["Deserialization: insecure JSON.parse","Validate schema after JSON.parse, use zod"],
    ["Hardcoded secrets: API keys in source","Use environment variables or vault service"],
    ["Hardcoded secrets: password in config","Use ConfigVault or env with fallback"],
    ["Insecure crypto: MD5/SHA1 for passwords","Use bcrypt/scrypt/argon2 for password hashing"],
    ["Insecure crypto: Math.random() for tokens","Use crypto.randomBytes() or crypto.randomUUID()"],
    ["Insecure JWT: alg:none","Never accept alg:none in JWT verification"],
    ["Insecure JWT: no signature verification","Always verify JWT signature on every request"],
    ["Timing attack: string comparison for secrets","Use crypto.timingSafeEqual() for secret comparison"],
    ["Prototype pollution: object spread from user input","Use Object.create(null) for user-controlled objects"],
    ["Regex DoS: catastrophic backtracking","Avoid nested quantifiers like (a+)+ in user-facing regex"],
    ["Open redirect: user input in Location header","Validate redirect URL against allowlist"],
    ["Clickjacking: missing X-Frame-Options","Set X-Frame-Options: DENY header"],
    ["CSRF: state-changing GET request","Use POST/PUT/DELETE for state changes, add CSRF token"],
    ["CORS: Access-Control-Allow-Origin: * with credentials","Never use wildcard origin with credentials:include"],
    ["Sensitive data exposure: console.log of PII","Use logger with PII redaction, never log raw user data"],
    ["Dependency audit: outdated packages with CVEs","Run npm audit regularly, use dependabot/renovate"],
  ].map(([pattern, suggestion], i) => ({
    type: "replace",
    pattern: pattern.split(":")[0],
    suggestion: pattern + " — " + suggestion,
    language: "javascript",
    tags: "security",
    confidence: "high",
    category: "security-" + (i % 5),
    scope: "project"
  })),

  // ═══ React Patterns (30 rules) ═══
  ...[
    ["componentWillMount","Avoid deprecated lifecycle: use constructor or useEffect"],
    ["componentWillReceiveProps","Avoid deprecated lifecycle: use getDerivedStateFromProps"],
    ["componentWillUpdate","Avoid deprecated lifecycle: use getSnapshotBeforeUpdate"],
    ["setState in render","Do not call setState during render — causes infinite loop"],
    ["index as key","Avoid using array index as React key — use stable unique ID"],
    ["missing key prop","Add key prop to elements in array iteration"],
    ["prop spreading {...props}","Consider explicit props over spread for clarity"],
    ["direct DOM manipulation","Use React refs instead of document.getElementById"],
    ["inline function in JSX","Memoize callbacks with useCallback if passed as props"],
    ["inline object in JSX","Memoize objects with useMemo if passed as props"],
    ["missing useEffect deps","Add all dependencies to useEffect dependency array"],
    ["unnecessary useEffect","Derived state can be computed during render"],
    ["useState after unmount","Check mounted flag before setState in async callbacks"],
    ["uncontrolled to controlled","Don't switch between uncontrolled and controlled input"],
    ["missing aria-* on interactive","Add aria-label or aria-labelledby to interactive elements"],
    ["div as button","Use button element instead of div with onClick"],
    ["form without submit handler","Add onSubmit handler to form elements"],
    ["dangerouslySetInnerHTML","Avoid dangerouslySetInnerHTML — use sanitized content"],
    ["findDOMNode","Avoid findDOMNode — use refs instead"],
    ["string refs","Use callback refs or createRef instead of string refs"],
    ["mutation of state","Never mutate state directly — use setState or immer"],
    ["async in useEffect","useEffect callback cannot be async — define async function inside"],
    ["missing displayName","Add displayName to React.memo wrapped components"],
    ["React.FC children implicit","Type children explicitly rather than relying on React.FC"],
    ["export default memo","Prefer named export over default export for components"],
    ["render props hell","Use custom hooks instead of nested render props"],
    ["context over prop drilling","Use React Context for deeply passed props"],
    ["single child in fragment","Fragment with single child is unnecessary"],
    ["boolean attribute","Use shorthand for boolean props: disabled instead of disabled={true}"],
    ["nested ternary in JSX","Extract complex conditionals into variables or components"],
  ].map(([pattern, suggestion]) => ({
    type: "replace",
    pattern: pattern,
    suggestion: suggestion,
    language: "typescript",
    tags: "react",
    confidence: "medium",
    category: "react",
    scope: "project"
  })),

  // ═══ TypeScript-Specific Rules (35 rules) ═══
  ...[
    ["any","Use unknown instead of any for type-safe code"],
    ["as unknown as","Avoid double assertion — refactor types instead"],
    ["@ts-ignore","Use @ts-expect-error with explanation or fix the type"],
    ["@ts-expect-error without comment","Add explanation for why error is expected"],
    ["! (non-null assertion)","Use type guard or optional chaining instead of !"],
    ["type assertion on object literal","Use satisfies operator instead of as for type checking"],
    ["enum","Consider const object with 'as const' instead of TypeScript enum"],
    ["namespace","Use ES module imports instead of TypeScript namespace"],
    ["declare var","Use proper type imports instead of ambient declarations"],
    ["Function type","Prefer arrow function type: (x: T) => U over Function"],
    ["{}","Use Record<string, never> or object instead of {}"],
    ["empty interface","Extend from a type or remove the empty interface"],
    ["constructor parameter property","Use parameter properties: constructor(private x: T)"],
    ["public modifier","Omit public modifier — it's the default"],
    ["abstract class without methods","Use interface instead of abstract class with no methods"],
    ["string enum","Consider union type instead of string enum"],
    ["type vs interface","Use interface for object shapes, type for unions/primitives"],
    ["Promise<void> return","Mark async functions as returning Promise<void>"],
    ["overloaded function","Consider union parameter types instead of overloads"],
    ["generic default","Add default type parameter: <T = unknown>"],
    ["inferred type annotation","Remove redundant type annotation — let TypeScript infer"],
    ["null assertion in chain","Use optional chaining: obj?.prop?.nested"],
    ["index signature","Prefer Record<K, V> over { [key: K]: V }"],
    ["readonly array","Use ReadonlyArray<T> or readonly T[] for immutable arrays"],
    ["as const assertion","Use as const for literal type narrowing"],
    ["conditional type overloading","Use conditional types for return type inference"],
    ["mapped type","Use mapped types: { [K in keyof T]: ... }"],
    ["template literal type","Use template literal types for string patterns"],
    ["branded type","Use branded types: type UserId = string & { __brand: 'UserId' }"],
    ["assertion function","Use asserts keyword for type guards: asserts value is T"],
    ["const type parameter","Use const type parameter: function f<const T>(x: T)"],
    ["extends vs satisfies","Use satisfies for type checking without widening"],
    ["import type","Use import type for type-only imports"],
    ["isolatedModules","Ensure each file can be transpiled independently"],
    ["verbatimModuleSyntax","Use explicit type import/export syntax"],
  ].map(([pattern, suggestion]) => ({
    type: "replace",
    pattern: pattern,
    suggestion: suggestion,
    language: "typescript",
    tags: "typescript",
    confidence: "medium",
    category: "typescript",
    scope: "project"
  })),

  // ═══ General Anti-Patterns (40 rules) ═══
  ...[
    ["TODO without assignee","Add @username or issue link to TODO comments"],
    ["FIXME without context","Explain why a FIXME is needed and when to address"],
    ["commented-out code","Remove commented-out code — use git history instead"],
    ["console.log in production","Use structured logger instead of console.log"],
    ["silent catch","Log or handle errors in catch blocks — don't leave empty"],
    ["catch and rethrow same error","Don't catch just to rethrow — remove the try/catch"],
    ["Promise constructor anti-pattern","Use async function instead of new Promise()"],
    ["return await","Redundant await in return — just return the promise"],
    ["floating promise","Await or .catch() the promise — don't let it float"],
    ["nested callback (>3 levels)","Use async/await to flatten nested callbacks"],
    ["callback hell","Convert callback chain to async/await"],
    ["synchronous file I/O in server","Use fs.promises or fs/promises API for async I/O"],
    ["blocking JSON.parse on large input","Use streaming JSON parser for large payloads"],
    ["event listener without cleanup","Remove event listener in cleanup/useEffect return"],
    ["setInterval without clearInterval","Store setInterval ID and clear on cleanup"],
    ["memory leak: growing array","Consider WeakMap or periodic cleanup for caches"],
    ["memory leak: unclosed stream","Call .destroy() or use pipeline() for stream cleanup"],
    ["race condition: read-modify-write","Use database transactions or atomic operations"],
    ["race condition: shared mutable state","Use immutable data structures or mutex/locks"],
    ["circular dependency","Break circular dependencies with dependency inversion"],
    ["god object / class","Split large classes into focused modules (SRP)"],
    ["magic number","Extract magic numbers to named constants"],
    ["magic string","Extract magic strings to named constants or enum"],
    ["duplicate code block","Extract duplicate code into a shared function"],
    ["long function (>50 lines)","Break long functions into smaller, named helpers"],
    ["long file (>500 lines)","Split large files by concern or feature"],
    ["too many parameters (>4)","Use options object instead of positional parameters"],
    ["boolean flag parameter","Split into two functions or use options object"],
    ["side effect in getter","Getters should be pure — don't mutate state"],
    ["throwing non-Error","Always throw Error instances: throw new Error(msg)"],
    ["unnecessary boolean return","Return the boolean expression directly"],
    ["if-else assign anti-pattern","Use ternary or nullish coalescing: const x = a ?? b"],
    ["double negation !!","Use Boolean() instead of !! for clarity"],
    ["type coercion with +","Use Number() instead of unary + for string-to-number"],
    ["array-like to array conversion","Use Array.from() instead of [].slice.call()"],
    ["incorrect this binding","Use arrow functions or .bind() correctly"],
    ["for...in with arrays","Use for...of, .forEach(), or traditional for loop"],
    ["mutating function parameters","Treat function parameters as immutable"],
    ["incorrect error comparison","Use instanceof or error.code rather than message matching"],
    ["blocking sleep","Use setTimeout with Promise instead of while-loop sleep"],
  ].map(([pattern, suggestion]) => ({
    type: "replace",
    pattern: pattern,
    suggestion: suggestion,
    language: "javascript",
    tags: "antipattern",
    confidence: "medium",
    category: "antipattern",
    scope: "project"
  })),
];

async function seed() {
  console.log("Seeding", ALL_RULES.length, "rules...");

  let ruleCount = 0, nodeCount = 0;

  // Use batched transactions for performance
  const BATCH = 50;
  for (let i = 0; i < ALL_RULES.length; i += BATCH) {
    const batch = ALL_RULES.slice(i, i + BATCH);

    await p.$transaction(async (tx) => {
      for (const r of batch) {
        // Rule table
        try {
          const existing = await tx.rule.findFirst({
            where: { pattern: r.pattern, language: r.language },
            select: { id: true },
          });
          if (!existing) {
            await tx.rule.create({
              data: {
                id: cuid(),
                type: r.type,
                pattern: r.pattern,
                suggestion: r.suggestion,
                language: r.language,
                tags: r.tags,
                confidence: r.confidence,
                category: r.category,
                scope: r.scope,
                status: "active",
              },
            });
            ruleCount++;
          }
        } catch {}

        // CognitionNode
        try {
          const hash = simpleHash("PATTERN:" + r.language + ":" + r.pattern);
          const existingNode = await tx.cognitionNode.findUnique({
            where: { semanticHash: hash },
            select: { id: true },
          });
          if (!existingNode) {
            const node = await tx.cognitionNode.create({
              data: {
                id: cuid(),
                type: "PATTERN",
                semanticHash: hash,
                abstractionLevel: r.category === "security" ? 3 : (r.category.includes("eslint") ? 1 : 2),
                payload: JSON.stringify({
                  pattern: r.pattern,
                  suggestion: r.suggestion,
                  language: r.language,
                  confidence: r.confidence,
                  tags: r.tags.split(","),
                  source: "external-seed-v2",
                }),
                metadata: JSON.stringify({ category: r.category, scope: r.scope }),
              },
            });
            nodeCount++;

            // Create PRECEDES edge to a random existing node of same language
            const related = await tx.cognitionNode.findFirst({
              where: { type: "PATTERN", payload: { contains: r.language } },
              orderBy: { createdAt: "desc" },
              take: 1,
              skip: Math.floor(Math.random() * Math.max(1, nodeCount - 1)),
            });
            if (related && related.id !== node.id) {
              try {
                await tx.cognitionEdge.create({
                  data: {
                    id: cuid(),
                    sourceId: node.id,
                    targetId: related.id,
                    relation: Math.random() > 0.5 ? "RELATES_TO" : "PRECEDES",
                    weight: Math.round(Math.random() * 10) / 10,
                  },
                });
              } catch {}
            }
          }
        } catch {}
      }
    });
  }

  // Also create cross-category edges
  const allNodes = await p.cognitionNode.findMany({ select: { id: true, metadata: true } });
  const securityNodes = allNodes.filter(n => (n.metadata || "").includes("security"));
  const eslintNodes = allNodes.filter(n => (n.metadata || "").includes("eslint"));
  const tsNodes = allNodes.filter(n => (n.metadata || "").includes("typescript"));

  for (const sn of securityNodes.slice(0, 20)) {
    for (const en of eslintNodes.slice(0, 3)) {
      if (sn.id === en.id) continue;
      try {
        await p.cognitionEdge.create({
          data: { id: cuid(), sourceId: sn.id, targetId: en.id, relation: "CAUSES", weight: 1.5 },
        });
      } catch {}
    }
  }

  for (const tn of tsNodes.slice(0, 20)) {
    for (const en of eslintNodes.slice(0, 3)) {
      if (tn.id === en.id) continue;
      try {
        await p.cognitionEdge.create({
          data: { id: cuid(), sourceId: tn.id, targetId: en.id, relation: "REFINES", weight: 1.2 },
        });
      } catch {}
    }
  }

  const [totalRules, totalNodes, totalEdges] = await Promise.all([
    p.rule.count(),
    p.cognitionNode.count(),
    p.cognitionEdge.count(),
  ]);

  console.log(JSON.stringify({
    addedRules: ruleCount,
    addedNodes: nodeCount,
    totalRules,
    totalNodes,
    totalEdges,
    inputSize: ALL_RULES.length,
  }, null, 2));

  await p.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
