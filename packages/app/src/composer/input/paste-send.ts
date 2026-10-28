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

export function resolvePasteAutoSend(input: {
  armed: boolean;
  event: TextInputSegmentEvent;
}): boolean {
  return input.armed && isPasteInsertion(input.event);
}
