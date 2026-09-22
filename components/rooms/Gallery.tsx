"use client";

import * as React from "react";
import { DoorOpen, Maximize2, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export interface GalleryProps {
  imagePaths: string[];
  roomName: string;
}

export function Gallery({ imagePaths, roomName }: GalleryProps) {
  // Track failed image URLs defensively to avoid broken image icons
  const [failedImages, setFailedImages] = React.useState<Record<string, boolean>>({});
  const [isLightboxOpen, setIsLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);

  // Filter out empty paths and images that encountered 404/load errors
  const validImages = React.useMemo(() => {
    if (!Array.isArray(imagePaths)) return [];
    return imagePaths.filter(
      (path): path is string =>
        typeof path === "string" && path.trim().length > 0 && !failedImages[path]
    );
  }, [imagePaths, failedImages]);

  // Clamp the rendered index without synchronously mutating state in an effect.
  const safeLightboxIndex =
    validImages.length > 0
      ? Math.min(lightboxIndex, validImages.length - 1)
      : 0;

  const handleImageError = React.useCallback((path: string) => {
    setFailedImages((prev) => ({ ...prev, [path]: true }));
  }, []);

  const openLightbox = React.useCallback((index: number) => {
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  }, []);

  const closeLightbox = React.useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  const handlePrevImage = React.useCallback(() => {
    setLightboxIndex((prev) => {
      if (validImages.length === 0) return 0;
      const current = Math.min(prev, validImages.length - 1);
      return current > 0 ? current - 1 : validImages.length - 1;
    });
  }, [validImages.length]);

  const handleNextImage = React.useCallback(() => {
    setLightboxIndex((prev) => {
      if (validImages.length === 0) return 0;
      const current = Math.min(prev, validImages.length - 1);
      return current < validImages.length - 1 ? current + 1 : 0;
    });
  }, [validImages.length]);

  // Handle ArrowLeft and ArrowRight keyboard navigation inside Lightbox
  React.useEffect(() => {
    if (!isLightboxOpen || validImages.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevImage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextImage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, validImages.length, handlePrevImage, handleNextImage]);

  // ---------------------------------------------------------------------------
  // Case 1: 0 valid images (empty array or all images failed to load)
  // ---------------------------------------------------------------------------
  if (validImages.length === 0) {
    return (
      <div
        role="region"
        aria-label={`Thư viện ảnh phòng ${roomName}`}
        className="w-full h-72 sm:h-96 md:h-[400px] rounded-2xl border border-dark/10 bg-light/70 flex flex-col items-center justify-center gap-3 p-8 text-center select-none"
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-2xs">
          <DoorOpen className="w-8 h-8" aria-hidden="true" />
        </div>
        <div className="flex flex-col items-center max-w-sm">
          <span className="font-semibold text-base text-dark">
            Kapi Stay Concierge
          </span>
          <span className="text-xs text-dark/50 mt-1 leading-relaxed">
            Hình ảnh thực tế đang được đồng bộ bởi Kapi House
          </span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Case 2: Exactly 1 valid image
  // ---------------------------------------------------------------------------
  if (validImages.length === 1) {
    const singleImage = validImages[0];

    return (
      <>
        <div
          role="region"
          aria-label={`Thư viện ảnh phòng ${roomName}`}
          className="relative w-full h-72 sm:h-96 md:h-[420px] rounded-2xl overflow-hidden border border-dark/10 bg-light/50 group cursor-pointer"
          onClick={() => openLightbox(0)}
        >
          <img
            src={singleImage}
            alt={`Ảnh phòng ${roomName}`}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500 ease-out"
            onError={() => handleImageError(singleImage)}
          />

          <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/15 transition-colors flex items-center justify-center">
            <button
              type="button"
              aria-label={`Xem ảnh lớn phòng ${roomName}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/95 text-dark font-medium text-xs px-3.5 py-2 rounded-xl shadow-md flex items-center gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              <span>Phóng to ảnh</span>
            </button>
          </div>

          <div className="absolute bottom-3 right-3">
            <Badge variant="neutral" size="sm" icon={<Layers className="w-3 h-3" />}>
              1 ảnh
            </Badge>
          </div>
        </div>

        {/* Lightbox Modal */}
        <LightboxModal
          isOpen={isLightboxOpen}
          onClose={closeLightbox}
          roomName={roomName}
          validImages={validImages}
          currentIndex={safeLightboxIndex}
          onPrev={handlePrevImage}
          onNext={handleNextImage}
          onSelectIndex={setLightboxIndex}
          onImageError={handleImageError}
        />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Case 3: 2 or more valid images
  // ---------------------------------------------------------------------------
  const heroImage = validImages[0];
  const secondaryImages = validImages.slice(1, 3);
  const remainingCount = validImages.length - 3;

  return (
    <>
      <div
        role="region"
        aria-label={`Thư viện ảnh phòng ${roomName}`}
        className="w-full space-y-3"
      >
        {/* Desktop Layout (Grid md:grid-cols-3) & Mobile Stack */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Main Hero Image (Col Span 2 on md) */}
          <div
            className={cn(
              "relative rounded-2xl overflow-hidden border border-dark/10 bg-light/50 group cursor-pointer",
              "h-72 sm:h-80 md:h-[420px]",
              validImages.length === 2 ? "md:col-span-2" : "md:col-span-2"
            )}
            onClick={() => openLightbox(0)}
          >
            <img
              src={heroImage}
              alt={`Ảnh chính phòng ${roomName}`}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500 ease-out"
              onError={() => handleImageError(heroImage)}
            />

            <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/15 transition-colors flex items-center justify-center">
              <button
                type="button"
                aria-label={`Xem ảnh lớn phòng ${roomName}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/95 text-dark font-medium text-xs px-3.5 py-2 rounded-xl shadow-md flex items-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>Xem ảnh lớn</span>
              </button>
            </div>

            <div className="absolute bottom-3 left-3">
              <Badge variant="neutral" size="sm" icon={<Layers className="w-3 h-3" />}>
                {validImages.length} ảnh
              </Badge>
            </div>
          </div>

          {/* Secondary Column on Desktop (Hidden on mobile) */}
          <div className="hidden md:flex flex-col gap-3 h-[420px]">
            {secondaryImages.map((src, index) => {
              const actualIndex = index + 1;
              const isLastVisible = index === secondaryImages.length - 1;
              const hasMore = isLastVisible && remainingCount > 0;

              return (
                <div
                  key={src + actualIndex}
                  className="relative flex-1 rounded-2xl overflow-hidden border border-dark/10 bg-light/50 group cursor-pointer"
                  onClick={() => openLightbox(actualIndex)}
                >
                  <img
                    src={src}
                    alt={`Ảnh ${actualIndex + 1} phòng ${roomName}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    onError={() => handleImageError(src)}
                  />

                  {hasMore ? (
                    <div className="absolute inset-0 bg-dark/60 backdrop-blur-2xs flex flex-col items-center justify-center text-white transition-colors hover:bg-dark/70">
                      <span className="text-xl font-bold">+{remainingCount}</span>
                      <span className="text-xs font-medium text-white/80">Xem tất cả</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/15 transition-colors" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile Thumbnails Strip (Scrollable without page overflow) */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto py-1 px-0.5 max-w-full">
          {validImages.map((src, idx) => (
            <button
              key={src + idx}
              type="button"
              onClick={() => openLightbox(idx)}
              aria-label={`Xem ảnh ${idx + 1} phòng ${roomName}`}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 border border-dark/10 bg-light/50 relative active:scale-95 transition-transform"
            >
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover"
                onError={() => handleImageError(src)}
              />
              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-sm pointer-events-none">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      <LightboxModal
        isOpen={isLightboxOpen}
        onClose={closeLightbox}
        roomName={roomName}
        validImages={validImages}
        currentIndex={safeLightboxIndex}
        onPrev={handlePrevImage}
        onNext={handleNextImage}
        onSelectIndex={setLightboxIndex}
        onImageError={handleImageError}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Internal Lightbox Component reusing components/ui/Modal
// ---------------------------------------------------------------------------
interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  validImages: string[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onSelectIndex: (index: number) => void;
  onImageError: (path: string) => void;
}

function LightboxModal({
  isOpen,
  onClose,
  roomName,
  validImages,
  currentIndex,
  onPrev,
  onNext,
  onSelectIndex,
  onImageError,
}: LightboxModalProps) {
  const currentSrc = validImages[currentIndex] || "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={<span className="text-base sm:text-lg font-bold text-dark truncate block">{roomName}</span>}
      description={
        <span className="text-xs text-dark/60 font-medium">
          Ảnh {currentIndex + 1} / {validImages.length}
        </span>
      }
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        {/* Lightbox Stage */}
        <div className="relative w-full bg-dark/95 rounded-xl overflow-hidden flex items-center justify-center min-h-[260px] sm:min-h-[380px] max-h-[60vh]">
          {currentSrc ? (
            <img
              src={currentSrc}
              alt={`Ảnh ${currentIndex + 1} phòng ${roomName}`}
              className="max-h-[58vh] max-w-full w-auto object-contain select-none"
              onError={() => onImageError(currentSrc)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/50 p-8">
              <DoorOpen className="w-10 h-10 mb-2" aria-hidden="true" />
              <span className="text-xs">Không thể tải ảnh</span>
            </div>
          )}

          {/* Previous Button */}
          {validImages.length > 1 && (
            <button
              type="button"
              onClick={onPrev}
              aria-label="Ảnh trước"
              className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-full bg-white/80 hover:bg-white text-dark shadow-md transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
          )}

          {/* Next Button */}
          {validImages.length > 1 && (
            <button
              type="button"
              onClick={onNext}
              aria-label="Ảnh tiếp theo"
              className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-full bg-white/80 hover:bg-white text-dark shadow-md transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
          )}

          {/* Floating Index Counter */}
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xs text-white text-[11px] font-medium px-2.5 py-0.5 rounded-full pointer-events-none">
            {currentIndex + 1} / {validImages.length}
          </div>
        </div>

        {/* Thumbnail Selector Strip */}
        {validImages.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 justify-center max-w-full">
            {validImages.map((src, idx) => (
              <button
                key={src + idx}
                type="button"
                onClick={() => onSelectIndex(idx)}
                aria-label={`Chuyển đến ảnh ${idx + 1}`}
                className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all",
                  idx === currentIndex
                    ? "border-primary scale-105 shadow-xs"
                    : "border-transparent opacity-50 hover:opacity-100"
                )}
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => onImageError(src)}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
