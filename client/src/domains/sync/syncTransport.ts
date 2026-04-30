import {
  healthResponseSchema,
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  type HealthResponse,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type RegisterDeviceRequest,
  type RegisterDeviceResponse,
} from "@shared/contracts";

function buildApiUrl(syncNodeUrl: string, path: string): string {
  return new URL(path, syncNodeUrl.endsWith("/") ? syncNodeUrl : `${syncNodeUrl}/`).toString();
}

async function postJson<TRequest, TResponse>(
  syncNodeUrl: string,
  path: string,
  request: TRequest,
  requestValidator: { parse: (input: unknown) => TRequest },
  responseValidator: { parse: (input: unknown) => TResponse },
): Promise<TResponse> {
  const validatedRequest = requestValidator.parse(request);
  const response = await fetch(buildApiUrl(syncNodeUrl, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validatedRequest),
  });

  if (!response.ok) {
    throw new Error(`Sync node request failed with status ${response.status}.`);
  }

  return responseValidator.parse(await response.json());
}

export async function fetchHealth(syncNodeUrl: string): Promise<HealthResponse> {
  const response = await fetch(buildApiUrl(syncNodeUrl, "/api/v1/health"));
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}.`);
  }

  return healthResponseSchema.parse(await response.json());
}

export function registerDevice(syncNodeUrl: string, request: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
  return postJson(syncNodeUrl, "/api/v1/register-device", request, registerDeviceRequestSchema, registerDeviceResponseSchema);
}

export function pushEnvelopes(syncNodeUrl: string, request: PushRequest): Promise<PushResponse> {
  return postJson(syncNodeUrl, "/api/v1/push", request, pushRequestSchema, pushResponseSchema);
}

export function pullEnvelopes(syncNodeUrl: string, request: PullRequest): Promise<PullResponse> {
  return postJson(syncNodeUrl, "/api/v1/pull", request, pullRequestSchema, pullResponseSchema);
}
