import { Coord } from "./types/game";

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getL2Distance(c1: Coord, c2: Coord): number {
  return Math.hypot(c1.x - c2.x, c1.y - c2.y);
}

export function limit({ value, min = -Infinity, max = Infinity }: { value: number; min?: number; max?: number }): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 用于显示倒计时，将ms时间转为秒
 */
export function displayTime(time: number): number {
  return Math.max(Math.round(time / 1000), 0);
}

export function create2DArray<T>(rows: number, cols: number, defaultValue: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => defaultValue));
}