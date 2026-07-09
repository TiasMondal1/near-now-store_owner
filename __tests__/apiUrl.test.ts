import { apiUrl } from "../lib/apiUrl";

describe("apiUrl", () => {
  it("appends /api when the base has no /api suffix", () => {
    expect(apiUrl("https://host.com", "/auth/verify")).toBe(
      "https://host.com/api/auth/verify"
    );
  });

  it("does not double the /api segment when base already ends with /api", () => {
    expect(apiUrl("https://host.com/api", "/auth/verify")).toBe(
      "https://host.com/api/auth/verify"
    );
  });

  it("strips trailing slashes from the base", () => {
    expect(apiUrl("https://host.com/", "/orders")).toBe(
      "https://host.com/api/orders"
    );
    expect(apiUrl("https://host.com/api/", "/orders")).toBe(
      "https://host.com/api/orders"
    );
  });

  it("adds a leading slash to the path when missing", () => {
    expect(apiUrl("https://host.com", "orders")).toBe(
      "https://host.com/api/orders"
    );
  });
});
