// TeX → plain Unicode text for inline and block math. React Native has no MathML and
// plugins get no WebView for KaTeX, so math renders as selectable, copyable text.
// ponytail: no 2-D layout (stacked fractions, matrices); upgrade path is a WebView
// renderer if exact typesetting is ever required.

const SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  simeq: "≃",
  propto: "∝",
  ll: "≪",
  gg: "≫",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  implies: "⇒",
  iff: "⇔",
  mapsto: "↦",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  oint: "∮",
  in: "∈",
  notin: "∉",
  ni: "∋",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  setminus: "∖",
  forall: "∀",
  exists: "∃",
  emptyset: "∅",
  varnothing: "∅",
  neg: "¬",
  lnot: "¬",
  land: "∧",
  wedge: "∧",
  lor: "∨",
  vee: "∨",
  ldots: "…",
  cdots: "⋯",
  dots: "…",
  degree: "°",
  langle: "⟨",
  rangle: "⟩",
  mid: "∣",
  parallel: "∥",
  perp: "⊥",
  angle: "∠",
  hbar: "ℏ",
  ell: "ℓ",
  Re: "ℜ",
  Im: "ℑ",
  aleph: "ℵ",
  prime: "′",
  lfloor: "⌊",
  rfloor: "⌋",
  lceil: "⌈",
  rceil: "⌉",
  "{": "{",
  "}": "}",
  "%": "%",
  $: "$",
  "&": "&",
  "#": "#",
  _: "_",
};

// Commands that only affect spacing or delimiter size: drop them, keep what follows.
const DROPPED = new Set([
  ",",
  ";",
  ":",
  "!",
  " ",
  "quad",
  "qquad",
  "left",
  "right",
  "big",
  "Big",
  "bigg",
  "Bigg",
  "displaystyle",
  "textstyle",
  "limits",
  "nolimits",
]);

// Commands whose single argument is shown as plain content.
const CONTENT = new Set([
  "text",
  "textrm",
  "textbf",
  "textit",
  "mathrm",
  "mathbf",
  "mathit",
  "mathsf",
  "mathtt",
  "mathcal",
  "mathbb",
  "mathfrak",
  "operatorname",
  "boldsymbol",
  "overline",
  "underline",
  "hat",
  "bar",
  "vec",
  "tilde",
  "dot",
]);

const SUP: Record<string, string> = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
};

const SUB: Record<string, string> = {
  0: "₀",
  1: "₁",
  2: "₂",
  3: "₃",
  4: "₄",
  5: "₅",
  6: "₆",
  7: "₇",
  8: "₈",
  9: "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

const SIMPLE = /^[A-Za-z0-9]+$/;

function script(content: string, map: Record<string, string>, caret: string): string {
  // A word such as "max" reads better as x_(max) than as Unicode letter scripts.
  const chars = [...content];
  const mapped = chars.map((ch) => map[ch]);
  if (!/[A-Za-z]{2}/.test(content) && mapped.every(Boolean)) return mapped.join("");
  return `${caret}(${content})`;
}

export function texToUnicode(tex: string): string {
  let i = 0;

  function readCommand(): string {
    // Called with tex[i] === "\\".
    i += 1;
    const start = i;
    if (/[A-Za-z]/.test(tex[i] ?? "")) {
      while (/[A-Za-z]/.test(tex[i] ?? "")) i += 1;
    } else {
      i += 1;
    }
    return tex.slice(start, i);
  }

  function skipSpaces(): void {
    while (tex[i] === " ") i += 1;
  }

  // One argument: a braced group, a command, or a single character.
  function readArg(): string {
    skipSpaces();
    if (tex[i] === "{") return readGroup();
    if (tex[i] === "\\") return convertCommand(readCommand());
    const ch = tex[i] ?? "";
    i += 1;
    return ch;
  }

  function readGroup(): string {
    // Called with tex[i] === "{".
    i += 1;
    let out = "";
    while (i < tex.length && tex[i] !== "}") out += readToken();
    i += 1;
    return out;
  }

  function convertCommand(name: string): string {
    if (DROPPED.has(name)) return "";
    if (name in SYMBOLS) return SYMBOLS[name];
    if (CONTENT.has(name)) return readArg();
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const top = readArg();
      const bottom = readArg();
      if (SIMPLE.test(top) && SIMPLE.test(bottom)) return `${top}⁄${bottom}`;
      const wrap = (x: string) => (SIMPLE.test(x) ? x : `(${x})`);
      return `${wrap(top)}/${wrap(bottom)}`;
    }
    if (name === "sqrt") {
      const body = readArg();
      return [...body].length === 1 || SIMPLE.test(body) ? `√${body}` : `√(${body})`;
    }
    return `\\${name}`;
  }

  function readToken(): string {
    const ch = tex[i];
    if (ch === "\\") return convertCommand(readCommand());
    if (ch === "{") return readGroup();
    if (ch === "^") {
      i += 1;
      return script(readArg(), SUP, "^");
    }
    if (ch === "_") {
      i += 1;
      return script(readArg(), SUB, "_");
    }
    i += 1;
    return ch;
  }

  let out = "";
  while (i < tex.length) out += readToken();
  return out.replace(/\s+/g, " ").trim();
}
