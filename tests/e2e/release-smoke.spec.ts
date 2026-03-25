import { expect, test } from "@playwright/test";

test.describe("release smoke", () => {
  test("serves the demo dashboard API payload", async ({ request }) => {
    const response = await request.get("/api/dashboard");

    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(payload.notebookBusinessName).toBe("Demo Corporation");
    expect(payload.queue[0]?.title).toContain("Demo");
    expect(payload.businesses[0]?.name).toBe("Demo Corporation");
  });

  test("returns a clear validation error for brief requests without businessId", async ({ request }) => {
    const response = await request.get("/api/brief");

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "businessId is required",
    });
  });

  test("renders the dashboard in demo mode", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Today's Focus Queue")).toBeVisible();
    await expect(page.getByText("Demo Corporation").first()).toBeVisible();
    await expect(page.getByText("Welcome to AI Focus Hub (Demo)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Focus Block" })).toBeVisible();
  });
});
