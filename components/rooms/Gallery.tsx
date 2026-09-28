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

  // Case 1: 0 valid images
  if (validImages.length === 0) {
    return (
      <div
        role="region"
        aria-label={`Thư viện ảnh phòng ${roomName}`}
        className="w-full h-72 sm:h-96 md:h-[460px] bg-[#F5F5F5] flex flex-col items-center justify-center gap-3 p-8 text-center select-none"
      >
        <div className="w-12 h-12 rounded-full bg-[#E5E5E5] text-[#707072] flex items-center justify-center">
          <DoorOpen className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col items-center max-w-sm">
          <span className="font-medium text-sm text-[#111111]">
            KAPI STAY
          </span>
          <span className="text-xs text-[#707072] mt-1 leading-relaxed">
            Hình ảnh phòng đang được đồng bộ
          </span>
        </div>
      </div>
    );
  }

  // Case 2: Exactly 1 valid image
  if (validImages.length === 1) {
    const singleImage = validImages[0];

    return (
      <>
        <div
          role="region"
          aria-label={`Thư viện ảnh phòng ${roomName}`}
          className="relative w-full h-72 sm:h-96 md:h-[460px] overflow-hidden bg-[#F5F5F5] group cursor-pointer"
          onClick={() => openLightbox(0)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={singleImage}
            alt={`Ảnh phòng ${roomName}`}
            className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-500 ease-out"
            onError={() => handleImageError(singleImage)}
          />

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
            <button
              type="button"
              aria-label={`Xem ảnh lớn phòng ${roomName}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white text-[#111111] font-medium text-xs px-4 py-2 rounded-full flex items-center gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
              <span>Phóng to</span>
            </button>
          </div>

          <div className="absolute bottom-4 right-4">
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

  // Case 3: 2 or more valid images (Editorial Photography Grid)
  const heroImage = validImages[0];
  const secondaryImages = validImages.slice(1, 3);
  const remainingCount = validImages.length - 3;

  return (
    <>
      <div
        role="region"
        aria-label={`Thư viện ảnh phòng ${roomName}`}
        className="w-full space-y-2"
      >
        {/* Editorial sharp photo grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Main Hero Image */}
          <div
            className={cn(
              "relative overflow-hidden bg-[#F5F5F5] group cursor-pointer",
              "h-72 sm:h-96 md:h-[460px]",
              "md:col-span-2"
            )}
            onClick={() => openLightbox(0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt={`Ảnh chính phòng ${roomName}`}
              className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-500 ease-out"
              onError={() => handleImageError(heroImage)}
            />

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
              <button
                type="button"
                aria-label={`Xem ảnh lớn phòng ${roomName}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white text-[#111111] font-medium text-xs px-4 py-2 rounded-full flex items-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
                <span>Xem ảnh lớn</span>
              </button>
            </div>

            <div className="absolute bottom-4 left-4">
              <Badge variant="neutral" size="sm" icon={<Layers className="w-3 h-3" />}>
                {validImages.length} ảnh
              </Badge>
            </div>
          </div>

          {/* Secondary Column on Desktop */}
          <div className="hidden md:flex flex-col gap-2 h-[460px]">
            {secondaryImages.map((src, index) => {
              const actualIndex = index + 1;
              const isLastVisible = index === secondaryImages.length - 1;
              const hasMore = isLastVisible && remainingCount > 0;

              return (
                <div
                  key={src + actualIndex}
                  className="relative flex-1 overflow-hidden bg-[#F5F5F5] group cursor-pointer"
                  onClick={() => openLightbox(actualIndex)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Ảnh ${actualIndex + 1} phòng ${roomName}`}
                    className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-500 ease-out"
                    onError={() => handleImageError(src)}
                  />

                  {hasMore ? (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white transition-colors hover:bg-black/70">
                      <span className="text-xl font-medium">+{remainingCount}</span>
                      <span className="text-xs text-white/80">Xem tất cả</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile Thumbnails Strip */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto py-1 px-0.5 max-w-full">
          {validImages.map((src, idx) => (
            <button
              key={src + idx}
              type="button"
              onClick={() => openLightbox(idx)}
              aria-label={`Xem ảnh ${idx + 1} phòng ${roomName}`}
              className="w-16 h-16 sm:w-20 sm:h-20 overflow-hidden shrink-0 bg-[#F5F5F5] relative transition-opacity hover:opacity-85"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover"
                onError={() => handleImageError(src)}
              />
              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-mono px-1 py-0.2 pointer-events-none">
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
// Internal Lightbox Component
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
      title={<span className="text-base sm:text-lg font-medium text-[#111111] truncate block">{roomName}</span>}
      description={
        <span className="text-xs text-[#707072]">
          Ảnh {currentIndex + 1} / {validImages.length}
        </span>
      }
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        {/* Lightbox Stage */}
        <div className="relative w-full bg-[#111111] overflow-hidden flex items-center justify-center min-h-[260px] sm:min-h-[380px] max-h-[60vh]">
          {currentSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentSrc}
              alt={`Ảnh ${currentIndex + 1} phòng ${roomName}`}
              className="max-h-[58vh] max-w-full w-auto object-contain select-none"
              onError={() => onImageError(currentSrc)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/50 p-8">
              <DoorOpen className="w-8 h-8 mb-2" aria-hidden="true" />
              <span className="text-xs">Không thể tải ảnh</span>
            </div>
          )}

          {/* Previous Button */}
          {validImages.length > 1 && (
            <button
              type="button"
              onClick={onPrev}
              aria-label="Ảnh trước"
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 hover:bg-white text-[#111111] transition-all"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {/* Next Button */}
          {validImages.length > 1 && (
            <button
              type="button"
              onClick={onNext}
              aria-label="Ảnh tiếp theo"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 hover:bg-white text-[#111111] transition-all"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {/* Index Counter */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/75 text-white text-[11px] font-mono px-3 py-1 rounded-full pointer-events-none">
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
                  "w-12 h-12 sm:w-14 sm:h-14 overflow-hidden shrink-0 border transition-all",
                  idx === currentIndex
                    ? "border-[#111111] opacity-100"
                    : "border-transparent opacity-40 hover:opacity-100"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
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

export default Gallery;
