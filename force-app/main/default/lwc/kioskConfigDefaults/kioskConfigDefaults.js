/** Kiosk config keys, defaults (spec §3.2) and field catalogues. Shared by workshopPortal and kioskConfig. */

export const ASSET_FIELDS = [
  ["Name", "Asset Name"],
  ["SerialNumber", "Serial Number"],
  ["Status", "Status"],
  ["Asset_Type__c", "Asset Type"],
  ["FLOC__c", "FLOC"],
  ["Entitlement_Status__c", "Warranty Status"],
  ["InstallDate", "Install Date"],
  ["PurchaseDate", "Purchase Date"]
];

export const WO_FIELDS = [
  ["WorkOrderNumber", "WO Number"],
  ["WorkType", "Work Type"],
  ["Status", "Status"],
  ["Priority", "Priority"],
  ["StartDate", "Start"],
  ["SAP_FLOC_Desc__c", "Component (FLOC)"],
  ["SAP_Work_Center__c", "Work Center"],
  ["Est_Labour_Hours__c", "Est. Labour Hrs"],
  ["Est_Parts_Cost__c", "Est. Parts Cost"],
  ["Critical_Path__c", "Critical Path"],
  ["Shut_Scope__c", "Shut Scope"],
  ["Basic_Finish_Date__c", "Basic Finish"]
];

export const RINGS = [
  ["steps", "Steps"],
  ["measures", "Measures"],
  ["labour", "Labour"],
  ["parts", "Parts"],
  ["partsCost", "Parts Cost"],
  ["components", "Components"]
];

export function defaults() {
  return {
    assetTile: ["SerialNumber", "Status", "Asset_Type__c", "FLOC__c"],
    assetDrawer: {
      Name: "R",
      SerialNumber: "E",
      Status: "E",
      Asset_Type__c: "R",
      FLOC__c: "R",
      Entitlement_Status__c: "R",
      InstallDate: "R",
      PurchaseDate: "R"
    },
    woTile: [
      "WorkType",
      "Status",
      "Priority",
      "SAP_FLOC_Desc__c",
      "Est_Labour_Hours__c"
    ],
    wtFilter: true,
    wpTile: [
      "WorkType",
      "Status",
      "Priority",
      "SAP_Work_Center__c",
      "Est_Labour_Hours__c",
      "Basic_Finish_Date__c"
    ],
    wpNext: true,
    wpProgress: "open",
    wpRings: [
      "steps",
      "measures",
      "labour",
      "parts",
      "partsCost",
      "components"
    ],
    wpOps: true,
    wpTime: true,
    wpRaised: true,
    wpView: "list"
  };
}

const LISTS = ["assetTile", "woTile", "wpTile", "wpRings"];
const BOOLS = ["wtFilter", "wpNext", "wpOps", "wpTime", "wpRaised"];
const ENUMS = {
  wpProgress: ["open", "collapsed", "off"],
  wpView: ["list", "board"]
};

/** Merge a saved settings object (or JSON string) over the defaults. Bad or unknown values are ignored. */
export function mergeConfig(saved) {
  const out = defaults();
  let src = saved;
  if (typeof src === "string") {
    try {
      src = JSON.parse(src);
    } catch {
      return out;
    }
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return out;
  }
  LISTS.forEach((k) => {
    if (Array.isArray(src[k]) && src[k].every((v) => typeof v === "string")) {
      out[k] = src[k].slice();
    }
  });
  BOOLS.forEach((k) => {
    if (typeof src[k] === "boolean") {
      out[k] = src[k];
    }
  });
  Object.keys(ENUMS).forEach((k) => {
    if (ENUMS[k].includes(src[k])) {
      out[k] = src[k];
    }
  });
  const d = src.assetDrawer;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const m = {};
    Object.keys(d).forEach((f) => {
      if (d[f] === "R" || d[f] === "E") {
        m[f] = d[f];
      }
    });
    out.assetDrawer = m;
  }
  return out;
}
