// Tiny 2D vector helpers. Plain objects, no classes — cheap to allocate/GC.
export type Vec2 = { x: number; y: number };

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const len = (a: Vec2): number => Math.hypot(a.x, a.y);

export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

// Rotate a vector by an angle in radians (used for multishot spread).
export const rotate = (a: Vec2, rad: number): Vec2 => ({
  x: a.x * Math.cos(rad) - a.y * Math.sin(rad),
  y: a.x * Math.sin(rad) + a.y * Math.cos(rad),
});
