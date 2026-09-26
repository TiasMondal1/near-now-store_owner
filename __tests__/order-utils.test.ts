import { formatStatus, getStatusTone, parseDbDate } from "../lib/order-utils";

describe("getStatusTone / formatStatus — review statuses", () => {
  it("maps approved to success / Approved", () => {
    expect(getStatusTone("approved")).toBe("success");
    expect(formatStatus("approved")).toBe("Approved");
  });

  it("maps under_review to warning / Under review", () => {
    expect(getStatusTone("under_review")).toBe("warning");
    expect(formatStatus("under_review")).toBe("Under review");
  });

  it("maps in_review to warning / Under review", () => {
    expect(getStatusTone("in_review")).toBe("warning");
    expect(formatStatus("in_review")).toBe("Under review");
  });

  it("maps pending_review to warning / Pending review", () => {
    expect(getStatusTone("pending_review")).toBe("warning");
    expect(formatStatus("pending_review")).toBe("Pending review");
  });

  it("normalises case and dashes", () => {
    expect(getStatusTone("Under-Review")).toBe("warning");
    expect(formatStatus(" APPROVED ")).toBe("Approved");
  });

  it("keeps the order statuses unchanged", () => {
    expect(getStatusTone("pending_store")).toBe("warning");
    expect(getStatusTone("ready_for_pickup")).toBe("info");
    expect(getStatusTone("delivered")).toBe("success");
    expect(getStatusTone("cancelled")).toBe("error");
    expect(getStatusTone("something_else")).toBe("neutral");
    expect(formatStatus("picked_up")).toBe("Picked up");
  });
});

describe("parseDbDate", () => {
  const expectUtc = (input: string, iso: string) => {
    const d = parseDbDate(input);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe(iso);
  };

  it("parses strict ISO", () => {
    expectUtc("2026-09-24T10:15:00.123Z", "2026-09-24T10:15:00.123Z");
  });

  it("parses Postgres 6-digit fractional seconds with +00:00", () => {
    expectUtc("2026-09-24T10:15:00.123456+00:00", "2026-09-24T10:15:00.123Z");
  });

  it("parses space separator and bare +00 offset", () => {
    expectUtc("2026-09-24 10:15:00.12+00", "2026-09-24T10:15:00.120Z");
  });

  it("parses +0530 and +05:30 offsets", () => {
    expectUtc("2026-09-24T15:45:00+0530", "2026-09-24T10:15:00.000Z");
    expectUtc("2026-09-24T15:45:00+05:30", "2026-09-24T10:15:00.000Z");
  });

  it("treats a naive timestamp as UTC", () => {
    expectUtc("2026-09-24T10:15:00", "2026-09-24T10:15:00.000Z");
    expectUtc("2026-09-24 10:15", "2026-09-24T10:15:00.000Z");
  });

  it("parses a bare date", () => {
    const d = parseDbDate("2026-09-24");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(8);
    expect(d!.getUTCDate()).toBe(24);
  });

  it("returns null for garbage / empty", () => {
    expect(parseDbDate("")).toBeNull();
    expect(parseDbDate(null)).toBeNull();
    expect(parseDbDate(undefined)).toBeNull();
    expect(parseDbDate("not a date")).toBeNull();
  });

  it("falls back to manual parsing when the engine rejects the string", () => {
    // Simulate a strict engine by feeding something the normaliser leaves
    // unchanged but that the manual regex handles: seconds omitted + zone.
    const d = parseDbDate("2026-09-24T10:15Z");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-09-24T10:15:00.000Z");
  });
});
