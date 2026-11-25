/**
 * Prevents the page and the prompter from echoing each other's scrolls back and forth.
 *
 * Each side owns one guard. When it scrolls because the *other* side asked (a programmatic scroll),
 * it stops broadcasting until that scroll has settled. Any real user input (wheel, touch, keys,
 * pointer) ends the programmatic phase at once, so the side the presenter touches always leads.
 */
export class ScrollGuard {
  private programmaticUntil = 0;

  constructor(
    private readonly now: () => number = () => performance.now(),
    /** Quiet time after the last programmatic scroll event before broadcasting resumes. */
    private readonly quietMs = 150,
    /** Upper bound in case no scroll or `scrollend` event ever arrives (the target was already in view). */
    private readonly maxMs = 1200,
  ) {}

  /** Call right before scrolling on behalf of the other side. */
  beginProgrammatic(): void {
    this.programmaticUntil = this.now() + this.maxMs;
  }

  /** Call on every scroll event; keeps the programmatic phase alive while a smooth scroll runs. */
  noteScroll(): void {
    if (this.isProgrammatic()) this.programmaticUntil = Math.max(this.programmaticUntil, this.now() + this.quietMs);
  }

  /** Call on `scrollend` (or when a scroll promise resolves). */
  settle(): void {
    if (this.isProgrammatic()) this.programmaticUntil = this.now() + this.quietMs;
  }

  /** Call on wheel, touch, keyboard or pointer input: the user takes over. */
  noteUserInput(): void {
    this.programmaticUntil = 0;
  }

  isProgrammatic(): boolean {
    return this.now() < this.programmaticUntil;
  }

  /** Whether a scroll seen now should be sent to the other side. */
  shouldBroadcast(): boolean {
    return !this.isProgrammatic();
  }
}

/** DOM events that mean a person is scrolling or navigating, not a script. */
export const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
