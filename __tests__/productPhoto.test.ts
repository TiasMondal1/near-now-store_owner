/**
 * Custom-product photo size (lib/productPhoto.ts + addCustomMasterProduct).
 *
 * 2026-10-26: the picker sent the full-resolution photo inline as base64 —
 * 3–7 MB per request — so submissions hit the API's 4 MB body cap or Vercel's
 * 4.5 MB limit, and approved photos bloated every checkout that carried them.
 */
const mockManipulate = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));
jest.mock("../lib/supabase", () => ({ supabase: null }));
jest.mock("../lib/config", () => ({ config: { API_BASE: "https://api.test" } }));
jest.mock("../lib/selectedStore", () => ({ loadSelectedStoreId: jest.fn(async () => null) }));

import { MAX_PRODUCT_PHOTO_DIMENSION, prepareProductPhoto, productPhotoResize } from "../lib/productPhoto";
import { addCustomMasterProduct } from "../lib/storeProducts";

describe("productPhotoResize", () => {
  it("caps the longest side of a landscape photo", () => {
    expect(productPhotoResize(4032, 3024)).toEqual({ width: MAX_PRODUCT_PHOTO_DIMENSION });
  });

  it("caps the longest side of a portrait photo", () => {
    expect(productPhotoResize(3024, 4032)).toEqual({ height: MAX_PRODUCT_PHOTO_DIMENSION });
  });

  it("leaves a photo that already fits, or of unknown size, alone", () => {
    expect(productPhotoResize(800, 600)).toBeNull();
    expect(productPhotoResize(1024, 1024)).toBeNull();
    expect(productPhotoResize(undefined, undefined)).toBeNull();
    expect(productPhotoResize(0, 0)).toBeNull();
  });
});

describe("prepareProductPhoto", () => {
  beforeEach(() => mockManipulate.mockReset());

  it("downscales and re-encodes a camera photo as JPEG with base64", async () => {
    mockManipulate.mockResolvedValue({ uri: "file:///small.jpg", base64: "QUJD", width: 1024, height: 768 });

    const out = await prepareProductPhoto({ uri: "file:///big.heic", width: 4032, height: 3024 });

    expect(out).toEqual({ uri: "file:///small.jpg", base64: "QUJD" });
    expect(mockManipulate).toHaveBeenCalledWith("file:///big.heic", [{ resize: { width: 1024 } }], {
      compress: 0.7,
      format: "jpeg",
      base64: true,
    });
  });

  it("still re-encodes (no resize) a photo that already fits, so the JPEG prefix is true", async () => {
    mockManipulate.mockResolvedValue({ uri: "file:///same.jpg", base64: "QUJD" });

    await prepareProductPhoto({ uri: "file:///small.png", width: 600, height: 600 });

    expect(mockManipulate).toHaveBeenCalledWith("file:///small.png", [], expect.objectContaining({ format: "jpeg", base64: true }));
  });

  it("throws instead of handing back a photo without base64", async () => {
    mockManipulate.mockResolvedValue({ uri: "file:///x.jpg" });
    await expect(prepareProductPhoto({ uri: "file:///x.jpg", width: 10, height: 10 })).rejects.toThrow();
  });
});

describe("addCustomMasterProduct — oversized request", () => {
  const input = {
    name: "Mango pickle",
    category: "Pickles",
    unit: "500g",
    image_url: "data:image/jpeg;base64,QUJD",
    base_price: 120,
    discounted_price: 100,
  } as Parameters<typeof addCustomMasterProduct>[0];

  afterEach(() => {
    (global as any).fetch = undefined;
  });

  it("explains a 413 (e.g. Vercel's non-JSON rejection) as a photo-size problem", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 413,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }));

    const res = await addCustomMasterProduct(input, "tok");

    expect(res).toEqual({ success: false, error: expect.stringMatching(/photo is too large/i) });
  });

  it("still shows the server's own message for other failures", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: "Category is required" }),
    }));

    const res = await addCustomMasterProduct(input, "tok");

    expect(res).toEqual({ success: false, error: "Category is required" });
  });
});
