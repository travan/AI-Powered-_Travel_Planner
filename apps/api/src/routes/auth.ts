import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authService } from "../modules/auth/application/auth.service.js";
import { accountExistsQueryDto, loginDto, signupDto } from "../modules/auth/dto/auth.dto.js";
import { parseDto, sendServiceError } from "../shared/http/validation.js";

type AuthenticatedUser = {
  sub: string;
  email?: string;
};

export async function authRoutes(fastify: FastifyInstance) {
  const register = async (request: FastifyRequest, reply: FastifyReply) => {
    const dto = parseDto(signupDto, request.body, reply);
    if (!dto) return;

    const result = await authService.signup({ dto, jwt: fastify.jwt });
    if (!result.ok) {
      return sendServiceError(reply, result.error);
    }

    return reply.status(201).send(result.value);
  };

  const createSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const dto = parseDto(loginDto, request.body, reply);
    if (!dto) return;

    const result = await authService.login({ dto, jwt: fastify.jwt });
    if (!result.ok) {
      return sendServiceError(reply, result.error);
    }

    return reply.send(result.value);
  };

  fastify.get<{ Querystring: { email?: string } }>("/auth/account-exists", async (request, reply) => {
    const query = parseDto(accountExistsQueryDto, request.query, reply);
    if (!query) return;

    return reply.send({ exists: await authService.accountExists(query.email) });
  });

  fastify.post("/auth/register", register);
  fastify.post("/auth/session", createSession);

  fastify.get(
    "/auth/me",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const authUser = request.user as AuthenticatedUser;
      const result = await authService.getMe(authUser.sub);
      if (!result.ok) {
        return sendServiceError(reply, result.error);
      }

      return reply.send(result.value);
    }
  );

  fastify.post(
    "/auth/logout",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const token = getBearerToken(request.headers.authorization);
      return reply.send(await authService.logout(token));
    }
  );
}

function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
