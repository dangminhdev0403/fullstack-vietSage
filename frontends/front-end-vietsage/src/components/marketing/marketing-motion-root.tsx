"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export function MarketingMotionRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const scenes = Array.from(root.querySelectorAll<HTMLElement>("[data-scene]"));
    const parallaxTargets = Array.from(
      root.querySelectorAll<HTMLElement>("[data-parallax]"),
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const precisePointer = window.matchMedia("(pointer: fine)").matches;

    root.dataset.motion = "ready";

    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((target) => {
        target.dataset.visible = "true";
      });
    }

    const revealObserver = reducedMotion
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              entry.target.setAttribute(
                "data-visible",
                entry.isIntersecting ? "true" : "false",
              );
            }
          },
          { rootMargin: "-4% 0px -8%", threshold: 0.14 },
        );

    targets.forEach((target) => revealObserver?.observe(target));

    const setActiveScene = (scene: HTMLElement) => {
      const theme = scene.dataset.scene ?? "arrival";
      root.dataset.theme = theme;
      root.querySelectorAll<HTMLElement>("[data-scene-link]").forEach((link) => {
        link.dataset.active = link.dataset.sceneLink === theme ? "true" : "false";
      });
    };

    if (scenes[0]) setActiveScene(scenes[0]);

    const sceneObserver = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (activeEntry) setActiveScene(activeEntry.target as HTMLElement);
      },
      { rootMargin: "-28% 0px -38%", threshold: [0.05, 0.25, 0.5, 0.75] },
    );

    scenes.forEach((scene) => sceneObserver.observe(scene));

    let scrollFrame = 0;
    const updateScrollState = () => {
      scrollFrame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      root.style.setProperty("--scroll-progress", String(progress));
      root.dataset.scrolled = window.scrollY > 48 ? "true" : "false";
    };

    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(updateScrollState);
    };

    updateScrollState();
    window.addEventListener("scroll", onScroll, { passive: true });

    let pointerFrame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let velocityX = 0;
    let velocityY = 0;

    const renderPointer = () => {
      const spring = 0.075;
      const damping = 0.76;

      velocityX = (velocityX + (targetX - currentX) * spring) * damping;
      velocityY = (velocityY + (targetY - currentY) * spring) * damping;
      currentX += velocityX;
      currentY += velocityY;

      parallaxTargets.forEach((target) => {
        target.style.setProperty("--pointer-x", currentX.toFixed(3));
        target.style.setProperty("--pointer-y", currentY.toFixed(3));
      });

      const settled =
        Math.abs(targetX - currentX) < 0.001 &&
        Math.abs(targetY - currentY) < 0.001 &&
        Math.abs(velocityX) < 0.001 &&
        Math.abs(velocityY) < 0.001;

      pointerFrame = settled ? 0 : window.requestAnimationFrame(renderPointer);
    };

    const requestPointerRender = () => {
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointer);
    };

    const onPointerMove = (event: PointerEvent) => {
      targetX = Math.max(-0.5, Math.min(0.5, event.clientX / window.innerWidth - 0.5));
      targetY = Math.max(-0.5, Math.min(0.5, event.clientY / window.innerHeight - 0.5));
      requestPointerRender();
    };

    const resetPointer = () => {
      targetX = 0;
      targetY = 0;
      requestPointerRender();
    };

    if (!reducedMotion && precisePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("mouseleave", resetPointer);
      window.addEventListener("blur", resetPointer);
    }

    return () => {
      revealObserver?.disconnect();
      sceneObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", resetPointer);
      window.removeEventListener("blur", resetPointer);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
