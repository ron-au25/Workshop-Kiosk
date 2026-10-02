import { LightningElement, api } from "lwc";

const PRIORITY_CLASS = {
  Critical: "priority-badge critical",
  High: "priority-badge high",
  Medium: "priority-badge medium",
  Low: "priority-badge low"
};
const STATUS_CLASS = {
  New: "status-pill new",
  Open: "status-pill new",
  "In Progress": "status-pill inprogress",
  Completed: "status-pill completed",
  Closed: "status-pill completed"
};

// Presentational list of full-width work order strip cards.
// Takes raw KioskController.WorkOrderCard DTOs in display order; emits `opendetail`.
export default class WorkOrderCardList extends LightningElement {
  @api records = [];

  get cards() {
    return (this.records || []).map((wo) => this._enrich(wo));
  }

  _enrich(wo) {
    const durationMins = wo.durationMinutes || 0;
    const durationDisplay =
      durationMins >= 60
        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
        : durationMins > 0
          ? `${durationMins}m`
          : null;

    let schedDate = null;
    let schedTime = null;
    if (wo.schedStart) {
      const d = new Date(wo.schedStart);
      schedDate = d.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short"
      });
      schedTime = d.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }

    return {
      ...wo,
      wagonDisplay: wo.wagonNumber || wo.assetName || "—",
      isAssetFallback: !wo.wagonNumber && !!wo.assetName,
      subjectDisplay: wo.subject || "No description",
      workTypeDisplay: wo.workTypeName || null,
      flocDisplay: wo.flocDesc || null,
      sapDisplay: wo.sapWorkCenter || null,
      extIdDisplay: wo.externalId || null,
      durationDisplay,
      schedDate,
      schedTime,
      priorityClass: PRIORITY_CLASS[wo.priority] || "priority-badge medium",
      statusClass: STATUS_CLASS[wo.status] || "status-pill new",
      cardClass: "wo-card priority-" + (wo.priority || "medium").toLowerCase()
    };
  }

  handleCardClick(evt) {
    const id = evt.currentTarget.dataset.id;
    this.dispatchEvent(
      new CustomEvent("opendetail", { detail: { workOrderId: id } })
    );
  }
}
