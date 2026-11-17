import type { GenerateRequest } from "@travel/types";
import captured from "../../fixtures/malaysia-singapore-request.json";

// Exact user-provided payload, without optional destination names/references.
export function malaysiaSingaporeRequest(): GenerateRequest {
  return structuredClone(captured) as GenerateRequest;
}
