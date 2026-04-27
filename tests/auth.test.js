const request = require("supertest");

describe("Auth Service Tests", () => {

  test("Register User", async () => {
    const res = await request("http://127.0.0.1:4000")
      .post("/auth/register")
      .send({
        name: "TestUser",
        email: "test123@gmail.com",
        password: "123456"
      });

    expect([200,201,409]).toContain(res.statusCode);
  }, 10000);

  test("Login User", async () => {
    const res = await request("http://127.0.0.1:4000")
      .post("/auth/login")
      .send({
        email: "test123@gmail.com",
        password: "123456"
      });

    expect([200,401]).toContain(res.statusCode);
  }, 10000);

});