import {
  apiErrorSchema,
  bootstrapResponseSchema,
  consumePairingSessionRequestSchema,
  consumePairingSessionResponseSchema,
  createPairingSessionRequestSchema,
  createPairingSessionResponseSchema,
  healthResponseSchema,
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  type BootstrapResponse,
  type ConsumePairingSessionRequest,
  type ConsumePairingSessionResponse,
  type CreatePairingSessionRequest,
  type CreatePairingSessionResponse,
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

async function parseError(response: Response): Promise<never> {
  try {
    const payload = apiErrorSchema.parse(await response.json());
    throw new Error(payload.error.message);
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }

    throw new Error(`Sync node request failed with status ${response.status}.`);
  }
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
    return parseError(response);
  }

  return responseValidator.parse(await response.json());
}

async function getJson<TResponse>(
  syncNodeUrl: string,
  path: string,
  responseValidator: { parse: (input: unknown) => TResponse },
): Promise<TResponse> {
  const response = await fetch(buildApiUrl(syncNodeUrl, path));
  if (!response.ok) {
    return parseError(response);
  }

  return responseValidator.parse(await response.json());
}

export function fetchHealth(syncNodeUrl: string): Promise<HealthResponse> {
  return getJson(syncNodeUrl, "/api/v1/health", healthResponseSchema);
}

export function fetchBootstrap(syncNodeUrl: string): Promise<BootstrapResponse> {
  return getJson(syncNodeUrl, "/api/v1/bootstrap", bootstrapResponseSchema);
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

export function createPairingSession(
  syncNodeUrl: string,
  request: CreatePairingSessionRequest,
): Promise<CreatePairingSessionResponse> {
  return postJson(
    syncNodeUrl,
    "/api/v1/pairing-sessions",
    request,
    createPairingSessionRequestSchema,
    createPairingSessionResponseSchema,
  );
}

export function consumePairingSession(
  syncNodeUrl: string,
  request: ConsumePairingSessionRequest,
): Promise<ConsumePairingSessionResponse> {
  return postJson(
    syncNodeUrl,
    "/api/v1/consume-pairing-session",
    request,
    consumePairingSessionRequestSchema,
    consumePairingSessionResponseSchema,
  );
}
