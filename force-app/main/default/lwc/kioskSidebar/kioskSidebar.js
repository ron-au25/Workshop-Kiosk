import { LightningElement, api } from "lwc";

const VERSION = "v2.65";

export default class KioskSidebar extends LightningElement {
  version = VERSION;
  @api territoryName;
  @api supervisorName;
  @api activeNav = "dashboard";
  @api isPortrait = false;
  @api sidebarCollapsed = false;
  @api showSwitchUser = false;
  @api showAdminNav = false; // Supervisor/Admin only: Time Tracking and Config
  @api theme = "dark";

  get isExpanded() {
    return !this.sidebarCollapsed && !this.isPortrait;
  }
  get toggleIcon() {
    return this.isExpanded ? "◀" : "▶";
  }

  get sidebarClass() {
    let cls = "kiosk-sidebar";
    if (!this.isExpanded) cls += " collapsed";
    if (this.isPortrait) cls += " portrait-hidden";
    return cls;
  }

  get dashboardNavClass() {
    return "nav-item" + (this.activeNav === "dashboard" ? " active" : "");
  }
  get workordersNavClass() {
    return "nav-item" + (this.activeNav === "workorders" ? " active" : "");
  }
  get configNavClass() {
    return "nav-item" + (this.activeNav === "kioskconfig" ? " active" : "");
  }
  get isConfigActive() {
    return this.activeNav === "kioskconfig" ? "page" : "false";
  }
  get timeNavClass() {
    return "nav-item" + (this.activeNav === "timetracking" ? " active" : "");
  }
  get isDashboardActive() {
    return this.activeNav === "dashboard" ? "page" : "false";
  }
  get isWorkordersActive() {
    return this.activeNav === "workorders" ? "page" : "false";
  }
  get isTimeActive() {
    return this.activeNav === "timetracking" ? "page" : "false";
  }

  handleToggle() {
    this.dispatchEvent(new CustomEvent("toggle"));
  }
  handleSwitchUser() {
    this.dispatchEvent(new CustomEvent("switchuser"));
  }
  handleEndSession() {
    this.dispatchEvent(new CustomEvent("endsession"));
  }
  handleThemeToggle() {
    this.dispatchEvent(new CustomEvent("theme"));
  }

  get themeIcon() {
    return this.theme === "light" ? "🌙" : "☀";
  }
  get themeLabel() {
    return this.theme === "light" ? "Dark Mode" : "Light Mode";
  }

  handleNav(evt) {
    const nav = evt.currentTarget.dataset.nav;
    this.dispatchEvent(new CustomEvent("navigate", { detail: { nav } }));
  }
}
