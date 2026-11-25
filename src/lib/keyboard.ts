export function focusNextFieldInContainer(
  currentElement: HTMLElement | null,
  container: HTMLElement | null
): boolean {
  if (!currentElement || !container) return false;

  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button[type="submit"]:not([disabled])'
    )
  ).filter((el) => el.offsetParent !== null);

  const currentIdx = candidates.indexOf(currentElement);
  if (currentIdx === -1) return false;

  for (let i = currentIdx + 1; i < candidates.length; i++) {
    const next = candidates[i];
    next.focus();
    if (
      next instanceof HTMLInputElement &&
      next.type !== "date" &&
      next.type !== "number" &&
      next.type !== "checkbox"
    ) {
      next.select();
    }
    return true;
  }

  return false;
}
