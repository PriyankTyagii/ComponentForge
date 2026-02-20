"""
validator.py
------------
Linter-Agent that inspects generated Angular component code for:
  1. Design-token compliance  -- only approved hex colors used
  2. Border-radius compliance -- only approved radii used
  3. Basic syntax validity    -- balanced braces, HTML tags, @Component decorator

Public API:
  validate(code_blocks, design_system_path)   -> ValidationResult
  validate_component(code_blocks, ...)        -> (errors, warnings)  # used by agent.py
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    passed: bool
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)
        self.passed = False

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)


# ---------------------------------------------------------------------------
# Design-token helpers
# ---------------------------------------------------------------------------

def _extract_approved_colors(design_system: dict) -> set:
    approved = set()
    for value in design_system.get("colors", {}).values():
        if isinstance(value, str) and value.startswith("#"):
            approved.add(value.lower())
    return approved


def _extract_approved_radii(design_system: dict) -> set:
    approved = set()
    for key, value in design_system.get("borders", {}).items():
        if "radius" in key and isinstance(value, str):
            approved.add(value.lower())
    # Always allow 0 and 0px -- valid CSS reset, not a design token violation
    approved.add("0")
    approved.add("0px")
    return approved


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def _check_color_compliance(code: str, approved: set, result: ValidationResult, src: str) -> None:
    for raw in re.findall(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", code):
        short = "#" + raw.lower()
        long_ = "#" + "".join(c * 2 for c in raw.lower()) if len(raw) == 3 else short
        if short not in approved and long_ not in approved:
            result.add_error("[" + src + "] Unauthorized color '" + short + "' — use a design system color.")


def _check_border_radius(code: str, approved: set, result: ValidationResult, src: str) -> None:
    for m in re.finditer(r"border-radius\s*:\s*([^;{]+)", code, re.IGNORECASE):
        val = m.group(1).strip().lower()
        # Skip CSS custom properties and shorthand (multiple values)
        if val.startswith("var(") or " " in val:
            continue
        if val not in approved:
            result.add_error(
                "[" + src + "] Unauthorized border-radius '" + val +
                "' — allowed: " + ", ".join(sorted(approved))
            )


def _check_balanced_brackets(code: str, result: ValidationResult, src: str) -> None:
    pairs = {"}": "{", "]": "[", ")": "("}
    stack = []
    in_str = None
    for i, ch in enumerate(code):
        if ch in ('"', "'", "`") and in_str is None:
            in_str = ch
        elif in_str and ch == in_str and (i == 0 or code[i - 1] != "\\"):
            in_str = None
        elif in_str is None:
            if ch in "{[(":
                stack.append(ch)
            elif ch in "}])":
                if not stack or stack[-1] != pairs[ch]:
                    result.add_error("[" + src + "] Mismatched bracket '" + ch + "' at position " + str(i) + ".")
                    return
                stack.pop()
    if stack:
        result.add_error("[" + src + "] Unclosed bracket(s): " + str(stack))


def _check_html_tags(html: str, result: ValidationResult) -> None:
    VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}
    stack = []
    for m in re.finditer(r"<(/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>", html):
        closing, tag, attrs = m.groups()
        t = tag.lower()
        if t in VOID or attrs.strip().endswith("/"):
            continue
        if not closing:
            stack.append(t)
        else:
            if stack and stack[-1] == t:
                stack.pop()
            else:
                expected = stack[-1] if stack else "none"
                result.add_error("[HTML] Unexpected </" + t + "> — expected </" + expected + ">.")
                return
    if stack:
        result.add_error("[HTML] Unclosed tag(s): " + str(stack))


def _check_decorator(ts: str, result: ValidationResult) -> None:
    if "@Component" not in ts:
        result.add_error("[TS] Missing @Component decorator.")
    if "selector:" not in ts:
        result.add_error("[TS] @Component missing 'selector'.")
    if "template:" not in ts and "templateUrl:" not in ts:
        result.add_error("[TS] @Component missing 'template' or 'templateUrl'.")


def _check_font(scss: str, ds: dict, result: ValidationResult) -> None:
    ds_font = ds.get("typography", {}).get("font-family", "")
    if not ds_font:
        return
    ds_clean = ds_font.lower().replace("'", "").replace('"', "").split(",")[0].strip()
    for m in re.finditer(r"font-family\s*:\s*([^;]+)", scss, re.IGNORECASE):
        used = m.group(1).strip().lower().replace("'", "").replace('"', "")
        if ds_clean not in used:
            result.add_warning("[SCSS] font-family '" + used + "' doesn't match design token '" + ds_font + "'.")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate(
    code_blocks: dict,
    design_system_path: str = "design_system.json",
) -> ValidationResult:
    """Run all checks. Returns ValidationResult."""
    with open(design_system_path, "r", encoding="utf-8") as f:
        ds = json.load(f)

    approved_colors = _extract_approved_colors(ds)
    approved_radii  = _extract_approved_radii(ds)
    result = ValidationResult(passed=True)

    ts   = code_blocks.get("ts", "")
    html = code_blocks.get("html", "")
    scss = code_blocks.get("scss", "")

    if not ts:
        result.add_error("[TS] TypeScript block is empty.")
    else:
        _check_decorator(ts, result)
        _check_balanced_brackets(ts, result, "TS")
        _check_color_compliance(ts, approved_colors, result, "TS")

    if not html:
        result.add_warning("[HTML] HTML block empty — component may use inline template (ok).")
    else:
        _check_html_tags(html, result)
        _check_color_compliance(html, approved_colors, result, "HTML")

    if not scss:
        result.add_warning("[SCSS] SCSS block empty — no styles generated.")
    else:
        _check_balanced_brackets(scss, result, "SCSS")
        _check_color_compliance(scss, approved_colors, result, "SCSS")
        _check_border_radius(scss, approved_radii, result, "SCSS")
        _check_font(scss, ds, result)

    return result


def validate_component(
    code_blocks: dict,
    design_system_path: str = "design_system.json",
) -> tuple:
    """Used by agent.py. Returns (errors: list, warnings: list)."""
    r = validate(code_blocks, design_system_path)
    return r.errors, r.warnings