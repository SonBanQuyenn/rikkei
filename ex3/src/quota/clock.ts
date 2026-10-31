import { Injectable } from '@nestjs/common';

/** Tach nguon thoi gian de kiem thu duoc cac moc phut / gio / ngay. */
@Injectable()
export class Clock {
  private offsetMs = 0;

  now() {
    return Date.now() + this.offsetMs;
  }

  advance(ms: number) {
    this.offsetMs += ms;
  }
}
