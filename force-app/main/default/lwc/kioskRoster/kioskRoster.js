import { LightningElement, api, track } from "lwc";
import getTerritoryRoster from "@salesforce/apex/KioskController.getTerritoryRoster";

export default class KioskRoster extends LightningElement {
  @api territoryId;
  @track roster = [];
  @track searchTerm = "";
  @track isLoading = true;
  @track hasError = false;
  @track errorMessage = "";

  connectedCallback() {
    this.loadRoster();
  }

  async loadRoster() {
    this.isLoading = true;
    this.hasError = false;
    try {
      const raw = await getTerritoryRoster({ territoryId: this.territoryId });
      this.roster = raw.map((r) => this._enrich(r));
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      this.hasError = true;
      this.errorMessage =
        "Failed to load workers. Check your connection and try again.";
    } finally {
      this.isLoading = false;
    }
  }

  _enrich(r) {
    const nameParts = (r.name || "").trim().split(" ");
    const initials =
      nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : (r.name || "??").substring(0, 2).toUpperCase();
    const hasPhoto = !!r.photoUrl;
    return {
      ...r,
      needsPin: r.hasPin === false,
      initials,
      hasPhoto,
      roleLabel: r.ganttLabel || r.role || "Technician",
      tileClass: "roster-tile" + (r.isLocked ? " locked" : ""),
      ariaLabel: r.isLocked
        ? `${r.name} — account locked`
        : `Sign in as ${r.name}`
    };
  }

  handleSearch(evt) {
    this.searchTerm = evt.target.value;
  }

  handleSearchKeydown(evt) {
    evt.stopPropagation();
  }

  handleTileClick(evt) {
    const id = evt.currentTarget.dataset.id;
    const worker = this.roster.find((r) => r.resourceId === id);
    if (worker && !worker.isLocked) {
      this.dispatchEvent(new CustomEvent("workerselected", { detail: worker }));
    }
  }

  get filteredRoster() {
    if (!this.searchTerm) return this.roster;
    const term = this.searchTerm.toLowerCase();
    return this.roster.filter((r) => r.name.toLowerCase().includes(term));
  }

  get isEmpty() {
    return (
      !this.isLoading && !this.hasError && this.filteredRoster.length === 0
    );
  }
}
