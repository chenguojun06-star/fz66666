#!/usr/bin/env python3
"""Remove redundant method-level @PreAuthorize("isAuthenticated()") from controllers
that already have the same annotation at class level."""
import os, re

base = "/Volumes/macoo2/Users/guojunmini4/Documents/\u670d\u88c566666/backend/src/main/java"
removed_total = 0
files_modified = []

for root, dirs, files in os.walk(base):
    for fname in files:
        if not fname.endswith("Controller.java"):
            continue
        fpath = os.path.join(root, fname)
        with open(fpath) as f:
            lines = f.readlines()

        # Check if class-level @PreAuthorize("isAuthenticated()") exists
        has_class_level = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped == '@PreAuthorize("isAuthenticated()")':
                # Check if next non-empty line is class declaration
                for j in range(i + 1, min(i + 3, len(lines))):
                    if "public class" in lines[j]:
                        has_class_level = True
                        break
            if has_class_level:
                break

        if not has_class_level:
            continue

        # Remove method-level (indented) @PreAuthorize("isAuthenticated()")
        new_lines = []
        removed = 0
        for line in lines:
            if line.strip() == '@PreAuthorize("isAuthenticated()")' and line.startswith("    "):
                removed += 1
                continue
            new_lines.append(line)

        if removed > 0:
            with open(fpath, "w") as f:
                f.writelines(new_lines)
            removed_total += removed
            rel = os.path.relpath(fpath, base)
            files_modified.append((rel, removed))

print(f"Files: {len(files_modified)}, Lines removed: {removed_total}")
for f, c in sorted(files_modified):
    print(f"  [-{c:3d}] {f}")
