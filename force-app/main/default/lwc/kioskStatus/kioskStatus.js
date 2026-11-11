/**
 * Status and next-step rules shared by the workpack page and Asset Review (spec §6).
 * Pure functions. Input rows are getWorkpackChildProgress rows (counts only).
 */

export const COLORS = {
  grey: "#5b6b7c",
  amber: "#F2B441",
  red: "#E5484D",
  green: "#21C07A"
};

// Sort order: needs attention first.
export const RANK = { red: 0, amber: 1, grey: 2, green: 3 };

const n = (v) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);

function counts(row) {
  const r = row || {};
  const measuresTotal = n(r.measuresTotal);
  const measuresTaken = n(r.measuresTaken);
  return {
    stepsDone: n(r.stepsDone),
    stepsTotal: n(r.stepsTotal),
    pending: Math.max(0, measuresTotal - measuresTaken),
    measuresTotal,
    measuresTaken,
    findings: n(r.findings),
    bare: n(r.bareFindings),
    short: n(r.partsUsed) < n(r.partsRequired),
    partsRequired: n(r.partsRequired)
  };
}

export function woStatus(row) {
  const c = counts(row);
  const hasRequirement =
    c.stepsTotal > 0 || c.measuresTotal > 0 || c.partsRequired > 0;
  const stepsOk = c.stepsTotal ? c.stepsDone === c.stepsTotal : true;
  const done = stepsOk && c.pending === 0 && !c.short && hasRequirement;
  if ((row && row.status === "Completed") || done) {
    return "green";
  }
  if (c.findings > 0) {
    return "red";
  }
  if (
    (row && row.status === "In Progress") ||
    c.stepsDone > 0 ||
    c.measuresTaken > 0
  ) {
    return "amber";
  }
  return "grey";
}

// Any red = red; all green = green; any non-grey = amber; else grey. Empty = grey.
export function assetStatus(statuses) {
  const list = statuses || [];
  if (!list.length) {
    return "grey";
  }
  if (list.includes("red")) {
    return "red";
  }
  if (list.every((s) => s === "green")) {
    return "green";
  }
  if (list.some((s) => s !== "grey")) {
    return "amber";
  }
  return "grey";
}

// Order: record measures -> comment bare finding -> next undone step -> consume parts -> no requirements -> complete.
export function woNextStep(row) {
  const c = counts(row);
  if (c.pending > 0) {
    return {
      text: "Record " + c.pending + " measure" + (c.pending > 1 ? "s" : ""),
      action: "measure"
    };
  }
  if (c.bare > 0) {
    return {
      text: "Add a comment to " + c.bare + " finding" + (c.bare > 1 ? "s" : ""),
      action: "comment"
    };
  }
  if (c.stepsTotal > c.stepsDone) {
    const left = c.stepsTotal - c.stepsDone;
    return {
      text: "Complete " + left + " work plan step" + (left > 1 ? "s" : ""),
      action: "execute"
    };
  }
  if (c.short) {
    return { text: "Consume required parts", action: "parts" };
  }
  if (!c.measuresTotal && !c.stepsTotal && !c.partsRequired) {
    return {
      text: "No requirements on this WO yet. Add notes, parts or measures",
      action: "notes"
    };
  }
  return { text: "Work order complete", action: null };
}

/**
 * Next step band on the workpack page (spec §5.1 item 2). workpack and children are rows
 * (the workpack row may be null when it has no own counts). Rows need id, number, assetName.
 */
export function workpackNextStep(workpack, children) {
  const kids = children || [];
  const bareRow = [workpack].concat(kids).find((r) => r && counts(r).bare > 0);
  if (bareRow) {
    const isWp = bareRow === workpack;
    return {
      tone: "warn",
      text:
        bareRow.number +
        (isWp ? " (workpack)" : "") +
        ": a finding has no comment",
      action: "openAR",
      woId: bareRow.id
    };
  }
  const toMeasure = kids.filter((r) => counts(r).pending > 0);
  if (toMeasure.length) {
    const first = toMeasure[0];
    return {
      tone: "",
      text:
        toMeasure.length +
        " child work order" +
        (toMeasure.length > 1 ? "s" : "") +
        " still to measure. Next: " +
        first.number +
        (first.assetName ? " · " + first.assetName : ""),
      action: "openAR",
      woId: first.id
    };
  }
  const open = kids
    .map((r) => ({ r, s: woStatus(r) }))
    .filter((e) => e.s !== "green")
    .sort((a, b) => RANK[a.s] - RANK[b.s])[0];
  if (open) {
    return {
      tone: "",
      text: open.r.number + ": " + woNextStep(open.r).text,
      action: "openAR",
      woId: open.r.id
    };
  }
  return {
    tone: "ok",
    text: "All child work orders complete. Run the release-to-traffic checks.",
    action: "execute",
    woId: null
  };
}
