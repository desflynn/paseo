import assert from "node:assert/strict";
import { test } from "node:test";
import { texToUnicode } from "./tex-unicode.ts";

test("greek letters and operators become Unicode", () => {
  assert.equal(texToUnicode(String.raw`\alpha + \beta \times \pi \leq \infty`), "α + β × π ≤ ∞");
  assert.equal(texToUnicode(String.raw`a \neq b \approx c \pm d`), "a ≠ b ≈ c ± d");
  assert.equal(texToUnicode(String.raw`\Delta x \to 0`), "Δ x → 0");
});

test("superscripts and subscripts use Unicode forms when every character has one", () => {
  assert.equal(texToUnicode("x^2 + y^{10}"), "x² + y¹⁰");
  assert.equal(texToUnicode("a_1 + a_{n-1}"), "a₁ + aₙ₋₁");
  // π has no superscript form, so the whole group falls back.
  assert.equal(texToUnicode(String.raw`e^{i\pi}`), "e^(iπ)");
});

test("scripts without full Unicode coverage fall back to caret notation", () => {
  assert.equal(texToUnicode("x^{abc}"), "x^(abc)");
  assert.equal(texToUnicode("x_{max}"), "x_(max)");
});

test("fractions and roots", () => {
  assert.equal(texToUnicode(String.raw`\frac{1}{2}`), "1⁄2");
  assert.equal(texToUnicode(String.raw`\frac{a+b}{c}`), "(a+b)/c");
  assert.equal(texToUnicode(String.raw`\sqrt{2}`), "√2");
  assert.equal(texToUnicode(String.raw`\sqrt{x+1}`), "√(x+1)");
});

test("text and font commands keep their content", () => {
  assert.equal(texToUnicode(String.raw`\text{if } x \mathbf{v}`), "if x v");
});

test("spacing and sizing commands disappear", () => {
  assert.equal(texToUnicode(String.raw`\left( a \, b \right)`), "( a b )");
});

test("unknown commands stay visible so nothing is silently lost", () => {
  assert.equal(texToUnicode(String.raw`\foo x`), String.raw`\foo x`);
});

test("sums and integrals keep their limits", () => {
  assert.equal(texToUnicode(String.raw`\sum_{i=1}^{n} i`), "∑ᵢ₌₁ⁿ i");
  assert.equal(texToUnicode(String.raw`\int_0^1 f`), "∫₀¹ f");
});
