/**
 *  blocks normal copying of text inside `element`.
 *
 * - Ctrl+C, Cmd+C and the Edit > Copy menu all fire a `copy` event, so we
 *   cancel that event when the selected text is inside `element`.
 * - The right-click menu is turned off inside `element` only.
 *
 * Returns a cleanup function that removes the listeners.
 */
export function blockCopyEvents(element: HTMLElement): () => void {
  function isTypingField(node: Element | null): boolean {
    if (!(node instanceof HTMLElement)) return false;
    return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable;
  }

  function isSelectionInside(): boolean {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return false;

    for (let i = 0; i < selection.rangeCount; i++) {
      if (selection.getRangeAt(i).intersectsNode(element)) return true;
    }
    return false;
  }

  function handleCopy(event: ClipboardEvent) {
    // Inputs, textareas and the code editor copy their own text, so leave them alone.
    if (isTypingField(document.activeElement)) return;
    if (isSelectionInside()) event.preventDefault();
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  // On `document`, not `element`: the student may select panel text and then
  // move focus elsewhere before pressing Ctrl+C. The selection still counts.
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCopy);
  element.addEventListener('contextmenu', handleContextMenu);

  return () => {
    document.removeEventListener('copy', handleCopy);
    document.removeEventListener('cut', handleCopy);
    element.removeEventListener('contextmenu', handleContextMenu);
  };
}
