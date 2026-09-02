import { test as setup } from "@playwright/test";

const API = "http://127.0.0.1:8000";
const EMAIL = "rudi.hartono@kelolagudang.id";
const PASSWORD = process.env.DEMO_PASSWORD || process.env.VITE_DEMO_PASSWORD || "";

setup("authenticate", async ({ page, request }) => {
  if (!PASSWORD) {
    throw new Error("DEMO_PASSWORD kosong — set di Backend/.env dan export DEMO_PASSWORD=... sebelum test");
  }
  // Login via API
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`Login gagal ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  const token: string = body.token ?? body.data?.token ?? body.access_token;
  if (!token) throw new Error("Token tidak ada di response login");

  // Set token di localStorage origin Frontend
  await page.goto("/");
  await page.evaluate((t) => localStorage.setItem("kg-token", t), token);
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
