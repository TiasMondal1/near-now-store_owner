/**
 * Photo uploads (lib/storage.ts).
 *
 * 2026-10-27: gallery and owner photos were uploaded straight to Storage with
 * the anon key and `upsert: true`, so the buckets had to let anyone write and
 * anyone holding the public key could overwrite any owner's photo. The app now
 * asks the backend for a one-photo token (POST /store-owner/upload-url) and
 * uploads with uploadToSignedUrl.
 */
const mockPost = jest.fn();
const mockUploadToSignedUrl = jest.fn();
const mockDirectUpload = jest.fn();
const mockFrom = jest.fn(() => ({ uploadToSignedUrl: mockUploadToSignedUrl, upload: mockDirectUpload }));
const mockGetSession = jest.fn();

jest.mock("../lib/api-client", () => ({ apiClient: { post: (...a: unknown[]) => mockPost(...a) } }));
jest.mock("../lib/supabase", () => ({ supabase: { storage: { from: (b: string) => mockFrom(b) } } }));
jest.mock("../session", () => ({ getSession: () => mockGetSession() }));

import { uploadOwnerImage, uploadStoreImage } from "../lib/storage";

const fileBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).fetch = jest.fn(async () => ({ arrayBuffer: async () => fileBytes }));
  mockGetSession.mockResolvedValue({ token: "shop-token", user: { id: "owner-1" } });
  mockUploadToSignedUrl.mockResolvedValue({ data: { path: "p" }, error: null });
});

describe("uploadStoreImage / uploadOwnerImage", () => {
  it("gets a token for the store's gallery and uploads with it", async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: { bucket: "store-images", path: "store-1/abc.png", token: "tok", public_url: "https://cdn/store-images/store-1/abc.png" },
    });

    const res = await uploadStoreImage("store-1", "file:///photo.png");

    expect(mockPost).toHaveBeenCalledWith(
      "/store-owner/upload-url",
      { kind: "store_image", store_id: "store-1", content_type: "image/png" },
      { Authorization: "Bearer shop-token" }
    );
    expect(mockFrom).toHaveBeenCalledWith("store-images");
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith("store-1/abc.png", "tok", fileBytes, { contentType: "image/png" });
    expect(mockDirectUpload).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, url: "https://cdn/store-images/store-1/abc.png" });
  });

  it("asks for the owner photo without naming a folder (the backend picks the caller's own)", async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: { bucket: "store-owner-images", path: "owner-1/avatar-x.jpg", token: "tok", public_url: "https://cdn/o.jpg" },
    });

    const res = await uploadOwnerImage("content://media/picker/123");

    expect(mockPost.mock.calls[0][1]).toEqual({ kind: "owner_photo", content_type: "image/jpeg" });
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith("owner-1/avatar-x.jpg", "tok", fileBytes, { contentType: "image/jpeg" });
    expect(res).toEqual({ ok: true, url: "https://cdn/o.jpg" });
  });

  it("shows the backend's reason and uploads nothing when no token is issued", async () => {
    mockPost.mockResolvedValue({ success: false, error: "Store not found, not owned by you, or not yet approved" });

    const res = await uploadStoreImage("store-9", "file:///photo.jpg");

    expect(res).toEqual({ ok: false, error: "Store not found, not owned by you, or not yet approved" });
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled();
    expect(mockDirectUpload).not.toHaveBeenCalled();
  });

  it("asks a signed-out user to log in again", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await uploadOwnerImage("file:///photo.jpg");
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/log in again/i) });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("reports a failed upload to the signed URL", async () => {
    mockPost.mockResolvedValue({ success: true, data: { bucket: "store-images", path: "s/x.jpg", token: "tok", public_url: "u" } });
    mockUploadToSignedUrl.mockResolvedValue({ data: null, error: { message: "The resource already exists" } });
    expect(await uploadStoreImage("s", "file:///x.jpg")).toEqual({ ok: false, error: "The resource already exists" });
  });
});
