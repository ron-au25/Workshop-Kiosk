import assert from "assert";
import {
  locateChecklistMark,
  locateLabelLine,
  splitTableComponent
} from "c/kioskPdfLocate";

describe("kioskPdfLocate: ported Digital Checklist behaviours", () => {
  test("locateChecklistMark scenarios", () => {
    function item(t, x, y, w = 0.04, h = 0.014) {
      return { t, x, y, w, h };
    }

    const brackets = [
      item("Arm Assembly", 0.08, 0.4, 0.16),
      item("( )", 0.62, 0.4, 0.03),
      item("OK", 0.66, 0.4, 0.03),
      item("[ ]", 0.78, 0.4, 0.03),
      item("Att", 0.82, 0.4, 0.03)
    ];

    const yesNo = [
      item("Pump inspection", 0.06, 0.22, 0.18),
      item("Yes", 0.55, 0.22, 0.04),
      item("☐", 0.6, 0.22, 0.02),
      item("No", 0.7, 0.22, 0.03),
      item("☐", 0.74, 0.22, 0.02)
    ];

    const table = [
      item("DIAMETER", 0.55, 0.18, 0.1),
      item("WIDTH", 0.78, 0.18, 0.08),
      item("OUTGO RIGHT", 0.06, 0.46, 0.16),
      item("INGO LEFT", 0.06, 0.62, 0.14)
    ];

    const otherForm = [
      item("Guard check", 0.1, 0.3, 0.12),
      item("Pass", 0.58, 0.3, 0.05),
      item("(", 0.66, 0.3, 0.01),
      item(")", 0.7, 0.3, 0.01),
      item("Fail", 0.76, 0.3, 0.04),
      item("{", 0.82, 0.3, 0.01),
      item("}", 0.86, 0.3, 0.01)
    ];

    function tickX(mark) {
      return mark.x + mark.size / 0.707 / 2;
    }

    const ok = locateChecklistMark(
      brackets,
      {
        componentName: "3085CD5CPOSAARMA - Arm Assembly: Train Positioner",
        status: "Ok",
        positionPercent: 40
      },
      0.707
    );
    assert.equal(ok.kind, "stamp");
    assert.ok(
      Math.abs(tickX(ok) - 0.635) < 0.03,
      "tick sits in the OK brackets"
    );

    const att = locateChecklistMark(
      brackets,
      {
        componentName: "Arm Assembly: Train Positioner",
        status: "Attention",
        positionPercent: 40
      },
      0.707
    );
    assert.ok(
      Math.abs(tickX(att) - 0.795) < 0.03,
      "tick sits in the Att brackets"
    );

    const cleared = locateChecklistMark(
      brackets,
      {
        componentName: "Arm Assembly",
        status: null
      },
      0.707
    );
    assert.equal(cleared, null);

    const yes = locateChecklistMark(
      yesNo,
      {
        componentName: "Pump inspection",
        status: "Ok"
      },
      0.707
    );
    assert.ok(
      Math.abs(tickX(yes) - 0.61) < 0.03,
      "tick sits on the Yes checkbox"
    );

    const no = locateChecklistMark(
      yesNo,
      {
        componentName: "Pump inspection",
        status: "Attention"
      },
      0.707
    );
    assert.ok(
      Math.abs(tickX(no) - 0.75) < 0.03,
      "tick sits on the No checkbox"
    );

    const measure = locateChecklistMark(
      table,
      {
        isTableCell: true,
        rowHeader: "OUTGO RIGHT",
        columnHeader: "DIAMETER",
        measureText: "12.5",
        positionPercent: 52
      },
      0.707
    );
    assert.equal(measure.kind, "text");
    assert.equal(measure.text, "12.5");
    assert.ok(
      Math.abs(measure.y + measure.fontSize / 2 - 0.467) < 0.03,
      "number is on the row"
    );
    assert.ok(measure.x > 0.5 && measure.x < 0.7, "number is under DIAMETER");

    const otherColumn = locateChecklistMark(
      table,
      {
        isTableCell: true,
        rowHeader: "INGO LEFT",
        columnHeader: "WIDTH",
        measureText: "3"
      },
      0.707
    );
    assert.ok(otherColumn.x > 0.75, "number is under WIDTH");

    const missingColumn = locateChecklistMark(
      table,
      {
        isTableCell: true,
        rowHeader: "OUTGO RIGHT",
        columnHeader: "THICKNESS",
        measureText: "1"
      },
      0.707
    );
    assert.equal(missingColumn, null);

    const pass = locateChecklistMark(
      otherForm,
      {
        componentName: "Guard check",
        status: "Ok"
      },
      0.707
    );
    assert.ok(
      Math.abs(tickX(pass) - 0.685) < 0.03,
      "tick sits in the Pass parentheses"
    );

    const tightRows = [
      "Ingo West",
      "Ingo East",
      "Outgo East",
      "Outgo West"
    ].flatMap((name, index) => {
      const y = 0.4 + index * 0.03;
      return [
        item("Roller " + name + " Long Travel", 0.06, y, 0.22, 0.012),
        item("( )", 0.62, y, 0.03, 0.012),
        item("OK", 0.66, y, 0.03, 0.012),
        item("[ ]", 0.78, y, 0.03, 0.012),
        item("Att", 0.82, y, 0.03, 0.012)
      ];
    });
    const secondRow = locateChecklistMark(
      tightRows,
      {
        componentName: "Roller Ingo East Long Travel Train Pos",
        status: "Attention"
      },
      0.707
    );
    assert.ok(
      Math.abs(secondRow.y + secondRow.size / 2 - 0.436) < 0.008,
      "tick stays on the second row"
    );

    const wideLabel = [
      item("DIAMETER", 0.55, 0.2, 0.08, 0.012),
      item("INGO LEFT", 0.06, 0.46, 0.55, 0.012)
    ];
    const wideMeasure = locateChecklistMark(
      wideLabel,
      {
        isTableCell: true,
        rowHeader: "INGO LEFT",
        columnHeader: "DIAMETER",
        measureText: "56"
      },
      0.707
    );
    assert.equal(wideMeasure.kind, "text");
    assert.ok(
      wideMeasure.x > 0.5 && wideMeasure.x < 0.7,
      "number stays under DIAMETER when the row label is wide"
    );

    const pictured = [
      item("ck", 0.105, 0.028, 0.039, 0.05),
      item("ment", 0.223, 0.028, 0.096, 0.05),
      item("FIankw", 0.367, 0.028, 0.148, 0.05),
      item("surement", 0.669, 0.028, 0.181, 0.05),
      item("(mmj", 0.861, 0.028, 0.096, 0.05),
      item("Segment", 0.09, 0.084, 0.166, 0.05),
      item("1", 0.268, 0.084, 0.018, 0.05),
      item("Segment", 0.093, 0.14, 0.163, 0.05),
      item("2", 0.268, 0.14, 0.018, 0.05),
      item("Segment4", 0.093, 0.255, 0.193, 0.05)
    ];
    const flank = locateChecklistMark(
      pictured,
      {
        isTableCell: true,
        rowHeader: "Segment 1",
        columnHeader: "Flank Wear Measurement (mm)",
        measureText: "25"
      },
      0.707
    );
    assert.equal(flank.kind, "text");
    assert.equal(flank.text, "25");
    assert.ok(
      flank.x > 0.45 && flank.x < 0.8,
      "number sits in the wear column"
    );
    const secondSegment = locateChecklistMark(
      pictured,
      {
        isTableCell: true,
        rowHeader: "Segment 2",
        columnHeader: "Flank Wear Measurement (mm)",
        measureText: "69"
      },
      0.707
    );
    assert.ok(secondSegment.y > flank.y, "segment 2 is below segment 1");
    const glued = locateChecklistMark(
      pictured,
      {
        isTableCell: true,
        rowHeader: "Segment 4",
        columnHeader: "Flank Wear Measurement (mm)",
        measureText: "4"
      },
      0.707
    );
    assert.equal(glued.text, "4");

    const rack = [
      item("ck", 0.105, 0.028, 0.039, 0.05),
      item("ment", 0.223, 0.028, 0.096, 0.05),
      item("FIankw", 0.367, 0.028, 0.148, 0.05),
      item("surement", 0.669, 0.028, 0.181, 0.05),
      item("(mmj", 0.861, 0.028, 0.096, 0.05),
      item("Segment", 0.09, 0.084, 0.166, 0.05),
      item("1", 0.268, 0.084, 0.018, 0.05),
      item("Segment", 0.093, 0.14, 0.163, 0.05),
      item("2", 0.268, 0.14, 0.018, 0.05),
      item("Segment", 0.093, 0.196, 0.163, 0.05),
      item("3", 0.268, 0.196, 0.018, 0.05),
      item("Segment4", 0.093, 0.255, 0.193, 0.05),
      item("S6gment5", 0.093, 0.311, 0.193, 0.05),
      item("ment", 0.16, 0.367, 0.09, 0.05),
      item("6", 0.268, 0.367, 0.018, 0.05),
      item("S08m0nt", 0.093, 0.423, 0.16, 0.05),
      item("7", 0.268, 0.423, 0.018, 0.05),
      item("Sa8m0nt", 0.093, 0.479, 0.16, 0.05),
      item("8", 0.265, 0.479, 0.018, 0.05),
      item("Sagmant9", 0.093, 0.535, 0.18, 0.05),
      item("S08mant", 0.084, 0.591, 0.16, 0.05),
      item("I0", 0.259, 0.591, 0.03, 0.05),
      item("S0gment", 0.084, 0.647, 0.16, 0.05),
      item("J1", 0.259, 0.647, 0.03, 0.05),
      item("5egment", 0.084, 0.703, 0.16, 0.05),
      item("12", 0.259, 0.703, 0.03, 0.05),
      item("5egment", 0.081, 0.759, 0.16, 0.05),
      item("13", 0.259, 0.759, 0.03, 0.05),
      item("Segment", 0.081, 0.815, 0.16, 0.05),
      item("Segment", 0.081, 0.871, 0.16, 0.05),
      item("Segment", 0.081, 0.927, 0.16, 0.05),
      item("16", 0.259, 0.927, 0.03, 0.05)
    ];
    const rackMarks = [];
    for (let segment = 1; segment <= 16; segment += 1) {
      const mark = locateChecklistMark(
        rack,
        {
          isTableCell: true,
          rowHeader: "Segment " + segment,
          columnHeader: "Flank Wear Measurement (mm)",
          measureText: String(segment)
        },
        0.707
      );
      assert.ok(mark, "segment " + segment + " has a cell");
      assert.equal(mark.text, String(segment));
      assert.ok(
        mark.x > 0.45 && mark.x < 0.8,
        "segment " + segment + " stays in the wear column"
      );
      rackMarks.push(mark);
    }
    for (let index = 1; index < rackMarks.length; index += 1) {
      assert.ok(
        rackMarks[index].y > rackMarks[index - 1].y,
        "segment " + (index + 1) + " is below the previous row"
      );
    }

    const barrel = [
      item("8ackIa.h", 0.184, 0.253, 0.12),
      item("2-8mm", 0.317, 0.253, 0.09),
      item("mm", 0.465, 0.253, 0.05),
      item("BarreI", 0.443, 0.692, 0.044),
      item("-ition", 0.493, 0.692, 0.062),
      item("Measure-nt", 0.67, 0.692, 0.109),
      item("(mmj", 0.784, 0.692, 0.041),
      item("FIankWear", 0.209, 0.715, 0.087),
      item("Back", 0.216, 0.738, 0.034),
      item("Lash", 0.256, 0.738, 0.032),
      item("RooLcIeaIance", 0.194, 0.762, 0.115)
    ];
    const barrelRows = ["Flank Wear", "Back Lash", "Root Clearance"];
    const barrelMarks = barrelRows.map((rowHeader) => {
      const mark = locateChecklistMark(
        barrel,
        {
          isTableCell: true,
          rowHeader,
          columnHeader: "Measurement (mm)",
          measureText: "12",
          positionPercent: 73
        },
        0.707
      );
      assert.ok(mark, rowHeader + " lands in Measurement (mm)");
      assert.ok(
        mark.x > 0.6 && mark.x < 0.8,
        rowHeader + " stays in the measurement column"
      );
      return mark;
    });
    assert.ok(
      barrelMarks[1].y > barrelMarks[0].y &&
        barrelMarks[2].y > barrelMarks[1].y,
      "barrel rows stay in order"
    );
    const barrelColumn = locateChecklistMark(
      barrel,
      {
        isTableCell: true,
        rowHeader: "Back Lash",
        columnHeader: "Barrel Position",
        measureText: "4",
        positionPercent: 73
      },
      0.707
    );
    assert.ok(
      barrelColumn && barrelColumn.x < 0.6,
      "Barrel Position is the other column"
    );

    const blank = locateChecklistMark(
      [],
      {
        componentName: "Arm Assembly",
        status: "Ok",
        positionPercent: 40
      },
      0.707
    );
    assert.equal(blank, null);

    console.log("locate checks passed");
  });
});

function it(t, x, y, w = 0.2, h = 0.014) {
  return { t, x, y, w, h };
}

describe("locateLabelLine", () => {
  test("exact match boxes the whole line", () => {
    const items = [
      it("Wheel Tread", 0.1, 0.3, 0.2),
      it("12.5", 0.5, 0.3, 0.05),
      it("Other", 0.1, 0.6)
    ];
    const box = locateLabelLine(items, "Wheel Tread");
    expect(box).not.toBeNull();
    expect(box.x).toBeCloseTo(0.1, 3);
    expect(box.y).toBeCloseTo(0.3, 3);
    expect(box.w).toBeCloseTo(0.45, 3);
    expect(box.h).toBeCloseTo(0.014, 3);
  });
  test("fuzzy match still finds the line", () => {
    const items = [
      it("Wheel Tred Profile", 0.1, 0.4, 0.3),
      it("Axle Journal", 0.1, 0.7, 0.2)
    ];
    const box = locateLabelLine(items, "Wheel Tread Profile");
    expect(box).not.toBeNull();
    expect(box.y).toBeCloseTo(0.4, 3);
  });
  test("two same labels: picks the one nearest positionPercent", () => {
    const items = [it("Brake Pad", 0.1, 0.2), it("Brake Pad", 0.1, 0.8)];
    expect(locateLabelLine(items, "Brake Pad", "80%").y).toBeCloseTo(0.8, 3);
    expect(locateLabelLine(items, "Brake Pad", 0.2).y).toBeCloseTo(0.2, 3);
  });
  test("no match or empty input -> null", () => {
    expect(
      locateLabelLine([it("Something else", 0.1, 0.5)], "Zzzz Qqqq")
    ).toBeNull();
    expect(locateLabelLine([], "Brake Pad")).toBeNull();
    expect(locateLabelLine([it("A", 0.1, 0.1)], "")).toBeNull();
  });
});

describe("splitTableComponent", () => {
  test('splits at the last " - "', () => {
    expect(splitTableComponent("Wheel - Tread - Flange Wear")).toEqual({
      row: "Wheel - Tread",
      column: "Flange Wear"
    });
  });
  test("no separator -> column null", () => {
    expect(splitTableComponent("Brake Pad")).toEqual({
      row: "Brake Pad",
      column: null
    });
    expect(splitTableComponent(null)).toEqual({ row: "", column: null });
  });
});
