import { connect, type TLSSocket } from "node:tls";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/** Let Workers resolve the hostname and validate its TLS certificate together. */
export function hostnameTlsSocket(host: string, port: number): NonNullable<SMTPTransport.Options["getSocket"]> {
  return (_options, callback) => {
    let socket: TLSSocket | undefined;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error: Error | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        socket?.destroy();
        callback(error, undefined);
      } else callback(null, { connection: socket, secured: true });
    };
    try {
      socket = connect({ host, port, servername: host, rejectUnauthorized: true });
      socket.once("secureConnect", () => finish(null));
      socket.once("error", finish);
      timer = setTimeout(() => {
        const error = Object.assign(new Error("SMTP TLS connection timed out"), { code: "ETIMEDOUT" });
        finish(error);
      }, 10_000);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("SMTP TLS connection failed"));
    }
  };
}
