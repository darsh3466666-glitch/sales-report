import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Monitor, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZoomableTableFrameProps {
  /** Minimum full desktop width (px) needed so all columns render side-by-side without wrapping or clipping. */
  desktopMinWidth: number;
  /** Optional label shown on the mobile zoom bar (e.g., "عرض كامل مثل الكمبيوتر"). */
  label?: string;
  /** Additional class names for the outermost wrapper. */
  className?: string;
  /** Optional max zoom factor (default 1.75). */
  maxScale?: number;
  children: React.ReactNode;
}

const PRESET_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75];

/**
 * Wraps dense data tables so narrow/mobile viewports automatically fit the full
 * desktop-width table across the screen without clipping columns, while letting
 * users pinch-zoom or use quick zoom controls (+ / - / Fit / 100%) without
 * shrinking surrounding cards or page headers.
 */
export function ZoomableTableFrame({
  desktopMinWidth,
  label = "عرض الجدول كامل",
  className,
  maxScale = 1.75,
  children,
}: ZoomableTableFrameProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [contentWidth, setContentWidth] = useState<number>(desktopMinWidth);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [zoomMode, setZoomMode] = useState<"fit" | "custom">("fit");
  const [customScale, setCustomScale] = useState<number>(1);
  const [isRtl, setIsRtl] = useState<boolean>(true);

  const pinchStateRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
  }>({ active: false, startDist: 0, startScale: 1 });

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const computedDir = window.getComputedStyle(outer).direction;
    setIsRtl(computedDir !== "ltr");

    const updateSizes = () => {
      const nextWidth = outer.clientWidth;
      const nextContentWidth = Math.max(desktopMinWidth, inner.scrollWidth);
      const nextHeight = inner.scrollHeight;
      if (nextWidth > 0) setContainerWidth(nextWidth);
      if (nextContentWidth > 0) setContentWidth(nextContentWidth);
      if (nextHeight > 0) setContentHeight(nextHeight);
    };

    updateSizes();

    const ro = new ResizeObserver(() => {
      updateSizes();
    });
    ro.observe(outer);
    ro.observe(inner);

    return () => ro.disconnect();
  }, [desktopMinWidth]);

  const effectiveWidth = Math.max(desktopMinWidth, contentWidth);
  const isNarrowViewport =
    containerWidth > 0 && containerWidth < desktopMinWidth - 2;

  const fitScale = isNarrowViewport
    ? Math.max(0.24, Math.min(1, containerWidth / effectiveWidth))
    : 1;

  const activeScale = !isNarrowViewport
    ? 1
    : zoomMode === "fit"
    ? fitScale
    : Math.max(fitScale, Math.min(maxScale, customScale));

  const isNativeScale = !isNarrowViewport || Math.abs(activeScale - 1) < 0.005;

  const handleSetFit = useCallback(() => {
    setZoomMode("fit");
  }, []);

  const handleSetFull = useCallback(() => {
    setZoomMode("custom");
    setCustomScale(1);
  }, []);

  const handleZoomIn = useCallback(() => {
    const nextStep =
      PRESET_STEPS.find((s) => s > activeScale + 0.04 && s <= maxScale) ??
      Math.min(maxScale, Number((activeScale + 0.2).toFixed(2)));
    setZoomMode("custom");
    setCustomScale(nextStep);
  }, [activeScale, maxScale]);

  const handleZoomOut = useCallback(() => {
    const prevSteps = PRESET_STEPS.filter(
      (s) => s < activeScale - 0.04 && s > fitScale + 0.03
    );
    if (prevSteps.length > 0) {
      setZoomMode("custom");
      setCustomScale(prevSteps[prevSteps.length - 1]);
      return;
    }
    setZoomMode("fit");
  }, [activeScale, fitScale]);

  // Two-finger pinch-to-zoom scoped to this table viewport
  useEffect(() => {
    const el = outerRef.current;
    if (!el || !isNarrowViewport) return;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStateRef.current = {
          active: true,
          startDist: Math.max(10, getDistance(e.touches)),
          startScale: activeScale,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStateRef.current.active) {
        e.preventDefault();
        const dist = getDistance(e.touches);
        const ratio = dist / pinchStateRef.current.startDist;
        const nextScale = Math.max(
          fitScale,
          Math.min(maxScale, pinchStateRef.current.startScale * ratio)
        );
        if (nextScale <= fitScale + 0.015) {
          setZoomMode("fit");
        } else {
          setZoomMode("custom");
          setCustomScale(nextScale);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStateRef.current.active = false;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isNarrowViewport, activeScale, fitScale, maxScale]);

  const pctDisplay = Math.round(activeScale * 100);
  const scaledWidth = isNarrowViewport
    ? Math.max(containerWidth, Math.ceil(effectiveWidth * activeScale))
    : undefined;
  const scaledHeight =
    isNarrowViewport && !isNativeScale && contentHeight > 0
      ? Math.ceil(contentHeight * activeScale)
      : undefined;

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile / Narrow-Viewport Zoom Toolbar */}
      {isNarrowViewport && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 bg-muted/80 border-b border-border text-xs no-print print:hidden"
          dir="rtl"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/80">
            <Monitor className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>{label}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-background border border-border font-mono font-black text-[11px] text-primary tabular-nums">
              {pctDisplay}%
            </span>
          </div>

          <div className="flex items-center gap-1 mr-auto">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomMode === "fit"}
              aria-label="تصغير الجدول"
              title="تصغير الجدول"
              className="h-9 min-w-[38px] px-2 inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground font-bold disabled:opacity-40 active:scale-95 transition cursor-pointer"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={activeScale >= maxScale - 0.01}
              aria-label="تكبير الجدول"
              title="تكبير الجدول"
              className="h-9 min-w-[38px] px-2 inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground font-bold disabled:opacity-40 active:scale-95 transition cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleSetFit}
              className={cn(
                "h-9 px-2.5 inline-flex items-center gap-1 rounded-lg border text-[11px] font-black transition cursor-pointer",
                zoomMode === "fit"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
              title="ضبط عرض الجدول ليظهر كاملاً على الشاشة"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>ملاءمة</span>
            </button>

            <button
              type="button"
              onClick={handleSetFull}
              className={cn(
                "h-9 px-2.5 inline-flex items-center rounded-lg border text-[11px] font-black font-mono transition cursor-pointer",
                zoomMode === "custom" && Math.abs(activeScale - 1) < 0.02
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
              title="الحجم الطبيعي للكمبيوتر 100%"
            >
              100%
            </button>
          </div>
        </div>
      )}

      {/* Outer Horizontal Pan & Scroll Container */}
      <div
        ref={outerRef}
        className="w-full overflow-x-auto smooth-touch-scroll zoomable-table-outer"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className="zoomable-table-sizer"
          style={
            isNarrowViewport
              ? {
                  width: scaledWidth ? `${scaledWidth}px` : "100%",
                  height: scaledHeight ? `${scaledHeight}px` : "auto",
                  position: "relative",
                  overflow: isNativeScale ? "visible" : "hidden",
                }
              : { width: "100%" }
          }
        >
          <div
            ref={innerRef}
            className="zoomable-table-inner"
            style={
              isNarrowViewport
                ? isNativeScale
                  ? {
                      minWidth: `${desktopMinWidth}px`,
                      width: "max-content",
                      position: "relative",
                    }
                  : {
                      minWidth: `${desktopMinWidth}px`,
                      width: "max-content",
                      position: "absolute",
                      top: 0,
                      ...(isRtl ? { right: 0 } : { left: 0 }),
                      transform: `scale(${activeScale})`,
                      transformOrigin: isRtl ? "top right" : "top left",
                    }
                : { width: "100%" }
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
