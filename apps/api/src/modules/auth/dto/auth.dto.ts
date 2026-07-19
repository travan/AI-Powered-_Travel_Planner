import { z } from "zod";

const email = z.string().trim().toLowerCase().email();

export const accountExistsQueryDto = z.object({
  email,
});

export const signupDto = z.object({
  email,
  password: z.string().min(6).max(128),
  full_name: z.string().trim().min(1).max(120).optional(),
});

export const loginDto = signupDto.pick({
  email: true,
  password: true,
});

export type AccountExistsQueryDto = z.infer<typeof accountExistsQueryDto>;
export type SignupDto = z.infer<typeof signupDto>;
export type LoginDto = z.infer<typeof loginDto>;
