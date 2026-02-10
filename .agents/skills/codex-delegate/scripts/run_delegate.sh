#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <role> <task> <working_dir> [instructions] [timeout_minutes]" >&2
  exit 1
fi

role="$1"
task="$2"
working_dir="$3"
instructions="${4:-}"
timeout_minutes="${5:-10}"

if command -v codex-delegate >/dev/null 2>&1; then
  cli=("codex-delegate")
elif [[ -f "$working_dir/bin/codex-delegate.js" ]]; then
  cli=("node" "$working_dir/bin/codex-delegate.js")
else
  echo "codex-delegate not found on PATH and no local bin/codex-delegate.js in $working_dir." >&2
  echo "Install @h-arnold/codex-delegate globally or run inside the project repository." >&2
  exit 1
fi

cmd=(
  "${cli[@]}"
  --role "$role"
  --task "$task"
  --working-dir "$working_dir"
  --timeout-minutes "$timeout_minutes"
)

if [[ -n "$instructions" ]]; then
  cmd+=(--instructions "$instructions")
fi

"${cmd[@]}"
