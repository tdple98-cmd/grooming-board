import React, { useEffect, useRef, useState } from "react";

/**
 * Loads src only when the element scrolls into view (reduces signed-URL churn on load).
 */
export function LazyImage({ src, alt = "", style, className, rootMargin = "120px" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [src, rootMargin]);

  return (
    <span ref={ref} style={{ ...style, display: "block", overflow: "hidden" }}>
      {visible && src ? (
        <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
    </span>
  );
}
