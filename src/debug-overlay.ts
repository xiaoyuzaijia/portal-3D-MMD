/**
 * On-screen debug overlay — shows tracking state and captures errors
 * so you don't need to open the browser console during development.
 */
export class DebugOverlay {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.id = "debug-overlay";
    this.el.style.cssText = `
      position: fixed; bottom: 8px; left: 8px; z-index: 200;
      background: rgba(0,0,0,0.75); color: #0f0; font: 12px monospace;
      padding: 8px 12px; border-radius: 4px; max-width: 360px;
      pointer-events: none; line-height: 1.5;
    `;
    document.body.appendChild(this.el);

    // Capture uncaught errors and show them on-screen
    window.addEventListener("error", (e) => {
      this.el.innerHTML +=
        `<div style="color:#f44">ERROR: ${e.message}</div>`;
    });
    window.addEventListener("unhandledrejection", (e) => {
      this.el.innerHTML +=
        `<div style="color:#f44">REJECT: ${String(e.reason)}</div>`;
    });
  }

  update(text: string): void {
    this.el.innerHTML = text;
  }

  remove(): void {
    this.el.remove();
  }
}
