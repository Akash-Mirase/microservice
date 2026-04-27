const request = require("supertest");

describe("Gateway Health Check", () => {
  test("GET /health should return 200", async () => {
    const res = await request("http://127.0.0.1:4000")
      .get("/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("UP");
  }, 10000);
});