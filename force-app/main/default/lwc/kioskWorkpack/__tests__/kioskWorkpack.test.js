import { createElement } from "lwc";
import KioskWorkpack from "c/kioskWorkpack";
import getWorkpackChildProgress from "@salesforce/apex/KioskController.getWorkpackChildProgress";
import getWorkpackProgress from "@salesforce/apex/KioskController.getWorkpackProgress";
import getWorkpackTimeRecords from "@salesforce/apex/KioskController.getWorkpackTimeRecords";
import getRaisedTasks from "@salesforce/apex/KioskController.getRaisedTasks";
import getWorkOrderTile from "@salesforce/apex/KioskController.getWorkOrderTile";

jest.mock(
  "@salesforce/apex/KioskController.getWorkpackChildProgress",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/KioskController.getWorkpackProgress",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/KioskController.getWorkpackTimeRecords",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/KioskController.getRaisedTasks",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/KioskController.getWorkOrderTile",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const row = (id, number, over) => ({
  id,
  number,
  subject: "S " + number,
  status: "New",
  workTypeName: "Wagon PM01",
  assetId: "a",
  assetName: "Axle",
  l2AssetId: null,
  l2AssetName: "Wheelset 1",
  stepsDone: 0,
  stepsTotal: 2,
  measuresTaken: 0,
  measuresTotal: 3,
  findings: 0,
  bareFindings: 0,
  partsUsed: 0,
  partsRequired: 0,
  ...over
});

const flush = () => Promise.resolve().then(() => Promise.resolve());

async function mount() {
  const el = createElement("c-kiosk-workpack", { is: KioskWorkpack });
  el.sessionToken = "t";
  el.workpackId = "wp1";
  el.detail = {
    subject: "Workpack",
    assetId: "a0",
    assetName: "Wagon",
    workPlans: [],
    lineItems: []
  };
  document.body.appendChild(el);
  await flush();
  await flush();
  return el;
}

describe("c-kiosk-workpack", () => {
  beforeEach(() => {
    getWorkpackChildProgress.mockResolvedValue(
      JSON.stringify([
        row("g", "G1", { stepsDone: 2, measuresTaken: 3 }),
        row("r", "R1", { measuresTaken: 1, findings: 1 }),
        row("n", "N1")
      ])
    );
    getWorkpackProgress.mockResolvedValue(null);
    getWorkpackTimeRecords.mockResolvedValue("[]");
    getRaisedTasks.mockResolvedValue([]);
    getWorkOrderTile.mockResolvedValue("{}");
  });
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("lists all children, red first, green last", async () => {
    const el = await mount();
    el.showTab("orders");
    await flush();
    const nums = Array.from(el.shadowRoot.querySelectorAll(".crow .num b")).map(
      (b) => b.textContent.trim()
    );
    expect(nums).toEqual(["R1", "N1", "G1"]);
  });

  it("opens Asset Review on the tapped work order", async () => {
    const el = await mount();
    el.showTab("orders");
    await flush();
    const handler = jest.fn();
    el.addEventListener("openassetreview", handler);
    el.shadowRoot.querySelector(".crow").click();
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.workOrderId).toBe("r");
  });

  it("status filter narrows the list", async () => {
    const el = await mount();
    el.showTab("orders");
    await flush();
    el.shadowRoot.querySelector('.lgb[data-status="green"]').click();
    await flush();
    expect(el.shadowRoot.querySelectorAll(".crow").length).toBe(1);
  });
});
