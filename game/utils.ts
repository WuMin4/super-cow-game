import { SelectableBlock } from './types';

export function getCellsForPlacement(sb: SelectableBlock, startX: number, startY: number, rot: number) {
  if (sb.shape === 'rect') {
    const isHorizontal = rot % 2 === 0;
    const w = isHorizontal ? sb.w : sb.h;
    const h = isHorizontal ? sb.h : sb.w;
    return [{ x: startX, y: startY, w, h }];
  } else if (sb.shape === 'L') {
    const baseRects = [
      { x: 0, y: 0, w: 1, h: 4 },
      { x: 1, y: 3, w: 3, h: 1 }
    ];
    const rotatedRects = baseRects.map(r => {
      if (rot === 0) return { x: r.x, y: r.y, w: r.w, h: r.h };
      if (rot === 1) return { x: -r.y - r.h, y: r.x, w: r.h, h: r.w };
      if (rot === 2) return { x: -r.x - r.w, y: -r.y - r.h, w: r.w, h: r.h };
      if (rot === 3) return { x: r.y, y: -r.x - r.w, w: r.h, h: r.w };
      return r;
    });
    const minX = Math.min(...rotatedRects.map(r => r.x));
    const minY = Math.min(...rotatedRects.map(r => r.y));
    return rotatedRects.map(r => ({
      x: startX + r.x - minX,
      y: startY + r.y - minY,
      w: r.w,
      h: r.h
    }));
  }
  return [];
}
