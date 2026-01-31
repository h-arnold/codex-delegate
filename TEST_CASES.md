# TEST CASES for codex-delegate

This document enumerates comprehensive test cases to validate the behavior of the codex-delegate tool. Tests are grouped by module and include positive, negative, and edge cases. Mocks and test patterns are suggested where needed.

---

## Table of Contents

- CLI Parsing and Helpers
- Prompt Templates
- Option Validation
- Schema Resolution
- Stream Handling and Event Processing
- Streaming Guards & Handlers
- Logging and Output Helpers
- Runner (`run` / `main`) Behavior
- Integration / End-to-End Scenarios

---

## Conventions

- "Input" refers to function args, CLI tokens or synthetic streams used in tests.
- "Expected" is the expected return/side-effect.
- Where process.exit is expected (e.g., `--help`) test should capture the behavior using a stub of `process.exit` or by invoking the helper directly.
- For async streams, use async generator helpers to emit events.

---

## CLI Parsing and Helpers

1. CLI-01: parse boolean flag with explicit true - implemented (tests/cli-parsing.test.ts)
   - Input: ['--verbose','true']
   - Expected: options.verbose === true

2. CLI-02: parse boolean flag with explicit false - implemented (tests/cli-parsing.test.ts)
   - Input: ['--verbose','false']
   - Expected: options.verbose === false

3. CLI-03: parse boolean flag with no explicit value (flag only) - implemented (tests/cli-parsing.test.ts)
   - Input: ['--verbose']
   - Expected: options.verbose === true

4. CLI-04: parse unknown option is ignored - implemented (tests/cli-parsing.test.ts)
   - Input: ['--nope','value']
   - Expected: No crash; returned options equals defaults with no 'nope'

5. CLI-05: parse numeric integer (`--max-items`) - implemented (tests/cli-parsing.test.ts)
   - Input: ['--max-items','5']
   - Expected: options.maxItems === 5

6. CLI-06: parse numeric float (`--timeout-minutes`) - implemented (tests/cli-parsing.test.ts)
   - Input: ['--timeout-minutes','2.5']
   - Expected: options.timeoutMinutes === 2.5

7. CLI-07: invalid numeric ignored (NaN) - implemented (tests/cli-parsing.test.ts)
   - Input: ['--max-items','abc']
   - Expected: options.maxItems is undefined or default not changed

8. CLI-08: immediate flag `--help` prints and exits - implemented (tests/cli-parsing.test.ts)
   - Input: ['--help']
   - Expected: `printHelp` invoked; process.exit called with 0 (capture via stub)

9. CLI-09: immediate flag `--list-roles` prints roles and exits - implemented (tests/cli-parsing.test.ts)
   - Input: ['--list-roles'] with sample prompts present
   - Expected: Available roles listed and process.exit called with 0

10. CLI-10: combined options parse correctly - implemented (tests/cli-parsing.test.ts)
    - Input: ['--role','review','--task','Fix bug','--structured']
    - Expected: options.role === 'review', options.task === 'Fix bug', options.structured === true

11. CLI-11: isOption recognizes only prefixed, known aliases - implemented (tests/cli-parsing.test.ts)
    - Input: '--role', '--unknown' -> isOption('--role') true, isOption('--unknown') false

12. CLI-12: applyBooleanOption consumes tokens correctly - implemented (tests/cli-parsing.test.ts)
    - Scenario: Flag followed by another option token
    - Input: applyBooleanOption(options,'verbose','--role')
    - Expected: sets verbose=true and returns 1 consumed token

13. CLI-13: parseBoolean returns undefined for non-boolean inputs - implemented (tests/cli-parsing.test.ts)

- Input: parseBoolean('yes')
- Expected: === undefined

1. CLI-14: isOption returns false for undefined or short/invalid tokens - implemented (tests/cli-parsing.test.ts)

- Input: undefined, '-h', 'role'
- Expected: isOption returns false for each

1. CLI-15: isBooleanOption returns false for non-boolean keys - implemented (tests/cli-parsing.test.ts)

- Input: 'task'
- Expected: isBooleanOption('task') === false

1. CLI-16: applyBooleanOption consumes 2 tokens for explicit booleans - implemented (tests/cli-parsing.test.ts)

- Input: applyBooleanOption(options,'verbose','false')
- Expected: sets verbose=false and returns 2

1. CLI-17: repeated options - last occurrence wins - implemented (tests/cli-parsing.test.ts)

- Input: ['--max-items','1','--max-items','3']
- Expected: options.maxItems === 3

---

## ISSUES FOUND (CODE) - CLI Parsing and Helpers

1. Missing JSDoc comments in production files
   - Path: `src/codex-delegate.ts` (top-level helper functions) and `src/common/file-utils.ts`
   - Location: near file header / function declarations (e.g., `getCurrentDirname`)
   - Description: The project's ESLint configuration requires JSDoc comments on functions; several production functions are missing `@returns` and general JSDoc blocks. These surfaced when running `npm run lint` while implementing tests.
   - Suggested fix: Add appropriate JSDoc comments (including `@returns`) to the affected functions to satisfy lint rules.

2. Vitest discovery oddity when running the full test suite
   - Path: project root / test runner invocation
   - Location: Running `npm test` / `vitest --run` prints the configured include pattern but reports `No test files found`. Running an individual test file (`npx vitest tests/cli-parsing.test.ts --run`) executes the tests successfully.
   - Description: This may be an environment/runner configuration issue that prevented the default test discovery path from matching test files in this workspace during the initial run. Tests themselves are well-formed and pass when executed directly.
   - Suggested fix: Investigate Vitest discovery behavior (version-specific flags or CLI invocation) in CI and ensure the harness runs tests without specifying file paths (no code change necessary for production behavior).

---

## Prompt Templates

- **Implemented:** `tests/prompt-templates.test.ts`

1. PROMPT-01: resolve existing template returns trimmed contents
   - Setup: create `agent-prompts/implementation.md`
   - Input: resolvePromptTemplate('implementation')
   - Expected: file contents trimmed returned

2. PROMPT-02: resolve missing template returns empty string (ENOENT)
   - Input: resolvePromptTemplate('nonexistent')
   - Expected: ''

3. PROMPT-03: resolve template outside project path -> ''
   - Mock path resolution to a path outside process.cwd()
   - Expected: '' (safety guard)

4. PROMPT-04: listPromptRoles returns sorted base names
   - Setup: multiple `.md` files in `agent-prompts`
   - Expected: sorted array of role names

5. PROMPT-05: listPromptRoles returns [] when directory missing
   - Setup: Remove `agent-prompts` or simulate ENOENT
   - Expected: []

6. PROMPT-06: buildPrompt composes template + instructions + task
   - Input: template present, options.instructions='X', options.task='Y'
   - Expected: Combined string with sections separated by blank lines

7. PROMPT-07: `--list-roles` prints 'No roles available.' and exits when prompts missing/empty
   - Setup: `agent-prompts` missing or empty
   - Input: ['--list-roles']
   - Expected: prints 'No roles available.' and process.exit(0) called

8. PROMPT-08: listPromptRoles ignores non-`.md` files and sorts correctly
   - Setup: mix of `.md` and other files in `agent-prompts`
   - Expected: returns only `.md` basenames sorted

9. PROMPT-09: resolvePromptTemplate returns '' for files with only whitespace
   - Setup: `agent-prompts/foo.md` contains whitespace
   - Expected: resolvePromptTemplate('foo') === ''

---

## Option Validation

1. VAL-01: valid reasoning allowed
   - Input: options.reasoning = 'low'
   - Expected: validateOptions does not throw

2. VAL-02: invalid reasoning throws descriptive Error
   - Input: options.reasoning = 'ultra'
   - Expected: throw Error mentioning valid reasoning values

3. VAL-03: invalid sandbox throws descriptive Error
   - Input: sandbox='nope'
   - Expected: throw Error

4. VAL-04: invalid approval throws descriptive Error
   - Input: approval='sometimes'
   - Expected: throw Error

5. VAL-05: invalid web-search throws descriptive Error
   - Input: webSearch='liveish'
   - Expected: throw Error

Implemented: VAL-01..VAL-05 ✅

- Tests located at: `tests/option-validation.test.ts`

ISSUES FOUND (CODE) - Option Validation

- None found. `validateOptions` validates `reasoning`, `sandbox`, `approval`, and `webSearch` and emits descriptive errors listing allowed values.

---

## Schema Resolution

1. SCHEMA-01: `--structured` without schema file returns default schema
   - Input: options.structured = true
   - Expected: returns defaultSchema object

2. SCHEMA-02: valid `--schema-file` inside project parsed as object
   - Setup: create valid JSON object file in project
   - Input: options.schemaFile set
   - Expected: parsed object returned

3. SCHEMA-03: schema file outside project throws
   - Setup: path resolves outside process.cwd()
   - Expected: throw Error "Schema path must be inside project directory."

4. SCHEMA-04: schema file that parses but is not object (array or primitive) throws
   - Setup: file containing `[]` or `"a"`
   - Expected: throw Error about 'must contain a JSON object at the root'

5. SCHEMA-05: missing schema file (ENOENT) yields descriptive error
   - Input: schemaFile points to missing file
   - Expected: throw Error mentioning failing to read/parse

6. SCHEMA-06: schema file contains invalid JSON -> throws parse error mentioning path
   - Setup: malformed JSON file inside project
   - Expected: throw Error describing parse failure and file path

7. SCHEMA-07: resolveOutputSchema returns undefined when neither `structured` nor `schemaFile` set
   - Input: options without `structured` or `schemaFile`
   - Expected: returns undefined

---

## Stream Handling and Event Processing

1. STREAM-01: item.completed with agent_message sets finalResponse
   - Input: event item.completed agent_message text='OK'
   - Expected: results.finalResponse === 'OK'

2. STREAM-02: item.completed with command_execution appends command
   - Input: event command_execution command='ls'
   - Expected: results.commands includes 'ls'

3. STREAM-03: item.completed with file_change appends formatted files
   - Input: changes [{kind:'modified', path:'src/a.ts'}]
   - Expected: results.fileChanges includes 'modified: src/a.ts'

4. STREAM-04: item.completed with mcp_tool_call appends server:tool
   - Input: server='s', tool='t'
   - Expected: results.toolCalls includes 's:t'

5. STREAM-05: item.completed with web_search appends query
   - Input: web_search query='query'
   - Expected: results.webQueries includes 'query'

6. STREAM-06: turn.completed sets usage summary
   - Input: event with usage { input_tokens: 3, output_tokens: 4 }
   - Expected: results.usageSummary matches expected string

7. STREAM-07: turn.failed throws with the event error message
   - Input: event turn.failed with error.message
   - Expected: processStream rejects with that Error

8. STREAM-08: error event throws with message
   - Input: event error with message
   - Expected: processStream rejects with Error

9. STREAM-09: stream reading respects timeout and rejects with timeout message
   - Input: stream that never yields -> set very small timeoutMs
   - Expected: rejected Error mentioning timeout minutes

10. STREAM-10: processStream writes raw events to logStream and verbose outputs
    - Setup: provide a mock writable logStream and options.verbose true
    - Input: a small series of events
    - Expected: logStream.write called with JSON lines; stdout wrote event JSON

11. STREAM-11: iterator.return is called in finally, even on error
    - Setup: use a generator with side-effect when return called
    - Expected: the side-effect executed

12. STREAM-12: processStream handles an immediately-ending stream (no events)
    - Setup: async iterable that yields nothing
    - Expected: returns empty StreamResults (empty arrays/strings)

13. STREAM-13: iterator.next throws -> processStream propagates error and calls iterator.return
    - Setup: async iterator whose `next` throws
    - Expected: processStream rejects with the error and iterator.return was invoked

14. STREAM-14: handleItemCompleted ignores unknown item types (no mutation)
    - Input: item { type: 'unknown' }
    - Expected: results remain unchanged

---

## Streaming Guards & Handlers (unit tests)

1. GUARD-01: isAgentMessage returns true only for agent_message with text string
2. GUARD-02: isCommandExecution returns true only for type 'command_execution' with string command
3. GUARD-03: isFileChangeArray returns false for malformed arrays or missing fields
4. GUARD-04: isFileChangeItem returns true when item.type === 'file_change' and changes validate
5. GUARD-05: isMcpToolCall returns true only when server & tool strings present
6. GUARD-06: isWebSearch returns true only for type 'web_search' with string query

---

## Logging and Output Helpers

1. LOG-01: printSummaries prints formatted lists with expected prefixes
   - Input: results with commands/fileChanges/toolCalls/webQueries; options.verbose=false
   - Expected: stdout contains sections 'Commands:', 'File changes:', etc.

2. LOG-02: printSummaries suppresses output when options.verbose=true
   - Input: same as above with verbose=true
   - Expected: nothing printed

3. LOG-03: printSummaries respects options.maxItems limit
   - Input: results with many entries and maxItems=2
   - Expected: only first 2 items printed for each category

4. LOG-04: printFinalResponse when schema present attempts JSON parse and pretty prints
   - Input: finalResponse = JSON string, outputSchema defined
   - Expected: pretty-printed JSON on stdout

5. LOG-05: printFinalResponse falls back to raw text on parse error
   - Input: finalResponse = 'not-json', outputSchema defined
   - Expected: prints 'not-json' raw

6. LOG-06: tailLogFile returns last N lines or [] for missing file
   - Setup: temporary log file with many lines
   - Input: tailLogFile(path, 5)
   - Expected: last 5 lines returned

7. LOG-07: tailLogFile returns [] when path resolves outside project
   - Input: path resolves outside process.cwd()
   - Expected: []

8. LOG-08: tailLogFile returns [] for an empty file (exists but no content)
   - Setup: empty file inside project
   - Input: tailLogFile(path, 5)
   - Expected: []

9. LOG-09: `run` cleans up logStream and intervals even when `processStream` throws
   - Setup: mock `thread.runStreamed` to produce events that cause `processStream` to throw
   - Expected: `logStream.end()` called and `clearInterval` invoked

---

## Runner (`run` / `main`) Behavior

1. RUN-01: run throws when required `--task` missing
   - Input: run() with parsed options missing task
   - Expected: throw Error 'Missing required --task value.'

2. RUN-02: run resolves and prints summaries & final response on success
   - Setup: mock Codex and thread.runStreamed to provide events
   - Expected: printSummaries and printFinalResponse invoked; no uncaught errors

3. RUN-03: run throws when logFile path outside project
   - Input: options.logFile pointing outside project
   - Expected: throw Error 'Log file path must be inside project directory.'

4. RUN-04: main catches run's error and sets process.exitCode = 1 and writes message to stderr
   - Setup: stub process.stderr.write and run to throw
   - Expected: exitCode === 1 and message emitted

5. RUN-05: run does not validate `--role` when `agent-prompts` is missing (confirm intended behavior)
   - Setup: no `agent-prompts` dir + unknown `--role`
   - Expected: no error thrown (document and assert behavior)

6. RUN-06: Codex integration: `startThread` and `runStreamed` invoked with expected arguments
   - Setup: mock `Codex` and `thread.runStreamed`
   - Expected: `startThread` called with reasoning mapped to `modelReasoningEffort` and `runStreamed` receives `{ outputSchema }`

---

## Integration / End-to-End Scenarios

1. E2E-01: Full run with structured output using default schema
   - Setup: mock Codex to return valid JSON finalResponse
   - Expected: final JSON printed pretty with keys `summary` and `status` present

2. E2E-02: Full run where delegate fails mid-stream
   - Setup: stream emits turn.failed
   - Expected: run rejects; main sets exitCode; logs contain error

3. E2E-03: Logging progress interval prints tail lines when logStream present
   - Setup: create log file, write lines, enable verbose/logFile and allow the interval to tick
   - Expected: stdout includes "Sub-agent progress (last 5 log lines):" and the tail lines

---

## Notes & Test Utilities

- Use async generator helpers to create synthetic event streams:

  ```ts
  async function* events(items) {
    for (const i of items) {
      yield i;
    }
  }
  ```

- For stream timeouts, prefer using very small `timeoutMs` to keep tests fast.
- Use temporary directories (e.g., `tmpdir`) and `process.chdir` guarded by restoring CWD to test path checks.
- Stub `process.exit` and `process.stderr.write` when testing immediate flags and `main` behavior.
- Mock `Codex` and thread objects rather than calling real networked services.

---

### Prioritization suggestion

- Start by unit tests for: CLI parsing, prompt/template reading, schema resolution, and streaming guards. (High confidence and low setup.)
- Next, tests for `processStream` behaviors (timeouts, error handling, log stream I/O).
- Finish with integration/e2e simulations using mocked `Codex`.
