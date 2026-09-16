import { describe, expect, it } from "vitest";
import { companyKopHtml, isSafeLogo } from "./use-settings";

const VALID_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const VALID_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("isSafeLogo", () => {
  it("menerima data-URL PNG/JPEG base64", () => {
    expect(isSafeLogo(VALID_PNG)).toBe(true);
    expect(isSafeLogo(VALID_JPEG)).toBe(true);
  });

  it("menolak URL http, svg, dan percobaan quote-break", () => {
    expect(isSafeLogo("https://evil.test/logo.png")).toBe(false);
    expect(isSafeLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(false);
    expect(isSafeLogo(`${VALID_PNG}" onerror="alert(1)`)).toBe(false);
    expect(isSafeLogo("")).toBe(false);
  });
});

describe("companyKopHtml", () => {
  it("me-render logo valid dan meng-escape nama perusahaan", () => {
    const html = companyKopHtml({
      "company.name": 'PT Maju <Mundur> "Jaya"',
      "company.logo": VALID_PNG,
    });
    expect(html).toContain(`<img class="kop-logo" src="${VALID_PNG}" alt="" />`);
    expect(html).toContain("PT Maju &lt;Mundur&gt; &quot;Jaya&quot;");
  });

  it("tidak me-render logo di luar allowlist", () => {
    const html = companyKopHtml({
      "company.name": "PT Aman",
      "company.logo": 'x" onerror="alert(1)',
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("PT Aman");
  });
});
