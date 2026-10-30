import type { Socket } from 'socket.io';
import { AuthError, type AuthService } from '../auth/auth.service.js';

/**
 * Xac thuc ngay tai thoi diem bat tay: socket khong co token hop le bi tu choi
 * truoc khi vao bat ky room nao - khong co kenh nao mo tu do.
 */
export function wsAuth(auth: AuthService) {
  return (socket: Socket, next: (err?: Error) => void) => {
    try {
      socket.data.user = auth.verify(socket.handshake.auth?.token);
      next();
    } catch (err) {
      next(new Error(err instanceof AuthError ? `UNAUTHORIZED: ${err.message}` : 'UNAUTHORIZED'));
    }
  };
}
