"use client";
// גלריית תמונות: מעבר בין תמונות (חיצים, נקודות, החלקה), והגדלה למסך מלא עם זום.
import { useCallback, useEffect, useRef, useState } from "react";

export interface GalleryImage { src: string; alt: string; caption?: string }

export default function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = images.length;
  const go = useCallback((d: number) => { setZoom(false); setI((x) => (x + d + n) % n); }, [n]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") go(1);   // RTL: שמאלה = הבא
      if (e.key === "ArrowRight") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, go]);

  if (n === 0) {
    return (
      <div className="gallery-placeholder" role="img" aria-label={`${title}: תמונות יעלו בקרוב`}>
        <span>{title.slice(0, 1)}</span>
        <small>תמונות יעלו בקרוב</small>
      </div>
    );
  }

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current === null || zoom) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(dx > 0 ? 1 : -1);
      touchX.current = null;
    },
  };
  const img = images[i];

  return (
    <div className="gallery">
      <div className="gallery-main" {...swipe}>
        <button type="button" className="gallery-zoom-btn" onClick={() => setOpen(true)} aria-label="הגדלת התמונה">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.alt} />
        </button>
        {n > 1 && (
          <>
            <button type="button" className="gallery-arrow prev" onClick={() => go(-1)} aria-label="התמונה הקודמת">›</button>
            <button type="button" className="gallery-arrow next" onClick={() => go(1)} aria-label="התמונה הבאה">‹</button>
          </>
        )}
      </div>
      {img.caption && <p className="gallery-caption">{img.caption}</p>}
      {n > 1 && (
        <div className="gallery-thumbs" role="tablist" aria-label="תמונות">
          {images.map((im, k) => (
            <button key={im.src + k} type="button" role="tab" aria-selected={k === i}
              className={k === i ? "active" : ""} onClick={() => { setZoom(false); setI(k); }} aria-label={`תמונה ${k + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.src} alt="" />
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(false)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()} {...swipe}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.src} alt={img.alt} className={zoom ? "zoomed" : ""}
              onClick={() => setZoom((z) => !z)} title={zoom ? "הקטנה" : "הגדלה"} />
          </div>
          <button type="button" className="lightbox-close" onClick={() => setOpen(false)} aria-label="סגירה">×</button>
          {n > 1 && (
            <>
              <button type="button" className="gallery-arrow prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="התמונה הקודמת">›</button>
              <button type="button" className="gallery-arrow next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="התמונה הבאה">‹</button>
              <span className="lightbox-count ltr">{i + 1} / {n}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
