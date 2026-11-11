import {
  woStatus,
  assetStatus,
  woNextStep,
  workpackNextStep,
  COLORS
} from "c/kioskStatus";

const row = (o) =>
  Object.assign(
    {
      id: "a",
      number: "1",
      assetName: "Ax",
      status: "New",
      stepsDone: 0,
      stepsTotal: 0,
      measuresTaken: 0,
      measuresTotal: 0,
      findings: 0,
      bareFindings: 0,
      partsUsed: 0,
      partsRequired: 0
    },
    o
  );

describe("woStatus", () => {
  test("Completed status is green", () =>
    expect(woStatus(row({ status: "Completed" }))).toBe("green"));
  test("all done with a requirement is green", () =>
    expect(
      woStatus(
        row({
          stepsDone: 2,
          stepsTotal: 2,
          measuresTaken: 3,
          measuresTotal: 3,
          partsUsed: 1,
          partsRequired: 1
        })
      )
    ).toBe("green"));
  test("no requirements is not green", () =>
    expect(woStatus(row())).toBe("grey"));
  test("pending measures block green", () =>
    expect(
      woStatus(
        row({ stepsDone: 1, stepsTotal: 1, measuresTaken: 1, measuresTotal: 2 })
      )
    ).toBe("amber"));
  test("short parts block green", () =>
    expect(
      woStatus(
        row({ stepsDone: 1, stepsTotal: 1, partsUsed: 0, partsRequired: 2 })
      )
    ).toBe("amber"));
  test("findings make red when not done", () =>
    expect(
      woStatus(row({ measuresTaken: 1, measuresTotal: 2, findings: 1 }))
    ).toBe("red"));
  test("In Progress is amber", () =>
    expect(woStatus(row({ status: "In Progress", stepsTotal: 2 }))).toBe(
      "amber"
    ));
  test("any step done is amber", () =>
    expect(woStatus(row({ stepsDone: 1, stepsTotal: 3 }))).toBe("amber"));
  test("any measure taken is amber", () =>
    expect(woStatus(row({ measuresTaken: 1, measuresTotal: 3 }))).toBe(
      "amber"
    ));
  test("untouched is grey", () =>
    expect(woStatus(row({ stepsTotal: 3, measuresTotal: 2 }))).toBe("grey"));
  test("a finding on a fully done WO stays green", () =>
    expect(
      woStatus(
        row({
          stepsDone: 1,
          stepsTotal: 1,
          measuresTaken: 1,
          measuresTotal: 1,
          findings: 1
        })
      )
    ).toBe("green"));
});

describe("assetStatus", () => {
  test("empty is grey", () => expect(assetStatus([])).toBe("grey"));
  test("any red is red", () =>
    expect(assetStatus(["green", "red", "grey"])).toBe("red"));
  test("all green is green", () =>
    expect(assetStatus(["green", "green"])).toBe("green"));
  test("mixed non-grey is amber", () =>
    expect(assetStatus(["green", "grey"])).toBe("amber"));
  test("all grey is grey", () =>
    expect(assetStatus(["grey", "grey"])).toBe("grey"));
});

describe("woNextStep", () => {
  test("measures first", () =>
    expect(
      woNextStep(
        row({
          measuresTotal: 3,
          measuresTaken: 1,
          bareFindings: 1,
          findings: 1
        })
      ).action
    ).toBe("measure"));
  test("bare finding next", () =>
    expect(
      woNextStep(
        row({
          measuresTotal: 1,
          measuresTaken: 1,
          findings: 1,
          bareFindings: 1
        })
      ).action
    ).toBe("comment"));
  test("steps next", () =>
    expect(woNextStep(row({ stepsTotal: 3, stepsDone: 1 })).action).toBe(
      "execute"
    ));
  test("parts next", () =>
    expect(
      woNextStep(
        row({ stepsTotal: 1, stepsDone: 1, partsRequired: 2, partsUsed: 1 })
      ).action
    ).toBe("parts"));
  test("no requirements", () => expect(woNextStep(row()).action).toBe("notes"));
  test("complete", () =>
    expect(woNextStep(row({ stepsTotal: 1, stepsDone: 1 })).action).toBeNull());
});

describe("workpackNextStep", () => {
  test("bare finding on workpack wins", () => {
    const r = workpackNextStep(
      row({ id: "wp", number: "WP1", bareFindings: 1, findings: 1 }),
      [row({ id: "c1", measuresTotal: 2 })]
    );
    expect(r.woId).toBe("wp");
    expect(r.tone).toBe("warn");
    expect(r.text).toContain("(workpack)");
  });
  test("bare finding on a child", () => {
    const r = workpackNextStep(null, [
      row({ id: "c1", number: "5", bareFindings: 1, findings: 1 })
    ]);
    expect(r.woId).toBe("c1");
    expect(r.text).not.toContain("(workpack)");
  });
  test("children still to measure", () => {
    const r = workpackNextStep(null, [
      row({ id: "c1", number: "5", assetName: "Axle" }),
      row({ id: "c2", number: "6", measuresTotal: 2 })
    ]);
    expect(r.woId).toBe("c2");
    expect(r.text).toContain("1 child work order still to measure");
  });
  test("first open child, needs-attention first", () => {
    const r = workpackNextStep(null, [
      row({ id: "g", number: "1", status: "Completed" }),
      row({ id: "am", number: "2", stepsTotal: 2, stepsDone: 1 }),
      row({
        id: "rd",
        number: "3",
        stepsTotal: 1,
        measuresTotal: 1,
        measuresTaken: 1,
        findings: 1,
        bareFindings: 0
      })
    ]);
    expect(r.woId).toBe("rd");
    expect(r.action).toBe("openAR");
  });
  test("all complete -> execute", () => {
    const r = workpackNextStep(null, [row({ id: "g", status: "Completed" })]);
    expect(r.action).toBe("execute");
    expect(r.tone).toBe("ok");
  });
});

test("colors", () => expect(COLORS.green).toBe("#21C07A"));
