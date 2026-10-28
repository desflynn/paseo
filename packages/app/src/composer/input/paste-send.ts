/**
 * Paste-send: the one-tap dictation loop's trigger.
 *
 * Des dictates with an external app that pastes whole phrases into the message
 * box. The trigger is strictly a paste — typing must never auto-send — so the
 * signal is a single onTextInput event whose payload is a multi-character
 * insertion. Typing arrives as one event per character; autocorrect arrives as
 * a replacement over existing characters, which is an edit, not a paste.
 */

/** Near-instant per Des's working number; tunable. */
export const AUTO_SEND_DELAY_MS = 100;

export interface TextInputSegmentEvent {
  /** The inserted text segment, not the whole value. */
  text: string;
  previousText: string;
  /** The span of `previousText` this event replaced. */
  range: { start: number; end: number };
}

export function isPasteInsertion(event: TextInputSegmentEvent): boolean {
  if (event.text.trim().length < 2) return false;
  // An edit over existing characters (autocorrect) is not a paste: its payload is a
  // single word swapping in for a similar-length span. A paste carries a multi-word
  // phrase, whether it lands at the caret or over a selection.
  const replacesExisting = event.range.end > event.range.start;
  if (replacesExisting && !/\s/.test(event.text.trim())) return false;
  return true;
}

/**
 * Derives the segment event for a whole-value change — Android's only signal, since
 * React Native never emits onTextInput there. The common prefix and suffix of the two
 * values bound the replaced span; what sits between them in the next value is the
 * inserted text. Typing arrives one character at a time, a paste as one multi-word
 * chunk, so the same shape rule applies.
 */
export function diffTextInputChange(
  previousValue: string,
  nextValue: string,
): TextInputSegmentEvent | null {
  if (previousValue === nextValue) return null;

  let prefix = 0;
  const maxPrefix = Math.min(previousValue.length, nextValue.length);
  while (prefix < maxPrefix && previousValue[prefix] === nextValue[prefix]) prefix += 1;

  let suffix = 0;
  const maxSuffix = Math.min(previousValue.length - prefix, nextValue.length - prefix);
  while (
    suffix < maxSuffix &&
    previousValue[previousValue.length - 1 - suffix] === nextValue[nextValue.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    text: nextValue.slice(prefix, nextValue.length - suffix),
    previousText: previousValue,
    range: {
      start: prefix,
      end: previousValue.length - suffix,
    },
  };
}

export function resolvePasteAutoSend(input: {
  armed: boolean;
  event: TextInputSegmentEvent;
}): boolean {
  return input.armed && isPasteInsertion(input.event);
}
