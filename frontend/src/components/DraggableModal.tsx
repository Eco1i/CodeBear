import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import type { ModalProps } from "antd";
import type { PointerEvent as ReactPointerEvent } from "react";

type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
type DragState = {
  pointerId: number;
  start: Point;
  origin: Point;
  bounds: Bounds;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function DraggableModal({ open, title, ...props }: ModalProps) {
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!open) return;
    setOffset({ x: 0, y: 0 });
    dragStateRef.current = null;
  }, [open]);

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      !target?.closest(".ant-modal-header") ||
      target.closest(".ant-modal-close")
    )
      return;
    const modal = event.currentTarget.closest<HTMLElement>(".ant-modal");
    if (!modal) return;

    const rect = modal.getBoundingClientRect();
    const horizontalBounds = [-rect.left, window.innerWidth - rect.right].sort(
      (a, b) => a - b,
    );
    const verticalBounds = [-rect.top, window.innerHeight - rect.bottom].sort(
      (a, b) => a - b,
    );
    dragStateRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
      bounds: {
        left: horizontalBounds[0],
        right: horizontalBounds[1],
        top: verticalBounds[0],
        bottom: verticalBounds[1],
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: clamp(
        drag.origin.x + event.clientX - drag.start.x,
        drag.bounds.left,
        drag.bounds.right,
      ),
      y: clamp(
        drag.origin.y + event.clientY - drag.start.y,
        drag.bounds.top,
        drag.bounds.bottom,
      ),
    });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <Modal
      {...props}
      open={open}
      centered
      title={<div className="cb-draggable-modal-title">{title}</div>}
      modalRender={(modal) => (
        <div
          className="cb-draggable-modal-frame"
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
          onPointerDown={startDragging}
          onPointerMove={moveDragging}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={stopDragging}
        >
          {modal}
        </div>
      )}
    />
  );
}
