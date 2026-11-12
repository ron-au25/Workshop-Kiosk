import { LightningElement, api } from "lwc";
import saveKioskConfig from "@salesforce/apex/KioskController.saveKioskConfig";
import {
  ASSET_FIELDS,
  WO_FIELDS,
  RINGS,
  defaults,
  mergeConfig
} from "c/kioskConfigDefaults";

const CATS = [
  [
    "Asset Review",
    [
      ["ar_asset", "Asset title tile"],
      ["ar_drawer", "Asset details drawer"],
      ["ar_wo", "Work order title tile"]
    ]
  ],
  [
    "Workpack page",
    [
      ["wp_tile", "Header tile"],
      ["wp_next", "Next step"],
      ["wp_prog", "Progress panel"],
      ["wp_tabs", "Tabs"],
      ["wp_child", "Work orders tab"]
    ]
  ],
  ["Shared", [["sh_wtf", "Work type focus filter"]]],
  ["Workers", [["workers", "Worker PINs"]]]
];

export default class KioskConfig extends LightningElement {
  @api sessionToken;

  draft = defaults();
  section = "ar_asset";
  saving = false;
  dirty = false;
  message = "";
  isError = false;

  _config;

  @api
  get config() {
    return this._config;
  }
  set config(v) {
    this._config = v;
    if (!this.dirty) {
      this.draft = mergeConfig(v);
    }
  }

  // ─── view model ──────────────────────────────────────────────────────────

  get categories() {
    return CATS.map(([name, subs]) => ({
      name,
      items: subs.map(([key, label]) => ({
        key,
        label,
        cls: "cn" + (key === this.section ? " on" : "")
      }))
    }));
  }

  get isWorkers() {
    return this.section === "workers";
  }

  get crumb() {
    for (const [cat, subs] of CATS) {
      const hit = subs.find((s) => s[0] === this.section);
      if (hit) return cat + " › " + hit[1];
    }
    return "";
  }

  listRows(key, catalogue, exclude) {
    const sel = this.draft[key];
    return catalogue
      .filter((c) => c[0] !== exclude)
      .map(([f, l]) => {
        const i = sel.indexOf(f);
        return {
          f,
          label: l,
          on: i >= 0,
          order: i + 1,
          cbCls: "cb" + (i >= 0 ? " on" : ""),
          mark: i >= 0 ? "✓" : ""
        };
      });
  }

  boolRow(key, label, code) {
    const on = !!this.draft[key];
    return {
      key,
      label,
      code,
      cbCls: "cb" + (on ? " on" : ""),
      mark: on ? "✓" : ""
    };
  }

  segRow(key, label, options) {
    return {
      key,
      label,
      options: options.map(([v, l]) => ({
        v,
        l,
        cls: this.draft[key] === v ? "on" : ""
      }))
    };
  }

  get blocks() {
    const b = (o) => o;
    switch (this.section) {
      case "ar_asset":
        return [
          b({
            id: "a1",
            isList: true,
            title: "Fields",
            sub: "Shown next to the selected asset name on Asset Review. ▲▼ = order.",
            listKey: "assetTile",
            rows: this.listRows("assetTile", ASSET_FIELDS, "Name")
          })
        ];
      case "ar_drawer":
        return [
          b({
            id: "d1",
            isDrawer: true,
            title: "Fields",
            sub: "Shown in ⓘ Asset details. Read = view only, Edit = kiosk can change it.",
            rows: ASSET_FIELDS.map(([f, l]) => {
              const m = this.draft.assetDrawer[f] || "";
              return {
                f,
                label: l,
                on: !!m,
                cbCls: "cb" + (m ? " on" : ""),
                mark: m ? "✓" : "",
                readCls: m === "R" ? "on" : "",
                editCls: m === "E" ? "on" : ""
              };
            })
          })
        ];
      case "ar_wo":
        return [
          b({
            id: "w1",
            isList: true,
            title: "Fields",
            sub: "Shown under the WO number in the Asset Review workspace.",
            listKey: "woTile",
            rows: this.listRows("woTile", WO_FIELDS, "WorkOrderNumber")
          })
        ];
      case "wp_tile":
        return [
          b({
            id: "t1",
            isList: true,
            title: "Fields",
            sub: "Shown under the workpack name.",
            listKey: "wpTile",
            rows: this.listRows("wpTile", WO_FIELDS, "WorkOrderNumber")
          })
        ];
      case "wp_next":
        return [
          b({
            id: "n1",
            isBools: true,
            title: "Next step band",
            sub: "Tells the worker what to do next on the whole workpack.",
            bools: [this.boolRow("wpNext", "Show next step", "wpNext")]
          })
        ];
      case "wp_prog":
        return [
          b({
            id: "p1",
            isSeg: true,
            title: "Default state",
            sub: "Workers can still Show / Hide it on the page.",
            seg: this.segRow("wpProgress", "Progress panel", [
              ["open", "Open"],
              ["collapsed", "Summary line"],
              ["off", "Hidden"]
            ])
          }),
          b({
            id: "p2",
            isList: true,
            noOrder: true,
            title: "Rings",
            sub: "Overall % is the mean of the rings shown that have data.",
            listKey: "wpRings",
            rows: this.listRows("wpRings", RINGS)
          })
        ];
      case "wp_tabs":
        return [
          b({
            id: "b1",
            isBools: true,
            title: "Optional tabs",
            sub: "Order: Notes & codes · Execute · Work orders · Operations · Time records · Raised tasks. The first three are always on.",
            bools: [
              this.boolRow("wpOps", "Operations", "WorkOrderLineItem"),
              this.boolRow("wpTime", "Time records", "Time_Report__c"),
              this.boolRow(
                "wpRaised",
                "Raised tasks",
                "WorkOrder.Raised_Task__c"
              )
            ]
          })
        ];
      case "wp_child":
        return [
          b({
            id: "c1",
            isSeg: true,
            title: "Work orders tab",
            sub: "Child work order progress list.",
            seg: this.segRow("wpView", "Default view", [
              ["list", "List"],
              ["board", "Board"]
            ])
          }),
          b({
            id: "c2",
            isBools: true,
            title: "Focus chips",
            sub: "",
            bools: [
              this.boolRow(
                "wtFilter",
                "Show work type focus chips in this tab",
                "wtFilter (shared)"
              )
            ]
          })
        ];
      case "sh_wtf":
        return [
          b({
            id: "s1",
            isBools: true,
            title: "Work type focus filter",
            sub: "Multi-select chips built from the WorkTypes of WOs under the workpack. Shown above the asset map on Asset Review and inside the Work orders tab.",
            bools: [
              this.boolRow("wtFilter", "Enable work type filter", "wtFilter")
            ]
          })
        ];
      default:
        return [];
    }
  }

  get saveDisabled() {
    return this.saving || !this.dirty;
  }
  get saveLabel() {
    return this.saving ? "Saving…" : "Save";
  }
  get messageCls() {
    return "msg" + (this.isError ? " err" : "");
  }

  // ─── handlers ────────────────────────────────────────────────────────────

  handleInputKeydown(evt) {
    evt.stopPropagation();
  }

  edit(mutator) {
    const next = JSON.parse(JSON.stringify(this.draft));
    mutator(next);
    this.draft = next;
    this.dirty = true;
    this.message = "";
  }

  handleSection(evt) {
    this.section = evt.currentTarget.dataset.key;
  }

  handleListToggle(evt) {
    const { key, f } = evt.currentTarget.dataset;
    this.edit((d) => {
      const i = d[key].indexOf(f);
      if (i >= 0) d[key].splice(i, 1);
      else d[key].push(f);
    });
  }

  handleMove(evt) {
    const { key, f, dir } = evt.currentTarget.dataset;
    this.edit((d) => {
      const a = d[key];
      const i = a.indexOf(f);
      const j = i + Number(dir);
      if (i < 0 || j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
    });
  }

  handleBool(evt) {
    const key = evt.currentTarget.dataset.key;
    this.edit((d) => {
      d[key] = !d[key];
    });
  }

  handleSeg(evt) {
    const { key, v } = evt.currentTarget.dataset;
    this.edit((d) => {
      d[key] = v;
    });
  }

  handleDrawerToggle(evt) {
    const f = evt.currentTarget.dataset.f;
    this.edit((d) => {
      if (d.assetDrawer[f]) delete d.assetDrawer[f];
      else d.assetDrawer[f] = "R";
    });
  }

  handleDrawerMode(evt) {
    const { f, m } = evt.currentTarget.dataset;
    this.edit((d) => {
      d.assetDrawer[f] = m;
    });
  }

  handleReset() {
    this.draft = defaults();
    this.dirty = true;
    this.message = "Defaults restored. Save to apply.";
    this.isError = false;
  }

  async handleSave() {
    this.saving = true;
    this.message = "";
    try {
      await saveKioskConfig({
        token: this.sessionToken,
        settingsJson: JSON.stringify(this.draft)
      });
      this.dirty = false;
      this.isError = false;
      this.message = "Saved. Applies to every kiosk on next page load.";
      this.dispatchEvent(
        new CustomEvent("configsaved", {
          detail: { config: mergeConfig(this.draft) }
        })
      );
    } catch (e) {
      this.isError = true;
      const m = (e && e.body && e.body.message) || (e && e.message) || "";
      this.message =
        m === "NOT_ALLOWED"
          ? "Only a Supervisor or Admin can save settings."
          : m === "SESSION_EXPIRED"
            ? "Session expired. Sign in again."
            : "Save failed: " + m;
    } finally {
      this.saving = false;
    }
  }
}
