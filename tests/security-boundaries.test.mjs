import assert from "node:assert/strict";
import { test } from "node:test";
import { instagramPost, instagramThumbnail } from "../src/lib/instagram.ts";
import { safeInternalPath } from "../src/lib/internal-path.ts";
import { isPublicAddress, requestPublicUrl } from "../src/lib/public-http.ts";

test("sign-in destinations stay on the app even with URL parser edge cases", () => {
  assert.equal(safeInternalPath("/search?q=ideas#results"), "/search?q=ideas#results");
  for (const path of ["//outside.example", "/\\outside.example", "/\toutside.example", "/nested/..//outside.example", "javascript:alert(1)"]) {
    assert.equal(safeInternalPath(path), "/");
  }
});

test("link previews reject private, reserved and IPv4-mapped addresses", async () => {
  for (const address of ["127.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "::ffff:7f00:1", "::1", "fe80::1", "fc00::1", "2002:7f00:1::"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700::1111"), true);
  for (const url of ["http://2130706433/", "http://[::ffff:127.0.0.1]/", "https://example.com:8080/", "https://user@example.com/"]) {
    await assert.rejects(requestPublicUrl(new URL(url), {}, AbortSignal.timeout(1000)));
  }
});

test("Instagram embeds use a canonical HTTPS origin and preserve short share links as links", () => {
  assert.deepEqual(instagramPost("https://www.instagram.com/creator/reels/Ab_C-123/?igsh=tracking"), {
    sourceUrl: "https://www.instagram.com/reel/Ab_C-123/",
    embedUrl: "https://www.instagram.com/reel/Ab_C-123/embed/",
    video: true,
  });
  assert.equal(instagramPost("https://www.instagram.com/share/reel/AbC123/").embedUrl, null);
  for (const url of ["https://instagram.com.example.org/reel/AbC123", "https://instagram.com:9000/reel/AbC123", "https://user@instagram.com/reel/AbC123", "https://instagram.com/reel/%2Fexample", "http://instagram.com/reel/AbC123"]) {
    assert.equal(instagramPost(url), null, url);
  }
  assert.equal(instagramThumbnail("https://scontent.cdninstagram.com/post.jpg"), "https://scontent.cdninstagram.com/post.jpg");
  assert.equal(instagramThumbnail("https://cdninstagram.com.example.org/post.jpg"), null);
});
