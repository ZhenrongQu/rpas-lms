import type { VerificationChannel } from "./types";

export async function sendVerificationCode({
  channel,
  target,
  code,
}: {
  channel: VerificationChannel;
  target: string;
  code: string;
}): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth-code] ${channel}:${target} code=${code}`);
    return;
  }

  console.info(`[auth-code] ${channel}:${target} code generated`);
}
