#!/usr/bin/env bash
# Live TUI probe: render a real diff + fenced code block, capture ANSI.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SESSION="syntaxprobe$$"
OUT="${1:-/tmp/syntax-probe.ansi}"

cat > /tmp/probe_snippet.md <<'MD'
```cpp
#include <vector>        // pull in the container
int main() {
    auto n = 0xFF;       // hex literal
    std::string s = "hi";
    return compute(n);
}
```
MD

tmux new-session -d -s "$SESSION" -x 120 -y 50 \
  "COLORTERM=truecolor TERM=xterm-256color hermes --tui"
sleep 8
tmux send-keys -t "$SESSION" "Print exactly the contents of /tmp/probe_snippet.md, nothing else" 
sleep 1
tmux send-keys -t "$SESSION" Enter
sleep 2
tmux send-keys -t "$SESSION" Enter
sleep 30
tmux capture-pane -t "$SESSION" -p -S -60 -e > "$OUT"
tmux kill-session -t "$SESSION" 2>/dev/null

echo "captured -> $OUT"
echo "truecolor (38;2): $(grep -c $'\x1b\[38;2;' "$OUT" 2>/dev/null || echo 0)"
echo "ansi256   (38;5): $(grep -c $'\x1b\[38;5;' "$OUT" 2>/dev/null || echo 0)"
