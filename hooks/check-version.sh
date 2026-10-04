#!/bin/sh
# Muse Pet is a mod, which needs Claude Code 2.1.287 or later. Older versions load this file's
# settings hooks but not the mod, so this SessionStart hook is the one thing that can tell the user.
# It prints a systemMessage (shown to the user) only when the running version is too old.
need="2.1.287"
v="${MUSE_PET_VERSION_OVERRIDE:-$(claude --version 2>/dev/null | awk '{print $1}')}"
case "$v" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) exit 0 ;; # unknown: say nothing
esac
ok=$(printf '%s\n%s\n' "$v" "$need" | awk -F. 'NR==1{a=$1;b=$2;c=$3} NR==2{ if (a>$1 || (a==$1 && (b>$2 || (b==$2 && c>=$3)))) print "yes"; else print "no" }')
if [ "$ok" = "no" ]; then
  printf '{"systemMessage":"Muse Pet needs Claude Code %s or later (this is %s), so it cannot draw yet. Update with: claude update (native install) or npm i -g @anthropic-ai/claude-code@latest, then start a new session."}' "$need" "$v"
fi
exit 0
