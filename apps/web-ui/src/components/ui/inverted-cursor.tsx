"use client";

import React, { useState, useEffect, useRef } from "react";

interface CursorProps {
  size?: number;
}

export const Cursor: React.FC<CursorProps> = ({ size = 60 }) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const previousPos = useRef({ x: -size, y: -size }); // start off-screen
  const targetPos = useRef({ x: -size, y: -size });
  
  const [visible, setVisible] = useState(false);

  // Animation loop for smooth cursor follow
  const animate = () => {
    if (!cursorRef.current) return;

    const currentX = previousPos.current.x;
    const currentY = previousPos.current.y;
    const targetX = targetPos.current.x - size / 2;
    const targetY = targetPos.current.y - size / 2;

    const deltaX = (targetX - currentX) * 0.2;
    const deltaY = (targetY - currentY) * 0.2;

    const newX = currentX + deltaX;
    const newY = currentY + deltaY;

    previousPos.current = { x: newX, y: newY };
    cursorRef.current.style.transform = `translate(${newX}px, ${newY}px)`;

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setVisible(true);
      targetPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseEnter = () => {
      setVisible(true);
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    document.body.style.cursor = "none"; // hide native cursor

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      document.body.style.cursor = "auto"; // restore native cursor
    };
  }, [size]); // animate is stable but position changes, though animate reads refs.

  // We need to ensure animate has access to latest position state or use refs for position too if we want it in loop.
  // Actually, animate reads `position` state. `animate` closes over `position`? 
  // No, `animate` is defined inside render but we need it to access latest state.
  // Best practice: use refs for position target as well to avoid dependency issues in loop.
  
  // Let's fix the implementation to use refs for target position to be safe in animation loop
  // The user provided code uses state `position` in `animate`. 
  // If `animate` is recreated, the `requestAnimationFrame` needs to call the new one.
  // But the user code has `animate` defined in render body.
  // Let's stick to the user's code but maybe optimize it slightly if needed.
  // The user code has `useEffect(() => ... , [animate])`.
  // Since `animate` depends on `position`, it changes on every mouse move.
  // This would cause effect to re-run constantly adding/removing listeners. That's bad.
  
  // I will refactor it slightly to use refs for target position to avoid re-attaching listeners.
  
  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none rounded-full bg-white mix-blend-difference z-[9999] transition-opacity duration-300"
      style={{
        width: size,
        height: size,
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    />
  );
};

export default Cursor;
