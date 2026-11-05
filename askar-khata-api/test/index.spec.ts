import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Edge Khata API & Authentication", () => {
	it("returns 404 for unknown endpoints", async () => {
		const request = new IncomingRequest("http://example.com/unknown");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env as any, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not Found");
	});

	it("supports CORS preflight with x-khata-pin header", async () => {
		const request = new IncomingRequest("http://example.com/api/khata/cust-123", {
			method: "OPTIONS",
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env as any, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Headers")).toContain("x-khata-pin");
	});

	it("blocks unauthenticated requests without x-khata-pin (401)", async () => {
		const request = new IncomingRequest("http://example.com/api/khata/cust-123", {
			method: "GET",
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env as any, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data).toHaveProperty("error");
		expect((data as any).error).toContain("PIN required");
	});

	it("rejects unauthorized access when invalid PIN is passed (403)", async () => {
		const request = new IncomingRequest("http://example.com/api/khata/invalid-customer-id", {
			method: "GET",
			headers: {
				"x-khata-pin": "0000",
			},
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env as any, ctx);
		await waitOnExecutionContext(ctx);
		const data = await response.json();
		expect(response.status).toBe(403);
		expect(data).toHaveProperty("error");
		expect((data as any).error).toContain("Forbidden");
	});
});
