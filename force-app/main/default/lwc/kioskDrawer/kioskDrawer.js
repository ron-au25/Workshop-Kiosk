import { LightningElement, api } from "lwc";

/**
 * Right-side drawer used by every kiosk form.
 *
 * Usage (parent renders it only while open):
 *   <template lwc:if={showForm}>
 *     <c-kiosk-drawer heading="New measure" onclose={handleCancel}>
 *       ...form fields...
 *       <div slot="footer" class="k-drawer-actions">
 *         <button class="k-btn k-btn--secondary" onclick={handleCancel}>Cancel</button>
 *         <button class="k-btn k-btn--primary" onclick={handleSave}>Save</button>
 *       </div>
 *     </c-kiosk-drawer>
 *   </template>
 *
 * Fires `close` when the scrim, ✕ or Escape is used. The parent decides
 * whether to actually close (it owns the open flag).
 * Slotted content is styled by the parent's CSS (import c/kioskUi there).
 */
export default class KioskDrawer extends LightningElement {
  @api heading;
  @api subheading;
  /** "md" (540px, default) or "lg" (720px) */
  @api size = "md";

  hasFooter = false;

  get panelClass() {
    return this.size === "lg" ? "panel panel-lg" : "panel";
  }

  get footClass() {
    return this.hasFooter ? "foot" : "foot foot-empty";
  }

  handleFooterSlotChange(evt) {
    this.hasFooter = evt.target.assignedElements().length > 0;
  }

  handleKeydown(evt) {
    if (evt.key === "Escape") {
      evt.stopPropagation();
      this.handleClose();
    }
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }
}
