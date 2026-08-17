export const FIRST_ACCESS_TOUR_EVENT = 'nosigilo:start-tour';

export function startFirstAccessTutorial() {
  window.dispatchEvent(new Event(FIRST_ACCESS_TOUR_EVENT));
}
