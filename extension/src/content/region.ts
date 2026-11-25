const HEADING = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

/**
 * The part of the page a cue talks about. A cue anchored to a heading covers the heading's whole
 * section: its largest ancestor that holds no other cue (so the image above a heading, and the text
 * below it, belong to that cue). A cue anchored to any other element covers that element, because
 * whoever marked it chose it.
 */
export function sectionOf(element: Element, cueElements: readonly Element[]): Element {
  if (!element.matches(HEADING)) return element;
  const others = cueElements.filter((other) => other !== element && !element.contains(other));
  const stop = new Set<Element | null>([element.ownerDocument.body, element.ownerDocument.documentElement]);
  let section = element;
  for (let parent = element.parentElement; parent && !stop.has(parent); parent = parent.parentElement) {
    if (others.some((other) => parent.contains(other))) break;
    section = parent;
  }
  return section;
}
