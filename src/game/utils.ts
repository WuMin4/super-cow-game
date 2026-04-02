import { SelectableBlock } from './types';

export function getCellsForPlacement(sb: SelectableBlock, startX: number, startY: number, rot: number) {
  if (sb.shape === 'rect') {
    const isHorizontal = rot % 2 === 0;
    const w = isHorizontal ? sb.w : sb.h;
    const h = isHorizontal ? sb.h : sb.w;
    return [{ x: startX, y: startY, w, h }];
  } else if (sb.shape === 'L') {
    const baseCells = [
      {x:0,y:0}, {x:0,y:1}, {x:0,y:2}, {x:0,y:3},
      {x:1,y:3}, {x:2,y:3}, {x:3,y:3}
    ];
    const rotated = baseCells.map(c => {
      if (rot === 0) return {x: c.x, y: c.y};
      if (rot === 1) return {x: -c.y, y: c.x};
      if (rot === 2) return {x: -c.x, y: -c.y};
      if (rot === 3) return {x: c.y, y: -c.x};
      return c;
    });
    const minX = Math.min(...rotated.map(c => c.x));
    const minY = Math.min(...rotated.map(c => c.y));
    return rotated.map(c => ({
      x: startX + c.x - minX,
      y: startY + c.y - minY,
      w: 1, h: 1
    }));
  }
  return [];
}
