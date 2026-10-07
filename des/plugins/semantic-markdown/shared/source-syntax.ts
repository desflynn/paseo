const KINDS = "ask|done|deferred|warning|danger|info|muted";
const SEMANTIC_LINE = new RegExp("^[ \\t]*\\{(" + KINDS + ")\\}[ \\t]+.+$", "im");
const SEMANTIC_CALLOUT = new RegExp("^[ \\t]*>\\s*\\[!(" + KINDS + ")\\]", "im");
// Status strip: the `{status}…{/status}` pair as a whole line.
const SEMANTIC_STATUS = /^[ \t]*\{status\}.*\{\/status\}[ \t]*$/im;
// Paired inline tag, optionally with `==` around its content for highlight treatment.
// Unsupported wrappers (success/warn) never appear in KINDS.
const COMPLETE_MATH = /\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\\\n])+\$/;
const FOOTNOTE = /\[\^[^\]\n]+\]/;
const KEYBOARD = /<kbd>[\s\S]*?<\/kbd>/i;

// The plugin also owns complete GFM tables, fenced code blocks, and ordinary
// blockquotes. The table check mirrors markdown-it's table rule: the delimiter
// row must be cells of `:?-+:?`, and the header row must contain `|` with no
// more cells than the delimiter row. A bare `|` in prose never claims.
const FENCED_CODE = /^[ \t]{0,3}(?:`{3,}|~{3,})/m;
const BLOCKQUOTE = /^[ \t]{0,3}>/m;
const INDENTED_CODE = /^(?: {4}|\t)/;
const DELIMITER_CELL = /^:?-+:?$/;

function isEscaped(text: string, index: number): boolean {
  var backslashes = 0;
  for (var position = index - 1; position >= 0 && text[position] === "\\"; position -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findUnescaped(text: string, needle: string, from: number): number {
  var index = text.indexOf(needle, from);
  while (index >= 0 && isEscaped(text, index)) {
    index = text.indexOf(needle, index + needle.length);
  }
  return index;
}

function hasSemanticHighlight(text: string): boolean {
  var opener = new RegExp("==\\{(" + KINDS + ")\\}[ \\t]*", "g");
  for (var match = opener.exec(text); match; match = opener.exec(text)) {
    if (isEscaped(text, match.index)) continue;
    var close = findUnescaped(text, "==", opener.lastIndex);
    if (close >= 0 && text.slice(opener.lastIndex, close).indexOf("\n") < 0) return true;
  }
  return false;
}

function hasSemanticPair(text: string): boolean {
  var opener = new RegExp("\\{(" + KINDS + ")\\}", "g");
  for (var match = opener.exec(text); match; match = opener.exec(text)) {
    if (isEscaped(text, match.index)) continue;
    var close = findUnescaped(text, "{/" + match[1] + "}", opener.lastIndex);
    if (close >= 0 && text.slice(opener.lastIndex, close).indexOf("\n") < 0) return true;
  }
  return false;
}

export function hasIncompleteSemanticPair(text: string): boolean {
  var visible = withoutCode(text);
  var opener = new RegExp("\\{(" + KINDS + ")\\}", "g");
  for (var match = opener.exec(visible); match; match = opener.exec(visible)) {
    if (isEscaped(visible, match.index)) continue;
    // `=={kind}text==` is the standalone highlight form, not a paired tag.
    if (match.index >= 2 && visible.slice(match.index - 2, match.index) === "==") continue;
    if (visible.indexOf("\n", opener.lastIndex) >= 0) continue;
    if (findUnescaped(visible, "{/" + match[1] + "}", opener.lastIndex) < 0) return true;
  }
  return false;
}

function hasCardDefinition(text: string): boolean {
  var opener = /\{card:([A-Za-z0-9_-]+)\}/g;
  for (var match = opener.exec(text); match; match = opener.exec(text)) {
    if (isEscaped(text, match.index)) continue;
    if (findUnescaped(text, "{/card}", opener.lastIndex) >= 0) return true;
  }
  return false;
}

function delimiterColumnCount(line: string): number {
  var cells = line.trim().split("|");
  var count = 0;
  for (var index = 0; index < cells.length; index += 1) {
    var cell = cells[index].trim();
    if (!cell) {
      // markdown-it allows an empty cell only before or after the table.
      if (index > 0 && index < cells.length - 1) return -1;
      continue;
    }
    if (!DELIMITER_CELL.test(cell)) return -1;
    count += 1;
  }
  return count;
}

function headerColumnCount(line: string): number {
  var text = line.trim().replace(/^\||\|$/g, "");
  var count = 1;
  for (var index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "|") count += 1;
  }
  return count;
}

function hasCompleteTable(visible: string): boolean {
  var lines = visible.split("\n");
  for (var index = 1; index < lines.length; index += 1) {
    var delimiter = lines[index];
    if (INDENTED_CODE.test(delimiter)) continue;
    var columns = delimiterColumnCount(delimiter);
    if (columns < 1) continue;
    var header = lines[index - 1];
    if (INDENTED_CODE.test(header)) continue;
    if (header.indexOf("|") < 0) continue;
    if (headerColumnCount(header) > columns) continue;
    return true;
  }
  return false;
}

function maskInlineCode(line: string): string {
  var visible = "";
  var position = 0;
  while (position < line.length) {
    if (line[position] !== "`") {
      visible += line[position];
      position += 1;
      continue;
    }

    var openerEnd = position;
    while (line[openerEnd] === "`") openerEnd += 1;
    var openerLength = openerEnd - position;
    var search = openerEnd;
    var closerEnd = -1;
    while (search < line.length) {
      var closerStart = line.indexOf("`", search);
      if (closerStart < 0) break;
      var runEnd = closerStart;
      while (line[runEnd] === "`") runEnd += 1;
      if (runEnd - closerStart === openerLength) {
        closerEnd = runEnd;
        break;
      }
      search = runEnd;
    }
    if (closerEnd < 0) {
      visible += line.slice(position, openerEnd);
      position = openerEnd;
      continue;
    }
    visible += " ".repeat(closerEnd - position);
    position = closerEnd;
  }
  return visible;
}

function withoutCode(text: string): string {
  var lines = text.split("\n");
  var visible: string[] = [];
  var fenceCharacter = "";
  var fenceLength = 0;
  for (var index = 0; index < lines.length; index += 1) {
    var line = lines[index];
    if (fenceCharacter) {
      var closing = new RegExp("^[ \\t]{0,3}" + fenceCharacter + "{" + fenceLength + ",}[ \\t]*$");
      if (closing.test(line)) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      visible.push("");
      continue;
    }

    var opening = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fenceCharacter = opening[1][0];
      fenceLength = opening[1].length;
      visible.push("");
      continue;
    }
    visible.push(maskInlineCode(line));
  }
  return visible.join("\n");
}

export function hasSemanticSourceSyntax(text: string): boolean {
  var visible = withoutCode(text);
  return (
    FENCED_CODE.test(text) ||
    BLOCKQUOTE.test(visible) ||
    hasCompleteTable(visible) ||
    SEMANTIC_LINE.test(visible) ||
    hasSemanticHighlight(visible) ||
    SEMANTIC_CALLOUT.test(visible) ||
    SEMANTIC_STATUS.test(visible) ||
    hasSemanticPair(visible) ||
    hasCardDefinition(visible) ||
    COMPLETE_MATH.test(visible) ||
    FOOTNOTE.test(visible) ||
    KEYBOARD.test(visible)
  );
}
