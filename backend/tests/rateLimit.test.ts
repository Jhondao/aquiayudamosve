import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const app = createApp();

describe("Brute-force protection on /api/auth/login", () => {
  it("locks out further attempts after the configured threshold (10 per 15 min)", async () => {
    const email = "brute-force-target@aquiayudamosve.test";
    const statuses: number[] = [];

    for (let i = 0; i < 11; i++) {
      // Sequential on purpose: this exercises the same IP+email rate-limit
      // bucket, so requests must not race each other.
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post("/api/auth/login").send({ email, password: `guess-${i}` });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
